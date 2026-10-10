# F2a — Modelo da previsão: débito com tendência e faixa de incerteza

Data: 10/10/2026 · Projeto: Finanças do Casal · Parte 1 de 2 do F2 (F2a modelo → F2b tela mês a mês). Continua o P1 (`2026-10-09-p-previsibilidade-design.md`).

## Objetivo

Tornar a previsão dos próximos meses confiável o bastante para três decisões, e mostrar quanto ela pode errar:

1. **Quando saio do vermelho** — o primeiro mês com saldo positivo, provável e pelo pior caso.
2. **Se cabe uma compra** — se algum mês à frente vai para o vermelho por causa dela, pelo pior caso.
3. **Quanto guardar por mês** — a sobra prevista de cada mês, provável e pelo pior caso.

Essas decisões olham de 6 a 12 meses à frente. Hoje o maior erro da previsão é o **gasto no débito**: ele vem caindo ao longo do ano e a média não acompanha, então os meses à frente saem pessimistas.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Para que serve | Quando saio do vermelho · se cabe uma compra · quanto guardar por mês |
| Faixa | Conter o valor real em **8 de cada 10** meses (percentis 10 e 90 do erro) |
| Débito | Escolher o estimador pelo teste contra o passado (abordagem 1), não por palpite |
| Mudança de cidade | Fora do F2a (a função `aplicarCenario` já existe; entra na tela depois) |
| Tela | Fora do F2a; o F2b redesenha a Previsão com estes números |

## 1. Teste contra o passado ampliado

`src/lib/backtest.ts` + `scripts/backtest.ts` passam a avaliar:

- **Meses avaliados:** os 12 últimos meses fechados (hoje: out/2025–set/2026). O histórico de débito começa em abr/2025, então cada mês avaliado tem pelo menos 6 meses de base.
- **Horizontes 1, 2 e 3:** a previsão do mês M é feita na véspera de M (horizonte 1), na véspera de M−1 (horizonte 2) e na véspera de M−2 (horizonte 3), sempre com `hoje` no passado (o "conhecido em hoje" do P1).
- **Por componente:** receita, débito (livre + travado), casa, fatura e **saldo do mês** (receita − débito − casa − fatura).
- **Medidas:** erro absoluto médio e viés (média do erro com sinal), por componente e horizonte.
- **Saída:** só a tabela agregada; nenhum lançamento individual. Os números ficam no vault, não no repositório.

## 2. Estimador do débito

Hoje o débito do mês futuro é a média dos "meses confiáveis" (até 3 dos últimos 6). Candidatos, cada um aplicado ao gasto livre e ao travado do mesmo jeito:

| Candidato | Regra |
|---|---|
| `confiaveis` (atual) | média dos meses confiáveis |
| `media3` | média dos 3 últimos meses fechados |
| `ponderada6` | média dos 6 últimos meses fechados com peso que cai pela metade a cada mês para trás (1, ½, ¼, …) |
| `mediana3` | mediana dos 3 últimos meses fechados |

O estimador é uma função pura `estimarDebito(meses: { mes: string; livre: number; fixo: number }[], regra): { livre: number; fixo: number }`, alimentada por uma consulta dos totais mensais do débito.

**Critério de escolha:** fica o candidato com o **menor erro absoluto médio do saldo do mês no horizonte 1**, desde que **nenhuma medida** (componente × horizonte 1, 2, 3) fique **pior** que a do estimador atual. Se nenhum candidato cumprir, fica o atual e o resultado é registrado.

## 3. Faixa de incerteza

### Calibração

- Os erros do **saldo do mês** (`previsto − real`) no horizonte 1, nos 12 meses avaliados, dão os percentis **p10** e **p90**.
- Para o mês k à frente (k = índice em `computeProjecao`: 0 é o mês em andamento, com regra própria abaixo; 1 é o mês seguinte), a faixa do **saldo acumulado** é `saldoProjetado_k + p10·√k` (pior caso) até `saldoProjetado_k + p90·√k` (melhor caso). O √k vem de tratar o erro de cada mês como independente: errar o gasto de um mês arrasta o saldo de todos os seguintes.
- A faixa da **sobra do mês** k (fluxo) é `saldo_k + p10` até `saldo_k + p90`.
- O mês em andamento usa a mesma régua, proporcional aos dias que faltam: `fechaCom + p10·(diasRestantes/diasNoMes)` até `fechaCom + p90·(diasRestantes/diasNoMes)`.
- A calibração guarda `n` (quantos meses entraram) e a data em que foi calculada.

