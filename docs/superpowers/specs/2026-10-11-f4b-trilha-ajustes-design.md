# F4b — Ajustes da trilha: metas e "é / não é dívida"

Data: 11/10/2026 · Projeto: Finanças do Casal · Complemento do F3 (trilha) e do F4 (categorias pelo painel).

## Objetivo

Deixar o casal corrigir a trilha pelo painel: marcar o que a regra automática errou sobre dívida ("não é dívida" / "é dívida") e ajustar as metas da reserva e do patrimônio — sem SQL na mão, com desfazer.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Dívida | **"Não é dívida"** no cartão de dívidas da `/trilha` e **"Isto é dívida"** na folha "Mudar categoria" (F4); desfazível na tela Regras |
| Metas editáveis | **Meses da reserva** (padrão 6; 1–24) e **% da renda para patrimônio** (padrão 10%; 1–50%), num "ajustar meta" no próprio cartão |

## 1. Dados — migração `007_trilha_ajustes.sql`

- `financas_trilha_config (chave text PRIMARY KEY, valor numeric NOT NULL, atualizado_em timestamptz DEFAULT now())` — chaves `meses_reserva` e `meta_patrimonio` (fração: 0,10 = 10%). Sem linha → padrão do código.
- `financas_divida_marcacao (id serial PK, tipo text CHECK (tipo IN ('nao_divida','divida')), chave text NOT NULL, nome text, criado_em timestamptz DEFAULT now(), UNIQUE (tipo, chave))` — `chave` = a chave de grupo que a trilha já usa: `nomeDivida(descricao) + '|' + banco` (descrição minúscula sem dígitos, "/" e "."; espaços normalizados). Marcar uma parcela vale para o parcelamento inteiro. Marcar um tipo apaga a marcação do tipo oposto para a mesma chave.
- Grants (guardados por `pg_roles`, como na 006): `dash_writer` SELECT/INSERT/UPDATE/DELETE nas duas tabelas e USAGE na sequência; `bot_readonly` SELECT.

## 2. Regra (puras, testadas — `src/lib/trilha.ts`)

- `chaveDivida(descricao, banco)` exportada (a mesma de `agruparDividas`).
- `agruparDividas(lancs, hoje, marcas = { nao: Set<string>, sim: Set<string> })`: um lançamento entra se `(ehDivida(...) || marcas.sim.has(chave)) && !marcas.nao.has(chave)`. O resto da regra (futuras, débito sem fim) não muda.
- `avaliarTrilha(d)` usa `d.metas = { mesesReserva, metaPatrimonio }` (padrões 6 e 0,1) no lugar das constantes `MESES_RESERVA` e `META_PATRIMONIO`; textos ("6 × gasto travado", "Aplicar 10% do que entra") passam a mostrar o valor em uso. `Trilha.reserva` ganha `meses`.
- `validarMeta(chave, valor)`: `meses_reserva` inteiro 1–24; `meta_patrimonio` 1–50 (em %, gravado como fração). Erros em português.

## 3. Escrita e leitura (`queries.ts` + API)

- `getTrilhaDados` lê as marcações e as metas e passa adiante (`DadosTrilha.metas`, marcas para `agruparDividas`).
- `marcarDivida({ tipo, idTransacao? , chave? })`: "é dívida" vem da folha (o servidor monta a chave pelo lançamento); "não é dívida" vem da `/trilha` com a chave do grupo exibido (a chave não tem documento — é descrição + banco). Upsert + apaga a do tipo oposto. Devolve `{ id }`.
- `apagarMarcacao(id)`, `salvarMeta(chave, valor)`, `apagarMeta(chave)` (volta ao padrão), `listarAjustesTrilha()` (para a tela Regras).
- Rotas: `POST /api/trilha/divida`, `DELETE /api/trilha/divida/:id`, `POST /api/trilha/meta`, `DELETE /api/trilha/meta/:chave`. Validação no servidor; erros em português; `writerPool`.

## 4. Telas

- **`/trilha` → cartão Dívidas:** cada dívida com "não é dívida" (confirmação: "Tirar *nome* da trilha? Dá para desfazer na tela Regras."); a página recarrega.
- **`/trilha` → Reserva e Patrimônio:** "ajustar meta" abre um campo numérico (meses / %) com os limites e Salvar; mostra "padrão" quando não alterada.
- **Folha "Mudar categoria" (F4):** link/botão "Isto é dívida (entra na trilha)" abaixo do Salvar; após marcar, mensagem "Marcado como dívida. Desfazer".
- **Tela Regras:** nova seção "Trilha" listando marcações (tipo, nome) e metas alteradas (valor), cada uma com Apagar.
- Alvos ≥ 44px; valores de meta não são dinheiro (sem `money`).

## 5. Aceite e testes

- Unitários: marcação "não é dívida" tira um grupo detectado (e a fase 1 pode fechar); "é dívida" inclui um grupo não detectado; metas mudam meta da reserva e texto do patrimônio; `validarMeta` com limites e tipos.
- Integração: marcar/apagar; marcar o tipo oposto substitui; `getTrilhaDados` respeita marcas e metas; meta fora do limite recusada.
- Componentes: botão "não é dívida", "ajustar meta", opção nova da folha, seção Trilha da tela Regras.
- Produção: migração 007 (aditiva, sem backup de dados necessário além da cópia de imagem do painel); rotas em 200.

## Fora do F4b

Limite para ignorar atrasos pequenos; editar meses de sobra e janela de atraso; reserva em valor fixo.
