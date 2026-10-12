# E3 — Gasto em dinheiro vivo (pelo bot), visto nos gastos e fora do banco

**Data:** 12/10/2026 · **Base:** E2 (`feat/e2-bot-acoes`, PR #18) · **Aprovado em conversa:** origem, objetivo, abordagem A e desenho (12/10).

## Por quê

O casal às vezes recebe dinheiro em espécie (presente, venda, bico) e gasta sem passar pelo banco — o sistema não vê nem a entrada nem a saída. Em 2026 não há nenhum saque nos dados: o dinheiro vivo não vem do banco. Objetivo (decisão do Matheus): **ver o gasto completo** por categoria — sem mexer em nada que é sobre o saldo do banco.

## Regra central

O gasto em dinheiro **entra** só nas visões de "quanto gastamos por categoria" e **nunca** nas contas do saldo do banco. Por construção: fica numa tabela própria, que as consultas do banco não leem.

| Entra (sempre separado: "R$ 450, dos quais R$ 50 em dinheiro") | Não entra |
|---|---|
| Tela **Gastos** (totais por grupo/categoria e lista, com 💵) | Ritmo, "dá pra gastar hoje", fechamento do mês |
| **Semanal** do WhatsApp (total e grupos) | Previsão, simulador, decisões |
| Bot: `gasto_periodo`, `comparar`, `maiores_gastos` | Trilha, reserva, mensal (sobra/saldo) |
| | Diário, home, orçamento, casa, contas do mês |

## Lançar (bot, mecânica do E2)

- Ferramenta nova `propor_gasto_dinheiro(valor, descricao, categoria, data?, pessoa?)`:
  - `valor` 0,01–10.000; `descricao` 1–80 caracteres; `categoria` ∈ `CATEGORIAS_PAINEL`;
  - `data` = hoje (SP) por padrão; aceita `AAAA-MM-DD` de até 30 dias atrás, nunca futura;
  - `pessoa` = quem pediu por padrão (`Matheus`/`Ariane`).
- Cria proposta `tipo = 'dinheiro'` em `financas_bot_acoes` (mesmas regras: uma pendente por pessoa, "sim/confirma/confirmo" de quem pediu em ≤ 5 min, "não" cancela).
- Texto: "🟡 Lançar 💵 *R$ 50,00* em *Mercado* (feira, 12/10, Ariane)?\n👉 Responde *sim* ou *não*."
- Executar (`/api/bot/executar`): insere em `financas_gastos_dinheiro`; resultado `{ dinheiroId }`; "✅ Feito: 💵 feira R$ 50,00 em Mercado." com link `/gastos`.
- `bot desfaz`: apaga a linha (se já foi apagada pelo painel → "já não existe").

## Painel

- Migração `011_gastos_dinheiro.sql`:
  - `financas_gastos_dinheiro` (`id`, `data date`, `valor numeric(12,2) CHECK (valor > 0 AND valor <= 10000)`, `descricao text CHECK (length 1–80)`, `categoria text NOT NULL`, `responsavel text CHECK IN ('Matheus','Ariane')`, `criado_em`, `origem text DEFAULT 'bot'`);
  - `financas_bot_acoes.tipo` passa a aceitar `'dinheiro'` (troca do CHECK);
  - grants: `dash_writer` SELECT/INSERT/DELETE; `bot_readonly` SELECT; `pluggy_worker` nenhum (o worker só cria a proposta).
- Consultas novas: `getDinheiroPorCategoriaEntre(inicio, fimExcl, resp)` (Map categoria → valor) e `getGastosDinheiro(resp, inicio, fimExcl)` (lista).
- Tela **Gastos**: soma o dinheiro nos totais por grupo/categoria do período e mostra os lançamentos na lista com 💵 e um botão **apagar** (rota `DELETE /api/dinheiro/[id]`, `dash_writer`). Um aviso discreto no topo quando há dinheiro no período: "inclui R$ X em dinheiro vivo".
- `getDespesas` e `getGastoPorCategoriaEntre` **não mudam** (outros usos são sobre o banco); quem precisa do dinheiro soma `getDinheiroPorCategoriaEntre` explicitamente.

## Bot e semanal

- `/api/bot/gasto` e `/api/bot/comparar`: somam o dinheiro por categoria; cada item ganha `dinheiro` (quanto do valor foi em dinheiro) e o total ganha `totalDinheiro`; formatador mostra "(💵 R$ 50,00)" quando > 0.
- `/api/bot/maiores`: inclui os gastos em dinheiro do período, com `pessoa` e "💵" na descrição.
- `/api/resumo/semanal`: total e grupos incluem o dinheiro; `totalDinheiro` no JSON; o texto do semanal acrescenta "💵 R$ X em dinheiro" quando > 0.
- A trava de número continua valendo (os campos novos são de dinheiro: `dinheiro`, `totalDinheiro` entram na lista de campos de dinheiro).

## Fora do escopo

Saldo de carteira (entradas em espécie), lançar pelo painel (o painel só lista e apaga), saques do banco (não há), dinheiro em ritmo/previsão/trilha.

## Testes

- Integração: inserir, listar e somar por categoria/pessoa/período; `getGastoPorCategoriaEntre` e `getDespesas` continuam sem o dinheiro; `getPrevisaoResumo`/ritmo idênticos com e sem linhas de dinheiro.
- Rotas: gasto/comparar/maiores/semanal com dinheiro separado; executar/desfazer `dinheiro`.
- Worker: `propor_gasto_dinheiro` valida valor, descrição, categoria, data (futura e > 30 dias recusadas), pessoa; texto da proposta; trava aceita os campos novos.
- Tela Gastos: componente mostra 💵 e o aviso; apagar.
- Produção: no grupo de teste, lançar R$ 1 em dinheiro, ver na tela Gastos e no "bot quanto gastei", conferir que o ritmo/previsão não mudou, `bot desfaz`.
