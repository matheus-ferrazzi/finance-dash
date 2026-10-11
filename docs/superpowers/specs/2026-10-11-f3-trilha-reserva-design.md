# F3 — Trilha e reserva

Data: 11/10/2026 · Projeto: Finanças do Casal · Parte 3 do F (F1 home → F2 previsão → **F3 trilha** → F4 categorias pelo painel). Usa a previsão do P/F2 sem mudar nenhum número.

## Objetivo

Dar ao painel uma espinha: em que fase da vida financeira o casal está, o que falta para sair dela e quando. A trilha tem quatro fases, em ordem — sair das dívidas → fazer sobrar → reserva de emergência → patrimônio — calculadas sozinhas a partir dos dados, sem marcação manual.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Onde aparece | **Faixa no topo da home** (opção A) + **tela própria** `/trilha` com o detalhe (também no "Mais") |
| Ordem | A fase atual é a primeira não cumprida; as outras aparecem com o progresso delas. Fase cumprida que volta a falhar reabre |
| Dívida (fase 1) | Só dívida de verdade: renegociação, parcelamento de fatura, empréstimo/financiamento, juros/encargos de atraso e conta negativa. Compra parcelada comum **não** é dívida |
| Como descobre a dívida | **Automático por regras** (categoria + descrição), sem cadastro |
| Fazer sobrar (fase 2) | Cumprida com os **3 últimos meses fechados** com sobra real ≥ 0 |
| Reserva (fase 3) | Tudo que está **aplicado** conta; meta = **6 meses de gasto travado** do casal |
| Patrimônio (fase 4) | **% da renda que vai para aplicação** (média de 3 meses) contra uma meta de 10%; não termina |

## 1. As fases

Todos os números são da visão do casal. Cada fase tem um critério de "cumprida" (medido no que já aconteceu), um progresso, um "quando" (previsão) e um próximo passo (uma frase, tom contido).

| Fase | Cumprida quando | Progresso | Quando | Próximo passo |
|---|---|---|---|---|
| 1. Sair das dívidas | nenhuma parcela futura de dívida **e**, nos 2 últimos meses (o atual e o anterior), nenhum juro/encargo de atraso e nenhum dia com conta negativa | as dívidas ativas (nome, parcela, quantas faltam, até quando) e os avisos de atraso | mês da última parcela de dívida conhecida | "Manter a fatura paga inteira; a última parcela de dívida é em MMM/AA" (com aviso de atraso: "Houve juros de atraso em MMM/AA: pagar a fatura inteira") |
| 2. Fazer sobrar | os 3 últimos meses fechados com sobra real ≥ 0 | quantos dos 3 sobraram, com a sobra de cada um | primeiro mês em que a previsão tem 3 sobras seguidas ≥ 0 (o fim do terceiro); se não houver em 24 meses, "pela previsão, não acontece em 24 meses" | o texto da meta de gasto no débito do F2a (`textoMetaAlvo`) |
| 3. Reserva | aplicado ≥ meta | aplicado / meta (barra) | aplicado + ritmo × meses ≥ meta, com ritmo = aplicação líquida média dos 3 últimos meses fechados; ritmo ≤ 0 → "sem previsão" | "Aplicar R$ X/mês completa a reserva em MMM/AA" (X = o que completa em 12 meses) |
| 4. Patrimônio | — (não termina) | % da renda aplicada (média de 3 meses) × meta de 10%, e o total aplicado | — | "Aplicar 10% do que entra (R$ X/mês)" |

### Regras

