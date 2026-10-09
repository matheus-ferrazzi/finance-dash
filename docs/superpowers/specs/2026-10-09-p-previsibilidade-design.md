# P — Previsibilidade confiável

Data: 2026-10-09 · Status: aprovado em conversa ("por favor pode seguir")

## Objetivo

Responder com confiança "quanto vou ter daqui a X meses" e "se eu gastar isto agora, o que acontece",
como a planilha do Breno, só que sem preencher nada à mão. Duas fases:

- **P1 — modelo** (este spec em detalhe): corrigir os erros medidos, permitir calcular a previsão
  "como se fosse" uma data passada, e transformar isso em teste contra o passado.
- **P2 — tela** (esboço no fim; detalha-se com protótipos, junto do F): navegar mês a mês.

## O que a medição de 09/10/2026 mostrou

Previsão feita no dia 1º de cada mês × o que aconteceu (casal, base caixa):

| Componente | Ago | Set | Causa |
|---|---|---|---|
| Saldo do mês | erro pequeno | erro pequeno | — mas por compensação entre os componentes abaixo |
| Receita | superestimada | superestimada | média simples puxada por meses com entrada fora do padrão |
| Gasto no débito | ok | superestimado | o gasto migrou do débito para o cartão |
| Fatura | ok | subestimada | estimada pelas parcelas **datadas** no mês, que oscilam sem relação com a fatura |
| Aplicação automática Itaú | — | — | descartado: o saldo da Pluggy já a inclui |

Também medido: `billForecastDate` tem semântica diferente por banco — no Nubank é o mês do
vencimento, no Neon e no Santander é o mês anterior a ele.

## P1 — Mudanças no modelo

### 1. Previsão "como se fosse" uma data (`hoje`)

`getProjecaoBase(resp, hoje)`, `computeProjecao(base, horizonte, hoje)` e
`computeRitmo(base, atual, hoje)` recebem a data de referência (padrão: hoje em SP). Todo SQL da
projeção troca `now()` pelo parâmetro. Sem isso não há teste contra o passado.

As funções puras saem de `queries.ts` para `src/lib/previsao.ts` (testáveis sem banco);
`queries.ts` reexporta os mesmos nomes, então páginas, API e bots não mudam de import.

### 2. Receita por fonte recorrente

Cada entrada (`classe='receita'`) tem uma **fonte**: o documento da contraparte quando existe,
senão a descrição normalizada (sem dígitos). Nos meses-base (os mesmos "meses confiáveis" de hoje):

- fonte **recorrente** = aparece em pelo menos 2 meses-base (ou em todos, se houver menos de 2);
- valor da fonte = **mediana** dos totais mensais dela, contando só os meses em que apareceu;
- receita mensal prevista = soma das fontes recorrentes. Entrada avulsa não entra.

No mês corrente, "ainda entra" = fontes recorrentes que ainda não apareceram no mês + receita já
agendada. Substitui `receitaMediaMensal` (média simples) e `getReceitasAReceber`.

### 3. Fatura pelo vencimento real

Toda despesa no crédito ganha um **mês de vencimento**, nesta ordem:

1. `fatura_id` → vencimento da fatura em `financas_faturas_historico` (exato);
2. `fatura_prevista` + **deslocamento da conta**, aprendido dos lançamentos que têm as duas
   coisas (moda de `vencimento − fatura_prevista`, em meses);
3. mês de `data_lancamento` + 1 (comportamento de cartão típico).

Com isso:

- **Mês corrente:** fatura que ainda sai = soma das faturas reais que vencem no mês − o que já
  foi pago no mês (nunca negativo).
- **Mês seguinte:** fatura conhecida (aberta) que vence nele + compras novas médias pela fração do
  ciclo que ainda falta até o fechamento.
- **Meses depois:** parcelas já lançadas que vencem naquele mês + compras novas médias no crédito.

Substitui `faturaDoMes` (parcelas pela data do lançamento).

### 4. Cenário de mudança de cidade

`aplicarCenario(base, { aPartirDe: 'AAAA-MM', categoria, valor })`, função pura: encerra o
compromisso daquela categoria no mês anterior e cria um com o valor novo a partir de `aPartirDe`.
Não grava nada. Usado pela tela (P2) e pelo simulador. Ex.: aluguel R$ X a partir de mar/2027.

### 5. Teste contra o passado

`scripts/backtest.ts` (roda na VPS, só lê): para cada um dos últimos 3 meses fechados, calcula a
previsão com `hoje` = dia 1º do mês e compara com o realizado, por componente (receita, débito fora
casa, casa + compromissos, fatura paga) e no total. Saída: tabela de erros, sem valores de
lançamento individuais.

**Critério de aceite (revisado em 09/10/2026, com o Matheus):** nenhuma medida pior que o modelo
anterior, comparando os dois do mesmo ponto de vista (previsão do mês inteiro feita na véspera, e
"quanto ainda entra" no dia 10), pelo erro absoluto médio dos 3 últimos meses fechados. O critério
original (receita ≤ R$ 400, fatura ≤ R$ 400 e saldo ≤ R$ 500 em todo mês) mostrou-se inatingível
para uma previsão de número único: a renda real alterna de patamar mês a mês e o gasto no débito
oscila mais que isso. A incerteza passa a ser mostrada como **faixa** na tela (P2).

Resultado do P1 (jul–set/2026): erro médio da fatura caiu a cerca de um quarto, o do saldo do mês
quase pela metade, o do "ainda entra" no meio do mês a menos da metade; receita do mês inteiro
empatou (dentro da variação da renda). Números no vault, não no repositório público.

Limite conhecido: a fatura **aberta** do mês seguinte não é reconstituível no passado (só temos o
valor final), por isso o teste avalia o mês de referência, não o seguinte.

## Fora do P1

- Saldo em conta "como se fosse" uma data passada (a Pluggy só dá o saldo de hoje): o teste compara
  fluxos do mês, não saldo.
- Investimentos e reserva entrando na projeção (vai para o F, junto da trilha do Breno).

## Testes

- Unitários (vitest, sem banco): `receitaRecorrente`, mês de vencimento com as três regras,
  fatura do mês corrente / seguinte / posteriores, `aplicarCenario`, e `computeProjecao` com `hoje`
  fixo dando os mesmos números de antes quando nada mudou nos dados.
- Integração (Postgres descartável): `getProjecaoBase` com `hoje` no passado ignora o que veio depois.
- Backtest na VPS antes e depois.

## P2 — Tela (esboço; detalhar com protótipos)

- Navegação mês a mês (`?mes=AAAA-MM` na URL): entra / sai / sobra do mês / saldo acumulado.
- Cada linha abre o detalhe: quais faturas, quais parcelas, quais fixos, quais fontes de receita.
- Meses passados: **previsto × realizado**, usando a mesma previsão "como se fosse" o dia 1º.
- Cenário de mudança de cidade e simulador de compra na mesma régua.
- Faz parte do redesenho F (home como fonte principal, cada número leva à tela que o explica).
