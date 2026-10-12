# E2 — Bot age no grupo (mudar categoria e conta avulsa), com confirmação

**Data:** 12/10/2026 · **Base:** E1 (`feat/e1-bot`, PR #17) · **Aprovado em conversa:** ações, confirmação "sim", abordagem A e desenho (12/10).

## Por quê

Depois de perguntar (E1), o casal quer corrigir pelo WhatsApp o que hoje só se corrige no painel: a categoria de um lançamento e uma conta avulsa do mês. O risco novo é **gravar errado** por um mal-entendido do modelo; o desenho garante que nada é gravado sem um "sim" explícito de quem pediu, e que tudo tem desfazer.

Escopo dividido: **E2** = mudar categoria + conta avulsa + a mecânica de proposta/confirmação/desfazer. **E3** (depois) = gasto em dinheiro, reaproveitando a mecânica. "Marcar conta paga" ficou fora (decisão do Matheus: o banco confirma).

## Decisões

| Tema | Decisão |
|---|---|
| Ações | Mudar categoria (só este / todos da pessoa ou empresa / todos com o texto) e conta avulsa no mês |
| Confirmação | O bot mostra o que vai fazer e espera **"sim"** de quem pediu, em até **5 min** |
| Quem grava | **O worker**, não o modelo: o modelo só cria propostas; o "sim" é lido por código |
| Desfazer | `bot desfaz` reverte a última ação feita por quem pede, nas últimas 24 h |

## Fluxo

1. Pergunta chega pelo filtro do E1 (grupo, membro, chamado).
2. **Antes do agente**, o worker olha se a mensagem é resposta a uma proposta:
   - existe proposta **pendente** da mesma pessoa, criada há ≤ 5 min, e o texto (sem o "bot", sem pontuação, minúsculo) é `sim | s | confirma | pode | ok` → **executa**;
   - `não | nao | n | cancela` → **cancela** ("❌ Cancelado.");
   - `desfaz | desfazer` (com "bot") → **desfaz** a última ação `feita` da pessoa nas últimas 24 h;
   - um número `1`–`5` quando a última resposta do bot à pessoa foi uma lista de candidatos (≤ 5 min) → vira a escolha e volta ao agente com o contexto.
   - "sim/não/número" **sem** "bot" só passam pelo filtro quando a pessoa tem algo pendente (proposta ou lista) — fora disso, continuam ignorados.
3. Senão, o agente do E1 roda com as ferramentas novas (abaixo). Se a rodada terminar com uma **proposta criada**, a resposta é o texto de confirmação montado pelo sistema (não o do modelo).
4. Execução: o worker chama `POST /api/bot/executar` com o id da proposta; o painel grava com as funções de sempre e devolve o que mudou; o worker responde "✅ Feito: …. Errado? *bot desfaz*".

## Ferramentas novas (o modelo vê)

| Ferramenta | Faz | Grava? |
|---|---|---|
| `buscar_lancamentos(texto?, valor?, periodo?, pessoa?)` | até 5 despesas que casam (descrição sem CPF/CNPJ, data, valor, pessoa, categoria atual); cada uma com uma `ref` curta (`L1`…`L5`) válida só nesta conversa | não |
| `propor_categoria(ref, categoria, escopo)` | `escopo` ∈ `este \| pessoa \| texto`; `categoria` ∈ lista `CATEGORIAS_PAINEL` (enum, nomes em português no schema); calcula a prévia ("muda N") com `previaRegra` e cria a proposta | **não** (só proposta) |
| `propor_conta_avulsa(nome, valor, mes?, pessoa?)` | `valor` 0,01–100.000; `mes` = este mês por padrão (aceita `AAAA-MM` atual ou próximo); `pessoa` = quem pediu por padrão; cria a proposta | **não** |

- As `ref` mapeiam para o `id_transacao` real só no worker (o modelo nunca vê nem inventa id); ref desconhecida → erro de ferramenta.
- Escopo `pessoa` sem documento da contraparte, ou `texto` sem texto útil → a prévia devolve o erro do painel e o modelo recebe a mensagem.
- Uma proposta pendente por pessoa: criar outra substitui a anterior (que vira `substituida`).

## Textos (montados pelo sistema)

- Lista: "🔎 Achei estes. Qual? *responde o número*\n1) 10/10 PIX FULANO R$ 50,00 (Matheus, Transferências)\n2) …"
- Proposta categoria: "🟡 Mudar *N* lançamento(s) para *Mercado* (todos da pessoa/empresa: FULANO)? Responde *sim* ou *não*." — `este` diz "só este (10/10 PIX FULANO R$ 50,00)".
- Proposta avulsa: "🟡 Pôr a conta avulsa *Dentista R$ 150,00* em out/26 (Ariane)? Responde *sim* ou *não*."
- Feito: "✅ Feito: 3 lançamento(s) → Mercado. Errado? *bot desfaz*" / "✅ Feito: Dentista R$ 150,00 nas contas de out/26. Errado? *bot desfaz*". Com o link da tela (`/gastos` ou `/contas`).
- Expirada (sim depois de 5 min): "⌛ Essa proposta expirou. Pede de novo."
- Desfeito: "↩️ Desfeito: …". Nada para desfazer: "Nada para desfazer nas últimas 24 h."

## Execução e desfazer (painel)

- `POST /api/bot/executar { id }`: lê a proposta em `financas_bot_acoes`; só executa se `estado = 'confirmada'` (o worker marca `confirmada` ao ler o "sim", na mesma transação de leitura); executa e grava `estado = 'feita'`, `resultado`.
  - Categoria: antes de `salvarRegra`, guarda a regra que já existia para a mesma chave (`tipo`, `chave`, `categoria`) ou `null`. **Desfazer**: se existia, regrava a categoria anterior; se não, `apagarRegra(id)`.
  - Conta avulsa: `criarMarca({ mes, contaId: null, responsavel, nome, valor, pago: false })`; desfazer = `apagarMarca(id)`.
- `POST /api/bot/desfazer { id }`: só ação `feita` há ≤ 24 h; grava `estado = 'desfeita'`.
- As rotas usam o `writerPool` (`dash_writer`) como as telas; recusam qualquer outra coisa (`400`).

## Registro

Migração `010_bot_acoes.sql`: `financas_bot_acoes` (`id`, `criado_em`, `pessoa`, `tipo` ∈ `categoria|avulsa`, `params jsonb`, `resumo text`, `estado` ∈ `pendente|confirmada|feita|cancelada|expirada|substituida|desfeita|erro`, `resultado jsonb`, `atualizado_em`). `pluggy_worker`: SELECT/INSERT/UPDATE; `dash_writer`: SELECT/UPDATE; `bot_readonly`: SELECT. Sem telefone/JID. Pendentes com mais de 5 min viram `expirada` (na leitura). Mantém 1 ano.

## Segurança

- O modelo nunca grava: só `propor_*`. A rota de escrita só aceita proposta `confirmada` pelo worker.
- Confirmação, cancelamento e desfazer são lidos por código, com regras fixas; o modelo não participa.
- Só quem pediu confirma; só o próprio desfaz a própria ação.
- Categoria só da lista do painel; valor da avulsa validado; mês só o atual ou o próximo.
- Trava de número do E1 vale para a resposta do modelo; os textos de proposta/feito são montados pelo sistema.

## Fora do escopo

Gasto em dinheiro (E3), marcar conta paga, "é/não é dívida", desfazer de ações de outra pessoa, ações no privado.

## Testes

- **Confirmação:** sim/não/variações; sim de outra pessoa não executa; sim depois de 5 min → expirada; sim sem pendência é ignorado (filtro); segunda proposta substitui a primeira.
- **Lista de candidatos:** número escolhe; número fora da lista → pergunta de novo; ref inventada pelo modelo → erro.
- **Propostas:** prévia "muda N"; escopo inválido; categoria fora da lista; valor/mês da avulsa fora da faixa.
- **Executar/desfazer (integração):** categoria nova → desfaz apaga a regra; categoria sobre regra existente → desfaz restaura a anterior; avulsa → desfaz apaga; executar proposta não confirmada → 400; desfazer depois de 24 h ou de outra pessoa → recusado.
- **Agente:** o modelo nunca chama escrita (não existe ferramenta de escrita no schema); rodada que cria proposta responde com o texto montado.
- **Produção:** no grupo de teste, janela com webhook ligado: mudar categoria de um lançamento (só este) e desfazer; criar e desfazer uma avulsa; uma proposta cancelada e uma expirada; conferir no painel e em `financas_bot_acoes`.
