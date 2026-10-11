# D — WhatsApp e notificações redesenhadas

Data: 11/10/2026 · Projeto: Finanças do Casal · Depois do C2 (motor de notificações no worker). O E (bot conversacional) vem depois e reaproveita o canal.

## Objetivo

Trocar o Telegram — que o casal não olha — pelo WhatsApp, e trocar os 12 bots por **poucas mensagens que valem a pena**: um resumo diário curto, um semanal e um mensal no grupo do casal, cada uma terminando com link para a tela do assunto já filtrada; avisos técnicos só para o Matheus, só quando algo quebra. Silêncio quando não há o que dizer.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Canal | **Evolution API** (gateway self-hosted, protocolo do WhatsApp Web) na VPS, com **chip dedicado** para o bot |
| Teste | Enquanto o chip não chega: **número do Matheus**, só envio, volume mínimo, grupo de teste; trocar de número = logout + QR novo, sem mudar código |
| Destino | **Grupo do casal** (Matheus, Ariane e o número do bot) |
| Catálogo | **Diário 8h** (ritmo + contas do dia) · **Semanal segunda** (resumo + trilha) · **Mensal dia 1** (fechamento) |
| Alertas na hora | **Fora** (gasto grande, fatura em 3 dias, cobrança duplicada, limite, assinatura): os bots 08 e 09 se aposentam com o Telegram |
| Técnicos | **Privado do Matheus**, só quando algo quebra: ingestão parada, backup atrasado, consentimento da Pluggy vencendo |

## 1. Canal WhatsApp (D1)

- **Evolution API v2** em container na VPS, imagem com versão fixa, na rede `n8n-docker_n8n_network`, **sem porta publicada** (só o worker a alcança). Banco próprio (`evolution_db`) no `postgres-hub`, usuário próprio.
- Configuração de **só envio e privacidade**: não guardar mensagens recebidas nem contatos/chats (`DATABASE_SAVE_DATA_NEW_MESSAGE=false`, `…_MESSAGE_UPDATE=false`, `…_CONTACTS=false`, `…_CHATS=false`), sem webhooks, sem leitura automática. A instância vê as conversas do número conectado (aparelho conectado), mas nada é gravado.
- Chave da API (`AUTHENTICATION_API_KEY`) gerada por um **script que o Matheus roda** (`openssl rand`), gravada em `.env` 600; a mesma chave vai para o worker. Claude nunca a vê.
- **Conectar o número**: um script na VPS cria a instância `financas` e mostra o QR **no terminal do Matheus** (Claude não vê o QR); ele escaneia em *Aparelhos conectados*. O mesmo script, com `--trocar`, faz logout e mostra um QR novo (chip).
- No worker: `CanalWhatsApp implements Canal` (o mesmo `Canal` do C2) — `POST /message/sendText/financas` `{ number, text }`, `apikey` no header, timeout 15 s, erro sem a chave. Destinos por variável: `WA_GRUPO` (id do grupo, `...@g.us`) e `WA_MATHEUS` (número do Matheus, para os técnicos). Um script lista os grupos da instância (`fetchAllGroups`) para o Matheus achar o id — só nome e id.
- Formatação: Markdown do WhatsApp (`*negrito*`, `_itálico_`); links em texto puro (o WhatsApp mostra a prévia).

## 2. Catálogo (D2)

Cada mensagem é montada por uma função pura no worker (como no C2) a partir de dados que o **painel** entrega por rotas internas (a conta continua num lugar só: trilha, contas, previsão):

| Mensagem | Quando (SP) | Dados (rota do painel) | Conteúdo | Link |
|---|---|---|---|---|
| **Diário** | 8h todo dia | `GET /api/resumo/diario` | quanto dá pra gastar hoje e o ritmo atual; como o mês fecha; contas do mês que vencem **hoje ou amanhã** e ainda não foram pagas (nome e valor) | home |
| **Semanal** | segunda 9h | `GET /api/resumo/semanal` | gasto da semana anterior (seg–dom) por grupo × a média das 4 semanas antes (só os grupos que mais mudaram, até 3); a fase da trilha e o próximo passo | `/gastos` e `/trilha` |
| **Mensal** | dia 1, 9h | `GET /api/resumo/mensal` | o mês que fechou: sobra real × prevista, saldo no fim, a fase da trilha (e se mudou), e como o mês novo começa (fecha com) | `/previsibilidade?mes=<mês fechado>` |
| **Técnico** | 12h30 todo dia | `saude`/`backup` do C2 + `pluggy_itens.consent_expires_at` | só quando há problema: as linhas de saúde e de backup do C2 e "consentimento do <banco> vence em N dias" (≤ 30 dias) | — |

- **Diário no último dia do mês**: sem a parte "por dia" (não há dias restantes); só "o mês fecha em" e as contas.
- **Sem conta vencendo** no diário: a parte de contas some (não "nenhuma conta").
- **Valores** pelo `brl` do painel; o texto final em tom contido, sem gíria de TI.
- **Links**: `linkPara(tela, filtros)` com a base pública do painel (`PAINEL_URL`, variável do worker), sempre o casal.
- As rotas `/api/resumo/*` respondem só na rede interna do Docker (o acesso público ao painel já passa pelo Cloudflare Access).

## 3. Motor, registro e virada

- Reaproveita o motor do C2: `financas_notificacoes` (registro, estado), sombra/real por mensagem (`NOTIF_REAL` com `diario,semanal,mensal,tecnico`), `--dry-run` na linha de comando.
- O motor passa a ter **um canal por destino** (grupo × Matheus) e o canal certo por mensagem.
- **Teste (número do Matheus)**: `WA_GRUPO` = um grupo de teste; um disparo de cada mensagem pela linha de comando (sem `--dry-run`, com a mensagem em `NOTIF_REAL`), conferido no WhatsApp; nada de agenda de teste em repetição (regra do incidente das 139 mensagens).
- **Com o chip**: `--trocar` (logout + QR do chip), `WA_GRUPO` = grupo do casal, `NOTIF_REAL=diario,semanal,mensal,tecnico`.
- **Desligar o Telegram** quando o WhatsApp provar: 3 diários seguidos e um semanal entregues no grupo do casal pelo chip. Aí, pela skill `mexer-n8n` (fora das janelas de ingestão): desativar os bots 02–12 no n8n; no worker, os 5 bots do C2 saem da agenda (ritmo vira o diário; saúde e backup viram o técnico; 08 e 09 se aposentam). A Triagem de Vagas fica no n8n.

## 4. Aceite e testes

- Unitários: as 4 montagens (cenários: tudo normal; último dia do mês; sem contas; contas vencendo; trilha mudou de fase; semana sem gasto; técnico sem problema → nada; consentimento a 10 dias); `CanalWhatsApp` (corpo, cabeçalho, erro sem a chave); escolha do canal por destino.
- Integração: as rotas `/api/resumo/*` com dados sintéticos (contas vencendo amanhã não pagas; semana anterior × média; mês fechado).
- Produção: Evolution no ar sem porta pública; instância conectada (estado `open`); disparo de teste das 4 mensagens no grupo de teste; troca para o chip; 3 dias + 1 semanal no grupo do casal; Telegram desligado.

## Fora do D

Bot conversacional (E); alertas na hora; mensagens individuais por pessoa; Triagem de Vagas.
