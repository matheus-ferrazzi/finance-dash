# Auditoria 13/10 — correções (plano mestre)

> Executor: inline (executing-plans), ledger em `.superpowers/sdd/2026-10-13-auditoria-correcoes/progress.md`.
> Cada item de código: teste que falha → correção → suíte verde. Cada onda vira um PR a partir de `main`
> e um deploy com prova em produção (número antes × depois).

**Origem:** auditoria imparcial de 13/10/2026 (4 agentes: escopo, números, coerência, dados/infra),
achados conferidos contra o banco antes de entrar aqui. Pedido do Matheus: cobrir **todos** os pontos,
nada em aberto. Item que não vira código vira **decisão registrada** (roadmap) — nunca some calado.

## Global Constraints

- Previsão e ritmo são **base caixa** (débito + casa + fatura). Uma função só por número (`computeRitmo`, `computeProjecao`).
- Dinheiro vivo (E3) nunca entra em conta de banco.
- Repo público: nada de telefone, JID, CPF, chave ou valor real em teste/fixture (valores de teste são inventados).
- Deploy: `--no-deps` sempre; fora de 16h–16h40 e 22h–22h40 SP e dos minutos :09.
- n8n só pela skill `mexer-n8n`.

## Review Focus

1. Mês sem fatura no histórico (cartão sem `financas_faturas_historico`, ex.: Bradesco) — o restante não pode virar 0 nem contar duas vezes.
2. Pagamento de fatura duplicado no lado do cartão (Nubank grava "Pagamento recebido" 2×) — dedup por data+valor.
3. Transferência de mesmo valor entre contas do casal no mesmo dia que **não** é a mesma (ex.: dois PIX de 50) — o pareamento casa 1:1.
4. Último dia do mês e dia 1 (divisores, "cabe hoje", gráfico).
5. Visão individual (Matheus/Ariane) além do casal em toda correção da previsão.

---

## Onda 1 — números que o casal usa para decidir (PR `fix/auditoria-numeros`)

