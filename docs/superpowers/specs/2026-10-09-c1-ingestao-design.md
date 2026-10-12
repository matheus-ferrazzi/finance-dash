# C1 — Ingestão da Pluggy no app (sai do n8n)

Data: 2026-10-09 · Status: aprovado em conversa ("pode atacar"), aguardando revisão do spec escrito

## Objetivo

Trocar os quatro workflows de ingestão do n8n (`Finance 2.0`, `Pluggy - Faturas Cartão de Crédito`,
`Pluggy - Investimentos`, `Pluggy - Saldos das Contas`) e o script `sync_pluggy.sh` por um **worker
TypeScript neste repositório**, que:

1. produz **exatamente o mesmo resultado** nas tabelas que o painel lê hoje (paridade);
2. **guarda os campos que a Pluggy manda e hoje se perdem** (parcela, fatura, contraparte, loja,
   categoria hierárquica, tipo de operação);
3. **reconcilia** o banco com a Pluggy: lançamento que a Pluggy apagou ou recriou com `id` novo deixa
   de contar como gasto.

Fora do escopo: os 12 bots continuam no n8n (projeto C2); classificação nova (projeto B);
webhooks da Pluggy (exigem endpoint público).

## Por que agora

- A ingestão atual olha só **15 dias para trás**. Compra no cartão só vira `POSTED` quando a fatura
  fecha. Em 09/10/2026 havia **125 lançamentos `PENDING` com mais de 10 dias**, a maioria de cartão.
  O painel ignora `status_pluggy`; se a Pluggy cancelou ou recriou
  algum, ele continua contando como gasto.
- A lista de contas está chumbada em **quatro lugares** (os três workflows + `sync_pluggy.sh`). Foi uma
  lista dessas que congelou o selo do Inter por 41 dias.
- O item do Inter tem `nextAutoSyncAt = null` (sem sincronização automática configurada) e não
  atualiza desde 16/09/2026.
- Projetos A, B, D e E dependem dos campos que hoje são descartados.

## Arquitetura

```
src/worker/
  index.ts          agendador (fuso America/Sao_Paulo explícito) + entrada de CLI
  pluggy.ts         cliente HTTP da Pluggy (auth, paginação, retry)
  contas.ts         carrega pluggy_contas; descobre conta nova de item conhecido
  transacoes.ts     busca janela, monta linha de financas_lancamentos, reconcilia
  classificar.ts    porta fiel de corrigirCategoria() + classificar() do Finance 2.0
  faturas.ts        porta do workflow de faturas + histórico de faturas
  saldos.ts         porta do workflow de saldos
  investimentos.ts  porta do workflow de investimentos
  itens.ts          status dos itens (substitui sync_pluggy.sh) + pedido de atualização
  db.ts             pool do papel pluggy_worker
  execucao.ts       registro de cada execução em pluggy_execucoes
```

- Mesmo `Dockerfile`, novo estágio `worker`: `esbuild` empacota `src/worker/index.ts` num único
  `dist/worker.js`; o container roda `node dist/worker.js`. O painel não muda.
- Novo serviço `finance-worker` no `docker-compose.yml`, na rede `n8n_network`, **sem porta publicada**,
  `restart: unless-stopped`. Credenciais da Pluggy e do banco vêm do `.env` do stack.
- Agendador: `croner` com `timezone: 'America/Sao_Paulo'`. Acaba a classe de erro n8n-SP × crontab-UTC.

## Agenda (horário de São Paulo)

| Tarefa | Quando | Substitui |
|---|---|---|
| Transações (janela + reconciliação) | 16:05 e 22:05 | `Finance 2.0` (16:00, 22:00) |
| Faturas | 16:15 e 22:15 | workflow de faturas (16:10, 22:10) |
| Investimentos | 16:25 e 22:25 | workflow de investimentos (16:20, 22:20) |
| Saldos | 16:35 e 22:35 | workflow de saldos (16:30, 22:30) |
| Status dos itens (selo) | :09 de 14h a 22h | `sync_pluggy.sh` (cron UTC `9 17-23,0,1`) |
| Pedido de atualização de item sem auto-sync | 1×/dia, 13:00 | — (novo; resolve o Inter) |

