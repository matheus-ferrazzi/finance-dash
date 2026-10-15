# E1 — Bot de perguntas no grupo do WhatsApp

**Data:** 11/10/2026 · **Base:** D2 (`feat/d2-visuais`, PR #16) · **Aprovado em conversa:** abordagem A, ferramentas, falhas/registro/segurança/teste (11/10).

## Por quê

O casal quer perguntar ao sistema pelo WhatsApp: consultar ("quanto gastei com mercado?"), entender ("por que o ritmo tá alto?") e simular ("dá pra comprar uma TV de 3 mil em 10x?"). O Bot 01 do Telegram já tentou isso e morreu por dois motivos — **errava as respostas** (LLM gerando SQL) e **quebrou e ficou parado** (modelo da Groq saiu do ar, ninguém soube). O E1 existe para não repetir os dois.

O E foi dividido: **E1** = consultar, entender e simular (só leitura). **E2** = agir (marcar conta paga, mudar categoria, lançar gasto), com confirmação, vem depois.

## Decisões (do Matheus)

| Tema | Decisão |
|---|---|
| Onde | **Só no grupo** do WhatsApp (o mesmo das notificações do D) |
| Quando responde | **Só quando chamado**: mensagem que começa com "bot" (sem diferenciar maiúscula, com ou sem vírgula/dois-pontos) ou que menciona o número do bot |
| Modelo | **Só Groq**, com lista de modelos reserva da própria Groq |
| Arquitetura | **A**: webhook da Evolution → servidor HTTP no worker (rede interna) → agente com ferramentas fixas → resposta no grupo |
| Número de teste | Webhook ligado no número do Matheus **só nas janelas de teste** (script liga/desliga); ligado de vez quando o chip chegar |

## Regra central: o modelo não faz número

- O Groq só **escolhe ferramentas** e **escreve** a resposta. Toda soma, diferença, percentual e data vem pronta das ferramentas.
- **Trava de número:** todo valor em R$ que aparecer na resposta do modelo tem que existir no resultado de alguma ferramenta da mesma pergunta (igual a 2 casas, ou ao arredondamento inteiro). Se não existir, a resposta do modelo é descartada e vai o **texto montado** da ferramenta (cada ferramenta tem um formatador determinístico). O registro marca `trava = true`.
- Pergunta que nenhuma ferramenta cobre → "🤷 Ainda não sei responder isso. Anotei a pergunta." (registrada com `sem_ferramenta = true`).

## Fluxo

1. Evolution (instância `financas`) manda o evento `MESSAGES_UPSERT` por webhook para `http://finance-worker:8090/whatsapp?t=<token>` (rede interna; sem porta publicada; `token` aleatório em `.env.worker-bot`, 600).
2. Worker responde `200` na hora e processa em fila (uma pergunta por vez).
3. **Filtro de entrada, nesta ordem, antes de qualquer log ou gravação:**
   1. token da URL confere; senão `403` e nada mais;
   2. `key.remoteJid` = `WA_GRUPO`; senão descarta (sem log de conteúdo);
   3. remetente (`key.participant` / `participantAlt`) está em `BOT_MEMBROS` (mapa nome → JIDs, gravado por script a partir dos participantes do grupo; cobre JID de telefone e LID); senão descarta;
   4. a mensagem não é uma resposta do próprio bot (id em um conjunto em memória dos últimos 200 envios do bot) — necessário porque, no número do Matheus, as mensagens dele também chegam com `fromMe = true`;
   5. texto chama o bot (prefixo "bot" ou menção ao JID do bot); senão ignora.
4. **Agente:** chamada ao Groq (API compatível com OpenAI, `chat/completions` com `tools`), com:
   - prompt de sistema curto (papel, regras: não calcular, usar ferramentas, português, tom contido, até ~8 linhas, um emoji por linha no início, link do painel no fim);
   - quem perguntou (Matheus/Ariane) e a data de hoje em SP;
   - contexto: as últimas 3 trocas (pergunta + resposta) do grupo nos últimos 30 min, do registro;
   - até 4 rodadas de ferramenta; timeout de 20 s por chamada ao Groq.
5. **Ferramentas** chamam rotas de leitura do painel (`/api/bot/...`, pela rede interna, como o D faz com `/api/resumo/*`).
6. Trava de número → envia a resposta no grupo (texto; com o gráfico de barras do D2 quando a ferramenta devolve divisão por grupo) → registra.

## Ferramentas (E1)

Parâmetros comuns: `periodo` ∈ `hoje | esta_semana | semana_passada | este_mes | mes_passado | AAAA-MM` (resolvido no servidor, em SP; semana = segunda a domingo); `pessoa` ∈ `casal | Matheus | Ariane` (padrão `casal`; "eu" = quem perguntou, resolvido no worker).

| Ferramenta | Rota | Devolve | Fonte |
|---|---|---|---|
| `situacao_mes()` | `/api/bot/situacao` | dá pra gastar hoje, ritmo atual, fecha com, sai do vermelho (provável) | `getPrevisaoResumo`, `saiDoVermelho` |
| `gasto_periodo(periodo, pessoa?, grupo?)` | `/api/bot/gasto` | total; por grupo (nome, valor) ou, com `grupo`, por categoria | `getGastoPorCategoriaEntre` (+ filtro de pessoa) + `agruparGastos` |
| `maiores_gastos(periodo, pessoa?, grupo?)` | `/api/bot/maiores` | até 10 lançamentos: data, valor, descrição, pessoa | consulta de despesas do painel |
| `comparar(periodo_a, periodo_b, pessoa?)` | `/api/bot/comparar` | por grupo: a, b, diferença, % (prontos); total a × b | `getGastoPorCategoriaEntre` ×2 |
| `faturas()` | `/api/bot/faturas` | por cartão: valor, vencimento, paga ou não | `getFaturas` |
| `contas_do_mes()` | `/api/bot/contas` | pagas, em falta, a confirmar, com valores e vencimento | `getContasDoMes` |
| `trilha()` | `/api/bot/trilha` | fase, título, próximo passo, reserva × meta | `getTrilhaDados` + `avaliarTrilha` |
| `simular_compra(valor_total, parcelas)` | `/api/bot/simular` | cabe (provável e pior caso), parcela, como fica o fechamento dos próximos meses | `compraCabe` (o do `/simulador`) |

- `grupo` aceita só os nomes dos grupos do painel (lista enviada no schema da ferramenta como `enum`).
- Toda rota valida parâmetros (período e pessoa fora da lista → `400` com mensagem; o agente repassa o erro ao modelo uma vez).
- Cada resultado traz `link` (tela do painel que aprofunda) e o worker tem um **formatador** por ferramenta (texto determinístico usado pela trava).

## Falhas

- `GROQ_MODELOS` (lista, ordem de preferência; hoje `openai/gpt-oss-120b` primeiro). Erro de modelo inexistente/indisponível (`404`, `400 model_decommissioned`, `503`) → próximo da lista na mesma pergunta.
- Groq fora, sem chave ou tempo esgotado em todos → "⚠️ Não consegui responder agora. Tenta de novo em alguns minutos." e registro com `erro`.
- Rota do painel falhou → o modelo recebe o erro da ferramenta; se não conseguir responder, mesma mensagem acima.
- **Aviso técnico** (12h30, privado do Matheus) ganha: "🔴 Bot: N pergunta(s) com falha nas últimas 24h" e "🔴 Bot: modelo X não existe mais na Groq" (checagem diária de `GET /openai/v1/models` contra `GROQ_MODELOS`, junto com o técnico).
- Fila: uma pergunta por vez; mais de 5 na fila → as novas recebem "⏳ Muitas perguntas de uma vez, manda de novo daqui a pouco."

## Registro

Migração `009_bot.sql`: tabela `financas_bot_conversas` (`id`, `criado_em`, `pessoa`, `pergunta`, `ferramentas jsonb` — nome, parâmetros, ok —, `resposta`, `modelo`, `ms`, `trava bool`, `sem_ferramenta bool`, `erro`). `pluggy_worker` grava e lê; `bot_readonly` lê. Só entram perguntas que passaram pelo filtro (do grupo, de membro, chamando o bot). Nunca o número de telefone; nunca mensagem de outra conversa. O worker apaga linhas com mais de 90 dias (uma vez por dia).

## Segredos e scripts (Matheus roda; Claude não vê valores)

- `scripts/e1-bot-env.sh`: pede a chave da Groq (`read -s`), gera o token do webhook, grava `/root/n8n-docker/.env.worker-bot` (600: `GROQ_API_KEY`, `BOT_TOKEN`, `GROQ_MODELOS`).
- `scripts/e1-bot-membros.sh`: lista os participantes do `WA_GRUPO` (nome do contato quando houver + final do número), pergunta quem é Matheus e quem é Ariane, grava `BOT_MEMBROS` e `BOT_JIDS` (os JIDs do número conectado, separados por |; nome atualizado em 13/10) em `.env.worker-bot`.
- `scripts/e1-bot-webhook.sh --ligar | --desligar | --estado`: configura o webhook da instância (`POST /webhook/set/financas`, só `MESSAGES_UPSERT`, URL interna com token) ou desliga (`enabled: false`).
- Compose do worker: `env_file` opcional `.env.worker-bot`; nenhuma porta publicada (a Evolution alcança `finance-worker:8090` pela rede `n8n_network`).

## Fora do escopo

- Qualquer escrita (E2). Conversa no privado. Memória longa. Áudio, imagem e figurinha recebidos (respondem "Por enquanto só leio texto."). Outros modelos fora da Groq.

## Testes

- **Filtro:** mensagem de outra conversa, de não-membro, sem chamado, do próprio bot e com token errado → nada no log, no banco, nem chamada ao Groq (testado com espiões no logger, no registro e no cliente Groq).
- **Períodos:** `resolverPeriodo` em SP — virada de mês, segunda-feira, domingo, `AAAA-MM`, inválido.
- **Rotas `/api/bot/*`:** integração com dados fixos; valores iguais aos das telas (mesmas funções); pessoa filtra.
- **Trava:** resposta com R$ inexistente → formatador; com R$ arredondado → aceita; sem R$ → aceita.
- **Agente** (Groq simulado): ferramenta chamada com os argumentos certos; modelo sumido → próximo da lista; timeout → mensagem de falha; pergunta sem ferramenta → "ainda não sei"; até 4 rodadas.
- **Fila:** duas perguntas seguidas → respostas na ordem; sexta na fila → aviso.
- **Produção:** no grupo de teste, janela de teste com o webhook ligado: 10 perguntas reais cobrindo as 8 ferramentas + 1 fora do escopo + 1 ambígua; cada número conferido com o painel; webhook desligado no fim.

## Riscos

- **LID:** grupos novos do WhatsApp identificam participantes por LID em vez do telefone; por isso `BOT_MEMBROS` guarda os JIDs vistos no grupo (telefone e LID), não números digitados.
- **Número pessoal:** enquanto o bot roda no número do Matheus, todas as mensagens dele passam pelo worker (em memória) quando o webhook está ligado; o filtro descarta tudo que não é do grupo antes de qualquer log. Webhook desligado fora das janelas de teste.
- **Qualidade do modelo da Groq** em escolher ferramenta: medida no teste de produção; a trava impede número errado, não pergunta mal entendida.