| # | Item | Correção | Prova |
|---|---|---|---|
| N1 | "GASTOS CARTAO" do Bradesco (pagamento mensal da fatura) descartado como espelho | Sai de `SEM_ESPELHO` só esse padrão; débito `pagamento_fatura` de cartão **sem histórico de fatura** conta como conta travada (média do travado, `fixoJaGasto`) e como fatura no realizado | sobra de set/26 refeita; saldo reconstruído do Bradesco fecha |
| N2 | PIX entre contas do mesmo dono vira receita (set e out) | Pós-ingestão: entrada `receita` com saída `transferencia_interna` do mesmo valor (±0,01), ±1 dia, outra conta do casal → `transferencia_interna` (1:1). Roda a cada ingestão + uma vez no deploy | receita de set e out sem a transferência |
| N3 | Fatura do mês corrente já vencida/parcelada conta como "ainda falta" | Por cartão: vencimento já passou → falta 0; senão total − pagamentos do lado do cartão (dedup) desde venc−10d. Parcelamento de fatura (`pagamento_fatura` Saída no crédito) entra em `creditoPorVencimento` | out/26: o "cartão ainda falta" some (fatura já parcelada) |
| N4 | Faturas: painel "a pagar" = saldo devedor × bot "0 a vencer" | Fatura = `financas_faturas_historico` (a última fechada por cartão: valor, vencimento, paga?) + próxima prevista; `valor_fatura_atual` vira "limite usado". Mesma função para tela, bot e lembrete | tela e bot iguais; fatura paga aparece paga |
| N5 | Lembrete de fatura só dos cartões da Ariane | Diário lembra **toda** fatura fechada e não paga vencendo hoje/amanhã (dos dois), pela função do N4 | dry-run com vencimento simulado |
| N6 | /contas "Sobra" de milhares de reais num mês no vermelho | Card troca para "o mês fecha em" (previsão) com link; sobra do caderno vira "entrou − contas do caderno" só como linha explicada | tela |
| N7 | Semanal "🔺 310%" | Total e média só do gasto livre (sem travados), como o corpo | semana 05–11/10 refeita |
| N8 | "Nesse ritmo fecha em" usa a média | Texto: "Pela média dos últimos meses, fecha em …"; + "no ritmo atual, ~X" calculado | teste de texto |
| N9 | Renegociação com dois planos vira uma linha só (e "mêses") | Agrupar por plano (descrição + banco + parcela_total + valor); mostrar mês a mês; corrigir "mêses" | trilha e previsão: um item por plano |
| N10 | Casa paga no crédito conta 2× | `forma_pagamento='Débito'` nas consultas de casa (média, mês, realizado) | realizado de ago e set |
| N11 | "Dá pra gastar hoje" sem hoje no divisor; só débito sem dizer | divisor `diasRestantes + 1`; texto "no débito/PIX"; último dia ≠ 0 | testes de borda |
| N12 | Travado fantasma (conta já paga ainda esperada) | `fixoQueFalta` por categoria travada (média da categoria − pago nela) | out/26 |
| N13 | Aluguel cadastrado desatualizado | Aviso na previsão quando o realizado da categoria cadastrada passa o cadastro em >10% | Moradia out/26 |
| N14 | Dois "o que cabe" no diário | Linha do gráfico = gasto até hoje + "dá pra gastar" × dias que faltam (mesmo número do texto); perfil não linear | PNG |
| N15 | Previsto na véspera usa dado de hoje | Foto do previsto gravada no dia 1 (tabela `financas_previsto_foto`, migração 013); passado usa a foto quando existe | teste + 1º/11 |
| N16 | Meta de débito sugere corte que já aconteceu | Base da meta = média recente (3 meses), não a de 6 | tela |
| N17 | Diagnóstico mistura set/26 com projeção de nov | Rótulo do mês em cada número | tela |
| N18 | Trilha: % aplicado ignora resgate; fase 3 "ago/28" × "out/27"; reserva "casa 0,00" | Aporte líquido (entrada − resgate); um "quando" só; rótulos | /trilha |
| N19 | Links levam a outro número | Ritmo → /gastos?tipo=livre&forma=debito; "Por banco" respeita filtro; semanal → /gastos da semana | links |

## Onda 2 — sinais e substitutos dos bots do Telegram (PR `feat/auditoria-alertas`)

| # | Item | Correção |
|---|---|---|
| S1 | Sessão do WhatsApp cai e ninguém sabe | Worker checa `connectionState` a cada 6 h; fora de `open` → aviso pelo **Telegram** (outro canal) |
| S2 | Sincronização: alerta não cita conexão parada | Técnico lista conexão com `last_sync` > 30 h; `atualizar-itens` 2×/dia e limite 20 h; log do corpo do 400 |
| S3 | Rotativo e cheque especial | Linha no técnico/diário: conta corrente negativa; IOF/juros de rotativo no mês |
| S4 | Gasto fora do padrão (anomalia) | Diário: compra única > 3× a mediana da categoria em 90 dias (máx. 1 linha) |
| S5 | Bot 06 orçamento 80/100% sem substituto | Diário: categoria do orçamento que cruzou 80% ou 100% ontem |
| S6 | Bot 04 investimentos sem substituto | Mensal ganha bloco "investimentos" (total, variação, aportes líquidos); bot ganha ferramenta `investimentos` |
| S7 | Bot 02/07 (faturas e carteira no semanal) | Semanal ganha linha de faturas (N4) |
| S8 | Bot 10 chama resgate de aporte | Aposentado com o mensal; até lá, corrigido no n8n (sinal por `tipo_movimento`) |
| S9 | Bots 03/04 do n8n falham (Markdown) | n8n: enviar sem `parse_mode` (mexer-n8n) — até a virada |
| S10 | Bot 08 aposentado sem os cartões do Matheus | Coberto pelo N5 |

## Onda 3 — pendências adiadas das etapas (PR `fix/pendencias-c2-e3`)

