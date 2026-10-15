# C2 — Notificações saem do n8n (motor no worker)

Data: 11/10/2026 · Projeto: Finanças do Casal · Depois do F (painel), antes do D (notificações redesenhadas + WhatsApp).

## Objetivo

Tirar do n8n os bots que importam no dia a dia e colocá-los no código do worker — com regras testadas, agenda no fuso de São Paulo, registro de tudo o que foi (ou seria) enviado e um canal trocável — sem mudar o que o casal recebe. O D redesenha as mensagens e troca o Telegram pelo WhatsApp em cima deste motor.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Escopo | **Motor no worker + 5 bots essenciais**: 12 Ritmo do dia, 08 Vencimento de fatura, 09 Gasto grande, 05 Saúde das conexões, 11 Guarda do backup. Relatórios com IA (02, 03, 04, 07), 06 Orçamento, 10 Fechamento e a Triagem de Vagas ficam no n8n até o D |
| Virada | **Sombra por 2 dias, depois a troca, um bot de cada vez** (como na virada da ingestão, C1) |
| Texto | **Idêntico ao do n8n** (a comparação na sombra depende disso); redesenho no D |

## 1. Os bots (lógica portada do n8n, sem mudança)

| Tarefa | Agenda (SP) | Dados | Mensagem (Markdown do Telegram) |
|---|---|---|---|
| `notif-ritmo` | `0 8 * * *` | `GET http://finance-dashboard:3000/api/previsao` (o mesmo do Bot 12) | 🎯 Ritmo de hoje — dá pra gastar, ritmo atual (% acima ou "dentro do que cabe"), "fecha em", dias e quanto ainda entra; nada no último dia do mês (`diasRestantes <= 0`) |
| `notif-fatura` | `0 9 * * *` | `financas_faturas` com valor > 0 e vencimento em 0–3 dias | 📅 Vencimento de fatura — uma linha por fatura nova; cada fatura (`banco|responsável|vencimento`) é avisada **uma vez por ciclo** |
| `notif-gasto` | `45 16,22 * * *` | despesas ≥ R$ 500 criadas nos últimos 3 dias, data até hoje | 💸 Gasto acima de R$ 500 — só as novas desde a última execução (marca d'água em `criado_em`); a **primeira execução só define a marca**, sem alertar o histórico |
| `notif-saude` | `30 12 * * *` | horas desde a última atualização de lançamentos, investimentos, faturas; última rodada completa do worker; falhas em 24 h | ⚠️ Alerta de sincronização — limites 36 h (faturas, investimentos), 72 h (lançamentos), 19 h (worker), falha > 0 |
| `notif-backup` | `0 10 * * *` | `financas_backup` | 🗄️ Backup com problema — Postgres > 30 h, n8n > 30 h, cópia no PC > 72 h, falhas em 24 h; calado quando está tudo bem |

As consultas SQL e os textos são os mesmos dos nós do n8n (exportados em 11/10/2026), inclusive `clean()` de Markdown e o formato `brl` de `toLocaleString('pt-BR')`.

## 2. Motor

- `src/worker/notificacoes/` — por bot, uma **função pura** `montarX(dados, estado) → { texto | null, novoEstado }` e uma consulta; testes com os cenários do n8n (tudo bem → nada; cada limite; nulos "nunca houve").
- **Canal**: interface `Canal { enviar(texto: string): Promise<void> }`; `CanalTelegram` (Bot API `sendMessage`, `parse_mode=Markdown`, token e chat id por variável de ambiente). O D acrescenta o WhatsApp sem mexer nos bots.
- **Registro** — tabela `financas_notificacoes` (`id`, `bot`, `criado_em`, `modo` 'sombra'|'real', `texto`, `enviado` bool, `erro`, `estado jsonb`): toda execução que gera mensagem grava uma linha; o **estado** (marca d'água do gasto grande, faturas já avisadas) é lido da última linha do bot **em qualquer modo** — a sombra já mantém o estado, então a troca para real não repete avisos nem dispara o histórico.
- **Modo por bot**: `NOTIF_REAL` (lista separada por vírgula: `ritmo,fatura,…`); bot fora da lista roda em sombra (grava, não envia). Sem as variáveis do Telegram, todos ficam em sombra (com aviso no log).
- **Agenda**: as 5 tarefas entram na `AGENDA` do worker (croner, `America/Sao_Paulo`), como a ingestão; também rodam pela linha de comando (`node worker.js notif-ritmo --dry-run`) para teste sem gravar nem enviar.
- **Falha**: erro de consulta/envio grava a linha com `erro` e não derruba o worker nem a ingestão.

## 3. Banco (migração 008)

- `financas_notificacoes` como acima.
- `pluggy_worker`: `SELECT` em `financas_backup`, `financas_faturas` (já tem), `financas_investimentos` (já tem); `SELECT, INSERT` em `financas_notificacoes` (+ sequência); `bot_readonly`: `SELECT` em `financas_notificacoes`.

## 4. Credenciais

O worker precisa de `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. **Claude não manipula o token**: entrega um script que o Matheus roda para incluir as duas variáveis no ambiente do worker (sem eco do valor). Na sombra não são necessárias.

## 5. Virada

1. Deploy do worker com os 5 bots em sombra.
2. Por 2 dias, comparar `financas_notificacoes` (sombra) com o que o n8n mandou no grupo (mesmo texto, mesmo horário; para ritmo, os números podem diferir por minutos de diferença na leitura).
3. Por bot que bateu: desativar o workflow no n8n (skill `mexer-n8n`: export com nome único com timestamp, conferir o `id`, `update:workflow --active=false`, restart fora de 16h–16h40 e 22h–22h40) e incluir o bot em `NOTIF_REAL` (recriar o worker fora das janelas de ingestão).
4. Conferir na tabela a primeira execução real de cada bot (`enviado = true`).

## 6. Aceite e testes

- Unitários: cada `montarX` com os cenários do n8n (incluindo nulos); estado do gasto grande (primeira execução sem alerta, só novos depois) e das faturas (uma vez por ciclo); modo sombra/real; canal falso.
- Integração: consultas com dados sintéticos; registro e leitura do estado; worker em `--dry-run` não grava nem envia.
- Produção: migração 008; worker em sombra; 2 dias de comparação registrada; troca bot a bot com a primeira mensagem real conferida. **Atualizado em 13/10 (auditoria):** a comparação de 2 dias foi feita (texto idêntico ao do n8n); a troca bot a bot foi substituída pelo D — os bots do C2 saem junto com o Telegram na virada do chip.

## Fora do C2

Redesenho das mensagens e WhatsApp (D); bots 02, 03, 04, 06, 07, 10 e Triagem de Vagas (ficam no n8n); bot conversacional (E).