- **Dívida (`ehDivida`)** — um lançamento é de dívida se a categoria é `Loans and financing` ou `Loans`, ou a descrição (sem acento, maiúscula) contém `RENEGOCIA`, `PARCELAMENTO DE FATURA`, `PARC.FATURA`, `EMPREST` ou `FINANCIAMENTO`. Uma regra só, num lugar só (`src/lib/trilha.ts`).
- **Dívida ativa** — lançamentos de dívida com data futura (parcelas já lançadas), agrupados pela chave da descrição (sem dígitos) e pela conta; por grupo: valor da parcela, quantas faltam, última data. As prestações de empréstimo no débito, que não têm data futura, entram como ativas se apareceram nos 2 últimos meses (sem data de fim); com alguma dívida sem fim conhecido, o "quando" da fase 1 é "sem data de fim conhecida". Os lançamentos-espelho do cartão na conta (`SEM_ESPELHO`) ficam fora de tudo.
- **Atraso** — nos 2 últimos meses: lançamento com categoria `Interests charged`, `Late payment and overdraft costs` ou descrição com `JUROS DE MORA`, `ENCARGOS DE ATRASO`, `ENC ATRASO`; ou algum dia com saldo em conta < 0 (reconstruído como na linha do mês: saldo de hoje menos os movimentos de débito depois de cada dia).
- **Gasto travado mensal** — da projeção do casal, um mês cheio futuro (`projecao[1]`): compromissos cadastrados + casa estimada + contas travadas no débito (`despesaFixaDebitoMedia`).
- **Aplicado** — soma de `valor_atual` dos investimentos ativos (`financas_investimentos`, sem os resgatados por inteiro).
- **Aplicação líquida do mês** — movimentos de débito para aplicação: `classe = 'aporte'` ou categoria `Investments` (fora `receita`, que é rendimento); saída soma, entrada (resgate) subtrai.
- **% da renda aplicada** — aplicação líquida dos 3 últimos meses fechados / receita real dos mesmos meses.
- Constantes no código: `MESES_RESERVA = 6`, `META_PATRIMONIO = 0.10`, `MESES_ATRASO = 2`, `MESES_SOBRA = 3`. Editar pela tela fica para o F4.

## 2. Faixa na home

No topo da home, antes de "Como o mês vai fechar":

- "Trilha · fase N de 4" e quatro tracinhos (cumprida verde, atual âmbar, próximas apagadas);
- nome da fase atual + o "quando" ("Sair das dívidas — última parcela em MMM/AA");
- o próximo passo em uma linha;
- a faixa inteira é link para `/trilha`.

Se tudo das fases 1–3 estiver cumprido, a faixa mostra a fase 4 (patrimônio) com o % do mês.

## 3. Tela `/trilha`

Um cartão por fase, na ordem, a atual destacada; cada cartão com status (cumprida ✓ / agora / depois), progresso, quando e próximo passo.

1. Dívidas — lista das dívidas ativas e os avisos de atraso (com o mês).
2. Fazer sobrar — os 3 meses fechados com ✓/✗ e a sobra (cada um é link para o mês na Previsão), a previsão e a meta do débito.
3. Reserva — barra aplicado/meta; como a meta é feita (6 × gasto travado, com as três parcelas do gasto travado); aplicação líquida por mês (3 meses); a data prevista.
4. Patrimônio — % da renda aplicada × 10% e o total aplicado.

Tela entra no "Mais" (barra e sidebar) e em `linkPara('trilha')`. Dinheiro com a classe `money`; seletor de mês do topo escondido (a trilha não é de um mês).

## 4. Dados e código

- `src/lib/trilha.ts` (puro, testado): `ehDivida(descricao, categoria)`, `ehAtraso(descricao, categoria)`, `avaliarTrilha(dados): Trilha` → `{ atual: 1|2|3|4, fases: Fase[] }`, com `Fase = { n, titulo, status: 'cumprida'|'atual'|'depois', progresso, quando, proximoPasso }` e os detalhes de cada fase.
- `getTrilhaDados(hoje)` em `queries.ts`: reaproveita `getMesesPassados('casal')`, `getProjecaoBase('casal')` + `computeProjecao` + `debitoParaSairAte`/`textoMetaAlvo` (F2a); consulta nova para dívidas ativas, atrasos, investimentos ativos e aplicação líquida por mês.
- Componentes: `FaixaTrilha` (home, servidor) e a página `/trilha` (servidor) com `CartaoFase`.

## 5. Aceite e testes

- Unitários: cada fase cumprida ou não; fase cumprida que reabre (dívida nova depois de cumprida); sem dívida nenhuma; atraso sem parcela futura (fase 1 não cumpre); reserva sem aplicação (sem previsão); meta já batida; % patrimônio com receita 0; `ehDivida` com descrições sintéticas — renegociação, parcelamento de fatura, empréstimo **e** compra parcelada comum (não é dívida).
- Integração: `getTrilhaDados` com dados sintéticos (parcela futura de dívida, juros de atraso, aplicação e resgate, investimento ativo).
- Componentes: faixa (link, quatro tracinhos, fase atual) e tela (quatro cartões, dinheiro com `money`).
- Prévia local (cópia dos dados só na máquina) no celular e no computador; produção: home e `/trilha` em 200, tempo da primeira chamada medido.

## Fora do F3

Editar metas pela tela (F4); marcar "isso é/não é dívida" (F4); avisos da trilha no bot (D); simulador de "quando saio de cada fase se cortar X".