CLI para operação manual: `node dist/worker.js <tarefa> [--dry-run] [--desde AAAA-MM-DD]`.

## Modelo de dados (migração `db/migrations/001_c1_ingestao.sql`)

Tudo aditivo. Nenhuma coluna existente muda de tipo ou de significado.

**`pluggy_contas`** — fonte única da lista de contas.
`account_id` (pk), `item_id`, `banco`, `responsavel`, `forma` (`Crédito`/`Débito`), `tipo_pluggy`,
`ativo`, `criado_em`. Semeada por `db/seed_contas.local.sql`, **fora do git** (repositório público).
Conta nova num item já conhecido é inserida sozinha (`ativo=true`) e registrada na execução.

**`pluggy_itens`** — `item_id` (pk), `banco`, `responsavel`, `status`, `execution_status`,
`last_updated_at`, `next_auto_sync_at`, `consent_expires_at`, `checado_em`.

**`pluggy_transacoes`** — dado cru. `id` (pk), `account_id`, `raw jsonb`, `primeira_vez`,
`ultima_vez`, `removida_em`. **Sem GRANT para `bot_readonly`** (contém CPF e conta de terceiros).

**`financas_lancamentos`** ganha colunas anuláveis:
`account_id`, `parcela_numero`, `parcela_total`, `data_compra`, `fatura_id`, `fatura_prevista`
(`AAAA-MM`), `contraparte_nome`, `contraparte_doc`, `loja_cnpj`, `loja_cnae`, `categoria_id`,
`tipo_operacao`, `transferencia_casal` (bool), `visto_pluggy_em`.
`transferencia_casal` = documento do pagador e do recebedor pertencem aos titulares das contas
(CPFs lidos de `/identity` em memória a cada execução, **nunca gravados**).

**`financas_lancamentos_removidos`** — `id`, `id_transacao`, `dados jsonb` (a linha inteira via
`to_jsonb`), `removido_em`, `motivo`. Reconciliação **move** a linha para cá. Guardar como JSON
deixa o "mover" imune a coluna nova em `financas_lancamentos`; reverter é
`INSERT … SELECT (jsonb_populate_record(NULL::financas_lancamentos, dados)).*`.

**`financas_faturas_historico`** — `id` (pk, id da fatura), `account_id`, `vencimento`, `total`,
`minimo`, `encargos jsonb`, `pagamentos jsonb`, `atualizado_em`.

**`pluggy_execucoes`** — `id`, `tarefa`, `inicio`, `fim`, `ok`, `modo` (`sombra`/`real`/`dry-run`),
`contagens jsonb`, `erro`.

**Nomes:** `Itaú` passa a ser o nome canônico. Uma migração **separada**, aplicada só na virada
(`002_virada.sql`), renomeia `Itau` → `Itaú` em `financas_sync` e `financas_sync_log` (só essas usam a
grafia sem acento). Não pode ir na 001: o `sync_pluggy.sh` continua rodando durante o modo sombra e
recriaria a linha `Itau`, deixando a `Itaú` parada e o selo vermelho.

**Flags de coleta em `pluggy_contas`:** `coleta_transacoes`, `coleta_saldo`, `coleta_faturas`,
`coleta_investimentos`, semeadas a partir das listas atuais de cada workflow. Paridade exata: hoje a
fatura do Bradesco não é coletada e o item do Neon não entra em investimentos.

**Papel `pluggy_worker`:** `SELECT/INSERT/UPDATE` nas tabelas de ingestão e `pluggy_*`;
`DELETE` só em `financas_lancamentos` (para mover) e `pluggy_*`. Senha definida pelo Matheus.

## Transações e reconciliação

Por conta ativa, a cada execução:

1. Busca **todas as páginas** de `/transactions?accountId=&from=<hoje − 60 dias>` (sem `to`, para
   incluir parcelas futuras). `pageSize=500`.
2. Para cada transação: grava o cru (`pluggy_transacoes`), monta a linha de `financas_lancamentos`
   com a **mesma regra do Finance 2.0** (ver Classificação) mais as colunas novas, e faz upsert por
   `id_transacao`.
