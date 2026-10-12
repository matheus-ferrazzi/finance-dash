# F4 — Categorias pelo painel

Data: 11/10/2026 · Projeto: Finanças do Casal · Parte 4 do F (F1 home → F2 previsão → F3 trilha → **F4 categorias**). Metas da trilha e "isso é/não é dívida" ficam para um F4b.

## Objetivo

Corrigir a categoria de um lançamento pelo próprio painel — no celular, por qualquer um dos dois — e, se quiser, transformar a correção em regra (pela pessoa/empresa ou pelo texto), com prévia de quantos lançamentos mudam, valendo em todas as telas, na previsão, nos bots e nas próximas ingestões. Ver e desfazer tudo numa tela "Regras".

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Escopo | **Só categorias** (metas e dívida → F4b) |
| Alcance da regra do painel | **Manda** mesmo quando o banco mandou uma categoria não vaga. Regras antigas (SQL) continuam só para as vagas |
| Opções ao corrigir | **Só este lançamento · todos desta pessoa/empresa (CPF/CNPJ) · todos com este texto**, com prévia |
| Onde a correção vale | **Gravada no lançamento** (abordagem A): `categoria_banco` guarda o original; `categoria` vira a efetiva. Nenhuma consulta de leitura muda |
| Desfazer | **Tela "Regras" no Mais** + "Desfazer" logo após salvar |

## 1. Dados

Migração `006_categorias_painel.sql` (backup da tabela antes; roda primeiro numa cópia, com contagem antes × depois):

- `financas_lancamentos.categoria_banco text` — a categoria vinda do banco, já com as correções fixas do código (`corrigirCategoria`). Preenchida com a `categoria` atual. `categoria` passa a ser a efetiva.
- `financas_categoria_painel` — o que foi feito pelo painel:
  `id serial`, `tipo text` (`'lancamento' | 'doc' | 'texto'`), `chave text` (id da transação, documento só com dígitos, ou o texto em maiúsculas), `categoria text`, `nome text` (o que a tela mostra: descrição, nome da contraparte ou o texto), `afetados int`, `criado_em timestamptz`. Único por (`tipo`, `chave`): corrigir de novo a mesma chave substitui.
- Permissões: `SELECT, INSERT, UPDATE, DELETE` para `dash_writer`; `SELECT` para `bot_readonly`; o worker já escreve em `financas_lancamentos`.

## 2. Precedência (uma função só)

`src/lib/categoriaPainel.ts` — pura, testada, usada pelo painel **e** pelo worker:

`categoriaEfetiva(l: { id, descricao, contraparteDoc, categoriaBanco }, regras): { categoria, origem: 'lancamento' | 'doc' | 'texto' | 'banco' }`

1. correção "só este lançamento" (`tipo='lancamento'`, `chave = id`);
2. regra por pessoa/empresa (`tipo='doc'`, `chave = contraparteDoc`, documento não vazio);
3. regra por texto (`tipo='texto'`, descrição sem acento em maiúsculas contém a chave; a chave mais longa ganha; empate → a mais recente);
4. senão, `categoriaBanco` (as regras antigas de SQL continuam valendo para as vagas pela `categoria_efetiva` na leitura, como hoje).

Junto com a categoria, a **classe** é recalculada com o mesmo `classificar` do worker (ex.: virar `Investments` faz a classe ir para aplicação). `classificar` sai de `src/worker/classificar.ts` sem mudança de comportamento (o painel importa de lá).

Chave de texto: mínimo 3 caracteres depois de tirar espaços; sem acento, maiúscula; o painel sugere a descrição sem dígitos e sem `*`/`/`.

## 3. Escrita pelo painel

