# Meta do débito: card, acompanhamento e alertas · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** card da meta na home (casal), mensagem do Zeca terça/sexta 9h e alertas (ritmo, 80%, 100%, tetos do Orçamento).

**Architecture:** tudo sai de uma função pura (`estadoMeta`) e de uma decisão pura (`alertasDaMeta`); o painel junta os
dados (`getMetaMes`, rota interna `/api/resumo/meta`); o worker só monta o texto e guarda o "já avisei" no `estado` do
registro de notificações. Sem migração.

**Tech Stack:** Next.js 14, TypeScript, pg, Vitest, croner (worker).

**Spec:** `docs/superpowers/specs/2026-10-15-meta-debito-acompanhamento-design.md`

## Global Constraints

- Meta = `debitoParaSairAte(base, hoje, mês de hoje + 12)`, recalculada todo dia; só visão do casal.
- Gasto = débito do mês **até hoje** (`classe='despesa'`, `forma='Débito'`, fora `CASA_CATS`, sem espelho) — o mesmo recorte de `getRealizado().debito`, com `data_lancamento <= hoje`.
- Alertas: uma vez por mês; ritmo pode repetir se voltar e sair. Horários 16h50 e 8h05; mensagem 2×/semana ter/sex 9h.
- Todo dinheiro na tela com `money`; valores de teste inventados.

## Review Focus

1. Dia 1 (gasto 0): situação `dentro` ou `ritmo_passa`, nunca 80/100 — teste em Task 1.
2. Meta sobe e o % cai de 80 para 79: não repete nem "desavisa" — Task 1.
3. Sem meta (null): sem card, sem mensagem, só alertas de Orçamento — Tasks 1, 3, 4.
4. Último dia: porDia = falta — Task 1.
5. Visão individual: card some — Task 3.

---

### Task 1: `src/lib/metaMes.ts` — `estadoMeta` e `alertasDaMeta`

**Produces:**
- `interface EntradaMeta { meta: number | null; gasto: number; previstoFim: number; diaHoje: number; diasNoMes: number }`
- `interface EstadoMeta { meta: number; gasto: number; pct: number; falta: number; porDia: number; diasRestantes: number; previstoFim: number; acimaNoRitmo: number; situacao: 'dentro' | 'ritmo_passa' | 'passou_80' | 'estourou' }`
- `estadoMeta(e: EntradaMeta): EstadoMeta | null` (null sem meta)
- `interface MemoriaAlertas { mes: string; ritmoFora: boolean; avisos: string[] }`
- `type Alerta = { tipo: 'ritmo'; previstoFim; acima; porDia } | { tipo: '80' | '100'; gasto; meta; diasRestantes } | { tipo: 'orcamento'; item; emoji; pct: 80 | 100; gasto; teto }`
- `alertasDaMeta(est: EstadoMeta | null, orcamento: { item; emoji; teto; gasto }[], anterior: MemoriaAlertas | null, mes: string): { alertas: Alerta[]; memoria: MemoriaAlertas }`

Testes (`test/lib/metaMes.test.ts`): as 4 situações; porDia = falta ÷ (diasRestantes + 1); último dia; null sem meta;
alerta dispara uma vez; 80 → 79 não repete; ritmo volta (`previstoFim ≤ meta` → `ritmoFora=false`) e sai de novo → avisa;
mês novo zera; 100 implica não mandar 80 junto se os dois cruzarem na mesma rodada (manda só o 100, marca os dois);
orçamento 80/100 por item, uma vez.

### Task 2: dados no painel — `getMetaMes`, `getOrcamentoMes`, rota `/api/resumo/meta`

`queries.ts`: `getDebitoMesAte(hoje)` (SQL do recorte acima); `getOrcamentoMes(hoje)` (teto e gasto do mês até hoje por
item ativo); `getMetaMes(hoje)` → `{ mes, mesLabel, estado: EstadoMeta | null, orcamento }` usando `getProjecaoBase('casal')`,
`computeProjecao(base, 1, hoje)[0]` (previstoFim = gasto + `despesaVariavel` + `despesaFixa`), `debitoParaSairAte`.
Rota `src/app/api/resumo/meta/route.ts` (protegida pelo middleware `/api/resumo/*`). Teste de integração com o banco
descartável: débito até hoje ignora casa, crédito, espelho e data futura.

### Task 3: card na home

`src/app/components/CardMeta.tsx` (barra verde/âmbar/vermelha, ainda pode e por dia, ritmo só quando passa, link da
Previsão, `money`); `src/app/page.tsx` mostra só com `resp === 'casal'` e estado não nulo. Render test.

### Task 4: worker — `meta` e `alerta-meta`

`textos.ts`: `Bot` ganha `'meta' | 'alerta-meta'`; `cli.ts` AGENDA: `['0 9 * * 2,5', 'meta']`, `['50 16 * * *', 'alerta-meta']`,
`['5 8 * * *', 'alerta-meta']`; `motor.ts` `destinoDe` → grupo; `montar`: `montarMeta(dados, url)` e
`montarAlertas(dados, estado)` (estado = `MemoriaAlertas`); `fontes.ts`: ambos de `/api/resumo/meta`.
`textosD.ts`: `montarMeta`, `montarAlertas`. `avisos.ts`: orçamento sai do diário (vira alerta). Testes dos textos e do
motor (estado gravado, sem repetir).

### Task 5: produção

Suíte + build; `deploy.sh ambos`; `NOTIF_REAL` ganha `meta,alerta-meta` (compose, backup antes); recriar o worker fora
das janelas; `notif-meta --dry-run` e `notif-alerta-meta --dry-run` com o dado real; print do card; vault; PR + merge.
