# Meta do débito: card na home, acompanhamento do Zeca e alertas

Data: 15/10/2026 · Pedido do Matheus: "a meta e o quanto eu gastei não se conversam e eu não tenho nenhum aviso".
Design aprovado em conversa em 15/10 (respostas: meta acompanha a previsão todo dia; mensagem própria 2×/semana +
alertas; alertas de ritmo, 80%, 100% e também dos tetos do Orçamento).

## Objetivo

A meta de gasto no débito (a da Previsão: o máximo de débito por mês que faz sair do vermelho em 12 meses) vira algo
acompanhado: um card na home mostra meta × gasto × quanto ainda pode; o Zeca manda o andamento 2× por semana; e avisa na
hora quando o ritmo vai passar da meta, quando chega a 80% e quando estoura — e também quando um teto do Orçamento é
cruzado.

## Decisões

| Tema | Decisão |
|---|---|
| Qual meta | A da Previsão: `debitoParaSairAte(base, hoje, mês de hoje + 12)` — **recalculada todo dia** (não fixa no mês) |
| O que conta como gasto | O mesmo recorte da meta: débito do mês = gasto livre no débito + débitos fixos (consórcio, seguro, imposto, tarifa). **Fora:** casa (aluguel, luz…), fatura do cartão, dinheiro vivo |
| Ritmo ("fecha em") | gasto até hoje + o que a previsão ainda espera de débito no mês (`despesaVariavel + despesaFixa` do mês em andamento da `computeProjecao`, que já são "o que falta") |
| Quem vê | Só a visão do **casal** (a meta é do casal). Nas visões individuais, o card não aparece |
| Sem meta | `debitoParaSairAte` = null ("nem zerando sai"): sem card, sem mensagem, sem alerta de meta (os de Orçamento seguem) |
| Repetição | Cada alerta dispara **uma vez por mês**; o de ritmo pode voltar se o ritmo voltar para dentro e sair de novo |
| Banco | Nenhuma migração: o "já avisei" fica no `estado` (jsonb) de `financas_notificacoes`, como a marca d'água do gasto grande |

## 1. O estado da meta (função pura, `src/lib/metaMes.ts`)

```
estadoMeta({ meta, gasto, previstoFim, diaHoje, diasNoMes }) → {
  meta, gasto, pct (gasto/meta, 0–∞, arredondado), falta (max(0, meta − gasto)),
  porDia (falta ÷ (dias que faltam + 1), igual ao "dá pra gastar" do ritmo), diasRestantes,
  previstoFim, acimaNoRitmo (max(0, previstoFim − meta)), situacao: 'dentro' | 'ritmo_passa' | 'passou_80' | 'estourou'
}
```

`situacao`: estourou se gasto > meta; senão passou_80 se pct ≥ 80; senão ritmo_passa se previstoFim > meta; senão dentro.
A mesma função alimenta o card, a mensagem e os alertas.

Dados: `getMetaMes(hoje)` em `queries.ts` (casal) junta `getProjecaoBase('casal')`, `computeProjecao`, `debitoParaSairAte`
e o débito do mês até hoje (`getRealizado(mesAtual).debito`, o mesmo componente que o teste contra o passado usa). Rota
interna `/api/resumo/meta` (com o token `x-interno`) devolve `estadoMeta` + `orcamento` (os tetos, como `getDadosAvisos`).

## 2. Card na home (visão do casal)

Abaixo da linha do mês, largura cheia:

> 🎯 Meta do débito · **R$ 3.100** de R$ 4.750 · barra (verde < 80%, âmbar ≥ 80%, vermelha > 100%)
> Ainda pode **R$ 1.650** (R$ 97/dia) · no ritmo atual fecha em R$ 5.300 ⚠️ (só quando passa da meta)

Toque → `/previsibilidade`. Estourou: "Passaram da meta em R$ X" em vermelho. Todo valor com `money`.

## 3. Mensagem 2× por semana (`notif-meta`, terça e sexta 9h, WhatsApp, modo real com `NOTIF_REAL`)

```
🎯 *Meta do débito em <mês>*
💸 R$ 3.100 de R$ 4.750 (65%), faltam 16 dias
🐢 Dá pra gastar R$ 103/dia até o fim            (estourou: 🔴 Passaram da meta em R$ 40)
📈 No ritmo atual fecha em R$ 5.300 🔴 (R$ 550 acima)   (dentro: ✅ No ritmo atual fecha em R$ 4.400, dentro da meta)
👉 <link da Previsão>
```

Sem meta: não manda nada (registro em sombra com o motivo).

## 4. Alertas (`notif-alerta-meta`, 16h50 e 8h05, WhatsApp)

Conferidos depois da ingestão das 16h (16h50) e de manhã (8h05, para o que a ingestão das 22h trouxe — nada às 23h).
Um alerta por mensagem; vários no mesmo horário vão juntos numa mensagem só.

| Alerta | Dispara quando | Texto |
|---|---|---|
| Ritmo | `previstoFim > meta` e no estado do mês ainda não está "fora" | ⚠️ No ritmo atual, o débito de <mês> fecha em R$ 5.300 — R$ 550 acima da meta. Dá pra gastar R$ 97/dia até o fim |
| 80% | `pct ≥ 80` e ainda não avisado no mês | 🟡 Já foram 80% da meta do débito: R$ 3.800 de R$ 4.750, faltam 12 dias |
| 100% | `gasto > meta` e ainda não avisado | 🔴 Passaram da meta do débito de <mês>: R$ 4.790 de R$ 4.750 |
| Orçamento | categoria/grupo do Orçamento cruzou 80% ou 100% do teto e ainda não avisado (categoria × limite) no mês | 🧾 Mercado passou de 80% do teto: R$ 1.210 de R$ 1.500 |

Estado (`estado` jsonb do bot `alerta-meta`): `{ mes: 'AAAA-MM', ritmoFora: boolean, avisos: string[] }` — `avisos` com
`'80'`, `'100'`, `'orc:<item>:80'`… Virou o mês: estado zera. O ritmo marca `ritmoFora=true` ao avisar e volta a `false`
quando `previstoFim ≤ meta` (aí pode avisar de novo).

O aviso de **Orçamento sai do diário** (hoje é uma linha "passou de 80%" lá): vira o alerta na hora; o diário fica com os
outros avisos (cheque especial, juros, fora do padrão).

## 5. Testes

- `estadoMeta`: dentro / ritmo passa / 80% / estourou, porDia no último dia, meta 0, gasto 0.
- Decisão dos alertas (função pura `alertasDaMeta(estadoMeta, orcamento, estadoAnterior, mes)` → `{ alertas, novoEstado }`):
  dispara uma vez; não repete no mesmo mês; ritmo volta e sai de novo → avisa outra vez; mês novo zera; sem meta → só orçamento.
- Textos (`montarMeta`, `montarAlertas`) com valores inventados; render do card (valores com `money`, link da Previsão).
- Integração: `/api/resumo/meta` responde com o token; sem token, 403.

## Review Focus

1. Primeiro dia do mês (gasto 0, nada de alerta falso) e último dia (porDia = falta).
2. Meta que se mexe: um dia 80%, no outro 79% (meta subiu) — não repete o 80% nem "desavisa".
3. Ingestão atrasada (conexão parada): gasto subestimado — o alerta só vem quando o dado chegar; nada a fazer além disso.
4. Visão individual: card não aparece; Zeca só fala do casal.
5. Sem meta (null): card, mensagem e alertas de meta somem; Orçamento segue.

## Fora do escopo

Meta por pessoa; meta definida à mão; mudar o cálculo da meta.