- `POST /api/categorias/previa` `{ tipo, chave | idTransacao, categoria }` → `{ afetados, porCategoria: {categoriaAtual: n} }` — a mesma seleção que a gravação usa.
- `POST /api/categorias` (mesmo corpo) → numa transação: grava/substitui a regra, seleciona os lançamentos que ela alcança, recalcula `categoria` e `classe` de cada um pela função da §2 (considerando todas as regras, não só a nova) e atualiza só os que mudaram; grava `afetados`. Devolve `{ id, afetados }`.
- `DELETE /api/categorias/:id` → apaga a regra e recalcula os lançamentos que ela alcançava (voltam ao banco ou a outra regra que ainda valha). Devolve `{ afetados }`.
- Regra por pessoa: o documento vem do lançamento escolhido (o cliente manda só o `idTransacao`; o servidor lê o documento). **O documento nunca vai para o cliente**, nem na resposta, nem na URL.
- Validação: categoria tem que estar na lista conhecida (`CAT_PT`); `tipo` válido; texto ≥ 3; lançamento existe. Erros em português, como o cadastro de compromissos.
- Escrita pelo `writerPool` (`dash_writer`).

## 4. Worker

- No início de cada execução, carrega `financas_categoria_painel` (uma consulta).
- `montarLinha` passa a gravar `categoria_banco = corrigirCategoria(...)` e `categoria`/`classe` pela função da §2 — a Pluggy reenviando um lançamento não desfaz a correção.
- `CAMPOS_PARIDADE` não muda; a reconciliação compara com a categoria efetiva (sem idas e vindas).
- Dry-run antes do deploy: com as regras de hoje (nenhuma do painel), 0 lançamentos alterados.

## 5. Telas

**Folha "Mudar categoria"** (sobe do rodapé no celular; janela no computador):
- abre ao tocar num lançamento em **Gastos** (dentro da categoria aberta) e em **Buscar**; a linha ganha um ✎;
- topo: descrição, data, valor (`money`) e a categoria atual com a origem ("do banco" / "regra por pessoa" / "regra por texto" / "corrigido à mão");
- **Nova categoria**: lista em português agrupada como em Gastos, com busca, as mais usadas primeiro;
- **Aplicar a**: "Só este lançamento" · "Todos de *Nome*" (só com documento; mostra o nome, nunca o número) · "Todos com o texto *[ ]*" (pré-preenchido, editável);
- **Prévia** ao escolher: "Muda N lançamentos (a de X, b de Y) → Z";
- **Salvar**: toast "Feito: N lançamentos agora em Z · Desfazer" e a tela atualiza (`router.refresh`).

**Tela "Regras"** (`/regras`, no Mais): lista do mais recente ao mais antigo — tipo, nome/texto, categoria, quantos, quando; apagar com confirmação ("os N lançamentos voltam para a categoria do banco"). Regras antigas de SQL não aparecem.

Alvos de toque ≥ 44px; seletor de mês escondido em `/regras`.

## 6. Aceite e testes

- Unitários (§2): só este > pessoa > texto > banco; texto mais longo ganha; regra manda em categoria não vaga; documento vazio não casa; classe recalculada (`Investments` → aplicação); chave de texto normalizada (acento, caixa).
- Integração: criar regra muda `categoria` e `classe` e devolve a contagem; prévia = contagem gravada; corrigir de novo a mesma chave substitui; apagar devolve a categoria do banco (ou de outra regra); `montarLinha` com regra do painel grava a efetiva e `categoria_banco` (simula o reenvio da Pluggy); a migração preenche `categoria_banco`.
- Componentes: folha (três opções; "todos de" só com documento; nenhum número de documento no HTML) e tela Regras.
- Antes do deploy: migração numa cópia do banco (contagem antes × depois, `categoria_banco = categoria` em 100% das linhas); dry-run do worker = 0 alterados.
- Deploy: backup do banco (tabela) + tags de imagem do painel e do worker; prévia no celular; rotas em 200.

## Fora do F4

Metas da trilha e "isso é/não é dívida" (F4b); editar regras antigas de SQL; criar categorias novas; regra por valor ou por conta.