D: M1 PGPASSWORD na linha · M2 ALTER ROLE em texto · M3 dias do consentimento em UTC · M5 `--trocar` · M6 `--refazer` · M7 400 com array · M8 escape no fallback Telegram · M9 resto · M10 próprio número.
D2: M1 sendMedia duplicado em timeout (+ teste) · M2 imagem órfã · M6 nome longo "…" · M7 PNG 1600 · M8 sombra renderiza PNG · M9 `--png` em /tmp · M10 teste soma diária = variavelJaGasto · M11 lockfile.
E1: M2 Ariane mencionando o Matheus · M3 contexto com quem perguntou · M4 JID no erro · M5 trava ao fim das rodadas · M6 fallback com todas as ferramentas · M7 faturas (vira N4) · M8 simular com faixa + Infinity · M9 imagem com legenda "bot" · M10 token no log da Evolution · testes do filtro com espiões em todos os casos.
E2: M3 descrição bruta na prévia · M4 expirar pendentes + retenção 1 ano · M6 escape de `%`/`_` · M7 avulsa validada no painel.
E3: M2 transação · M3 erro ao apagar + botão · M4 média sem histórico · M6 cast · M7 "Por banco" com dinheiro · M8 link /buscar.
C2: trava entre CLI e cron · teste do dry-run real.
D: testes de integração das rotas `/api/resumo/*` · rotas internas protegidas (token interno do worker) · `notif-mensal --dry-run --png` em produção.
F1: receita agendada uniforme · ponto final no último dia · ritmo 0 no último dia (N11) · base do "gastando/dia" × Gastos (N19) · "Por banco" (N19) · dois cartões do mesmo banco · barra com links.
F2b+: "fecha com" individual × casal (explicado na tela). F3: dívida sem parcela futura · mês vazio conta como sobra · "quando" da fase 2 · % da fase 4. F4: "Agora:" com categoria crua · prévia sem mudança de classe · chips 36 px · folha sem Esc/foco. F4b: parcelamentos com mesma descrição.

## Onda 4 — escopo prometido

| # | Item | Correção |
|---|---|---|
| P1 | "E se mudarmos em mar/27" | Cenário de mudança no `/simulador` (mês, aluguel novo, custo da mudança) usando `aplicarCenario` |
| P2 | Faixa sem teste de acerto | Liga só se a faixa conteve o real em 70–90% dos meses do teste |
| P3 | Link da fatura com ciclo | `/faturas?cartao=…&ciclo=AAAA-MM` |
| P4 | Script único de deploy | `scripts/deploy.sh painel|worker` (testes, tar, backup, build, subida, conferência) |
| P5 | Restore não testado desde 17/09 | Rodar `testar_restore.sh` com o dump de hoje (banco descartável) |
| P6 | Sessão do WhatsApp fora do backup | `evolution_wa` no dump diário |

## Decisões a registrar (sem código)

Respostas do Matheus em 13/10:

- C2 troca bot a bot → substituída pelo D (a sombra provou paridade).
- B hierarquia de categoria → **fechado: os grupos são a hierarquia**.
- `financas_contas` (unir saldos e faturas) → **fechado: não fazer** (refatoração sem ganho).
- Sessão do Cloudflare Access → **30 dias** (aplicar pelo MCP, só a duração; regra de e-mails intacta).
- Desafio do mês → **fazer simples** (Onda 4, P7): dia 1 o mensal sugere 1 desafio do maior grupo livre; semanal mostra andamento; fechamento diz se cumpriu.
- Redesenho visual das telas internas → **entra neste lote** (Onda 5): proposta visual de Gastos/Faturas/Contas/Previsão para o Matheus aprovar antes de implementar.

Contradições de documento (E2 palavras/pago/executando, `BOT_JIDS`, doc dos bots, IP público no doc de Arquitetura) → corrigir os documentos.

## Do Matheus

Reconectar o Inter no Meu Pluggy (HTTP 400 desde 09/10).