### Janela da calibração (decidido com o Matheus em 10/10/2026, durante a execução)

O teste de 12 meses mostrou dois regimes: até jun/2026 (emprego anterior, dívida com faturas pagas em parte, renda irregular) a previsão errava o saldo do mês em vários milhares; desde jul/2026 (fatura paga inteira, renda estável) o erro voltou à casa das centenas. Calibrar com os dois daria uma faixa inútil. A calibração usa **só os meses desde `INICIO_REGIME` = jul/2026** dentro dos 12 últimos. Com menos de 6 desses meses (até dez/2026) a previsão sai **sem faixa** e as decisões usam o número provável; a faixa aparece sozinha a partir de jan/2027. A validação fora da amostra (cobertura 70–90%) só é possível quando houver 6 meses anteriores no regime — fica registrada como pendente até lá.

### Onde é calculada

Função `getCalibracao()` no painel: roda o teste do §1 (horizonte 1) para os 12 meses, calcula p10/p90 e guarda em memória por 24 horas. A primeira consulta depois de um deploy espera o cálculo; as seguintes usam o que está em memória. Sem banco novo, sem tarefa nova no worker.

Se a calibração falhar ou tiver menos de 6 meses, a previsão sai **sem faixa**, com o motivo, e as decisões usam só o número provável.

### Validação

Rodando o teste do §1 com a faixa, o valor real precisa cair dentro dela entre 7 e 9 de cada 10 meses avaliados (horizonte 1). Fora disso, a calibração está errada e é revista antes de subir.

## 4. Decisões prontas (funções puras)

Em `src/lib/decisoes.ts`, sobre a projeção (`ProjecaoMes[]`, 24 meses) e a calibração:

- `saiDoVermelho(projecao, calib)` → `{ provavel: 'AAAA-MM' | null; piorCaso: 'AAAA-MM' | null }`: primeiro mês cujo saldo acumulado (provável / limite de baixo) fica ≥ 0 e **continua** ≥ 0 nos meses seguintes do horizonte. `null` = não sai no horizonte.
- `compraCabe(projecao, calib, valorParcela, parcelas)` → `{ cabe: boolean; mesQueFura: 'AAAA-MM' | null }`: aplica a compra como o simulador de hoje e verifica, pelo **limite de baixo**, se algum mês que estava ≥ 0 passa a < 0. Mês que já estava negativo sem a compra não conta como "furado" por ela; nesse caso o resultado informa o mês mais negativo.
- `sobraPorMes(projecao, calib)` → `{ mes; provavel; piorCaso }[]`: a sobra (fluxo) de cada mês e o limite de baixo.

Sem calibração, `piorCaso` = `provavel`.

## 5. Onde aparece no F2a

- **`/api/previsao`** ganha `faixa: { piorCaso, melhorCaso, n } | null` para o mês em andamento, `saiDoVermelho` e `proximosMeses[].piorCaso`. Os bots podem usar sem mudar nada agora.
- **Previsão (tela atual):** abaixo do fechamento do mês, a linha "Sai do vermelho em **MMM/AA** (pelo pior caso, **MMM/AA**)" e, na tabela dos meses, uma coluna "pior caso". O simulador de compra passa a dizer "cabe" / "fura em MMM/AA pelo pior caso".
- **Home:** o "Fecha o mês em" ganha embaixo "entre X e Y" quando houver calibração.
- O redesenho da tela é do F2b.

## 6. Aceite e testes

- **Aceite do estimador:** §2 (nenhuma medida pior que o atual; menor erro do saldo no horizonte 1).
- **Aceite da faixa:** §3 (cobertura entre 70% e 90% no horizonte 1).
- **Unitários:** `estimarDebito` (cada regra, menos de 3 meses, mês zerado), percentis e √k, `saiDoVermelho` (sai, sai e volta a entrar, nunca sai, já está positivo), `compraCabe` (cabe, fura, já estava negativo), `sobraPorMes`, previsão sem calibração.
- **Integração (Postgres descartável):** totais mensais do débito por pessoa, livre × travado, sem espelhos do cartão.
- **Na VPS:** teste do §1 antes e depois, com a tabela no vault.

## Fora do F2a

Tela mês a mês, previsto × realizado no passado e detalhe de cada linha (F2b); cenário de mudança de cidade na tela; investimentos e reserva na projeção (F3); faixa para a receita separada da do saldo.