3. **Reconcilia** a janela: linha de `financas_lancamentos` da conta com `data_lancamento >= from` que
   **não veio** na resposta é movida para `financas_lancamentos_removidos` (`motivo='sumiu_da_pluggy'`).

Travas da reconciliação (qualquer uma aborta a remoção daquela conta e registra na execução):

- alguma página falhou ou veio incompleta (`page < totalPages` sem resultado);
- a conta devolveu **zero** transações na janela, tendo linhas no banco;
- a remoção passaria de **20%** das linhas da conta na janela.

Linha antiga sem `account_id` é atribuída à conta pela combinação `banco + responsavel + forma`
(que é única por conta hoje — verificado em 09/10/2026).

**Recarga inicial:** a mesma rotina com `--desde` = 24 meses atrás, executada uma vez em `--dry-run`
(relatório do que seria inserido, alterado e removido) antes da execução real.

## Classificação (paridade)

`corrigirCategoria(cat, desc)` e `classificar(cat, desc, saida, forma, dono)` são portadas
literalmente do nó "Code in JavaScript" do `Finance 2.0`, incluindo as listas de nomes e palavras.

Prova de paridade, em duas camadas:

1. **Testes unitários** (vitest) com casos sintéticos cobrindo cada ramo das duas funções.
   Sem dado real no repositório (é público).
2. **Equivalência sobre dado real**, rodada na VPS: `scripts/equivalencia.ts` aplica a função antiga
   (o JS extraído do workflow, avaliado isoladamente) e a nova sobre as transações cruas de 24 meses e
   exige **zero divergências** em `categoria` e `classe`. Resultado só em contagens.

## Faturas, saldos, investimentos

Portas literais dos três workflows, com uma mudança cada:

- **Faturas:** além de `financas_faturas` (fatura atual), grava **todas** as faturas devolvidas em
  `financas_faturas_historico`.
- **Saldos:** a lista de contas vem de `pluggy_contas` (`forma='Débito'`).
- **Investimentos:** itens vêm de `pluggy_contas`; `banco` usa o nome canônico.

## Status dos itens

Substitui `sync_pluggy.sh` com a mesma semântica em `financas_sync` e `financas_sync_log`
(insere no log só quando `lastUpdatedAt` muda), mais `pluggy_itens`. Uma vez por dia, para item com
`next_auto_sync_at` nulo e `last_updated_at` com mais de 26 h, pede atualização (`PATCH /items/{id}`)
e registra na execução.

## Erros

- Pluggy: retry com espera exponencial (3 tentativas) em 429/5xx/timeout; 4xx não repete.
- Falha numa conta não derruba as outras; a execução termina com `ok=false` e o erro registrado.
- Execução nunca roda em paralelo consigo mesma (trava em memória por tarefa).
- Nada é escrito em `financas_lancamentos` dentro de uma conta antes de todas as páginas dela
  chegarem; escrita por conta numa transação de banco.

## Virada (cada passo com confirmação do Matheus)

1. Migração aplicada + papel criado (Matheus define a senha).
2. Worker no ar em **modo sombra**: grava só em `pluggy_*` e `pluggy_execucoes`; a contagem de
   "inserir / alterar / remover" de cada execução é comparada com o que o n8n gravou.
   Em modo sombra o worker **não escreve em nenhuma tabela `financas_*`** e **não pede atualização
   de item** à Pluggy — só lê a API e grava o próprio diagnóstico. O modo é a variável
   `WORKER_MODO` (`sombra` por padrão; `real` só por escolha explícita).
3. Recarga de 24 meses em `--dry-run`; relatório de remoções revisado.
4. Desativar os 4 workflows de ingestão e o cron do `sync_pluggy.sh`; worker em **modo real**;
   recarga real.
5. Selo, `/api/previsao` e as páginas conferidos depois da primeira execução real.

Reversão: reativar os workflows e o cron, parar o container. As colunas novas e as tabelas
`pluggy_*` não atrapalham o n8n.

## Testes

- `vitest`: classificação, montagem da linha, reconciliação (incluindo as três travas),
  paginação, leitura de parcela, `transferencia_casal`.
- Cliente da Pluggy testado com `fetch` falso; nenhum teste chama a API real.
- `npm run build` do painel continua passando.
