# F2b — Previsão mês a mês: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a tela de Previsão por uma lista de meses (passado real × previsto, mês atual, futuro) que abre o detalhe de cada mês, com a meta e os compromissos abaixo, e mover o simulador para `/simulador`.

**Architecture:** Dados novos em `src/lib/queries.ts` (`getRealizado` por pessoa, `getMesesPassados`); o que a tela mostra é montado por funções puras em `src/lib/mesAMes.ts`; a página `/previsibilidade` decide entre lista e detalhe pelo `?mes=`; componentes de servidor desenham (`ListaMeses`, `DetalheMes`, `MetaDebito`); o `PrevisibilidadeClient` fica só com compromissos e cadastro de fixos. Nenhum número novo: tudo vem de `computeProjecao`/`getProjecaoBase`/`getRealizado`/F2a.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, `pg`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-10-f2b-previsao-mes-a-mes-design.md`

## Global Constraints

- Nenhuma dependência nova.
- Repositório público: nenhum valor real em reais, CPF/CNPJ, nome de terceiro ou descrição da situação financeira pessoal em código, teste, comentário ou commit.
- Todo dinheiro mostrado leva a classe `money` (o olho de esconder valores); texto que não é dinheiro não leva.
- Mês `AAAA-MM`; `?mes` inválido ou fora do intervalo mostra a lista, sem erro.
- Lista: 3 meses passados, o mês atual, 12 futuros (botão "ver até 24").
- Previsto de mês passado = previsão feita na véspera do mês (último dia do mês anterior).
- Testes: `npx vitest run`; integração com `TEST_DATABASE_URL` (Postgres descartável em 127.0.0.1:55432, banco `personal_hub_db`).
- Commits via `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **`?mes` de um mês fora da lista** (ex.: 2020-01, ou 30 meses à frente) → a lista, sem erro nem tela vazia. (Task 5)
2. **Mês futuro sem parcela conhecida no cartão** → linha "Cartão" mostra só "compras novas (média)"; a soma das linhas continua igual à sobra. (Task 3)
3. **Pessoa sem receita prevista** (fonte nenhuma) → "Entra" com 0 e "nenhuma receita prevista", sem quebrar. (Task 3)
4. **Mês passado sem nenhum lançamento** (conta conectada depois) → real 0 em tudo, diferença = −previsto, sem erro. (Task 2, Task 3)
5. **Visão de uma pessoa** → passado, real e saldo no fim filtrados pela pessoa; nada do outro entra. (Task 1, Task 2)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/queries.ts` | `getRealizado(mes, resp)`, `getMesesPassados(resp, hoje)` |
| `src/lib/mesAMes.ts` (novo) | `linhasDaLista`, `detalheMesFuturo`, `detalheMesAtual`, `detalheMesPassado`, tipos |
| `src/lib/previsao.ts` | exporta `compromissoAtivoNoMes` |
| `src/lib/links.ts` | tela `'simulador'` |
| `src/app/components/ListaMeses.tsx` (novo) | a lista (B) |
| `src/app/components/DetalheMes.tsx` (novo) | o detalhe (A), linhas que abrem |
| `src/app/components/MetaDebito.tsx` (novo) | o cartão da meta (sai do `PrevisibilidadeClient`) |
| `src/app/components/SimuladorPagina.tsx` (novo) + `src/app/simulador/page.tsx` (novo) | simulador em tela própria |
| `src/app/previsibilidade/page.tsx` | topo + lista ou detalhe + meta + compromissos |
| `src/app/components/PrevisibilidadeClient.tsx` | só compromissos e cadastro de fixos |
| `src/app/components/ProjecaoPainel.tsx` | removido (substituído pela lista) |
| `src/app/components/Nav.tsx` | "Simulador" no Mais |

---

### Task 1: `getRealizado` por pessoa

**Files:** Modify `src/lib/queries.ts` (`getRealizado`); Test `test/integracao/previsao.test.ts`

**Interfaces:** Produces `getRealizado(mes: string, resp: Resp = 'casal'): Promise<Componentes>`

- [ ] **Step 1: teste (falha primeiro)** — acrescentar em `test/integracao/previsao.test.ts`:

```ts
it('realizado do mês filtra pela pessoa', async () => {
  await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
    ('rz-1', '2033-03-05', 1000, 'salario', 'Salary', 'Débito', 'X', 'Ariane', 'receita', 'Entrada', '2033-03-05'),
    ('rz-2', '2033-03-06', 300, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2033-03-06'),
    ('rz-3', '2033-03-07', 500, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2033-03-07')`);
  expect(await queries.getRealizado('2033-03', 'Ariane')).toMatchObject({ receita: 1000, debito: 300, saldo: 700 });
  expect(await queries.getRealizado('2033-03')).toMatchObject({ receita: 1000, debito: 800, saldo: 200 });
});
```

Run integração → FAIL (o primeiro `expect` dá débito 800, porque hoje não filtra).

- [ ] **Step 2: implementar** — assinatura `getRealizado(mes: string, resp: Resp = 'casal')`, `const r = rf(resp, 3);`, acrescentar `${r.sql}` ao fim do `WHERE` e `...r.p` aos parâmetros (`[\`${mes}-01\`, CASA_CATS, ...r.p]`).

- [ ] **Step 3:** integração → PASS; `scripts/backtest.ts` e `getCalibracao` continuam chamando `getRealizado(mes)` (casal) — sem mudança.
- [ ] **Step 4: commit** — `feat(previsao): realizado do mes por pessoa (F2b)`.

---

### Task 2: `getMesesPassados`

**Files:** Modify `src/lib/queries.ts`; Test `test/integracao/previsao.test.ts`

**Interfaces:**
- Consumes: `getRealizado(mes, resp)` (Task 1), `getProjecaoBase`, `computeProjecao`, `componentesPrevistos`, `getMovimentosDiarios`, `getSaldoContas`
- Produces:
  - `interface MesPassado { mes: string; previsto: Componentes; real: Componentes; saldoFim: number }`
  - `getMesesPassados(resp: Resp, hoje: string = currentDateSP(), n = 3): Promise<MesPassado[]>` — do mais antigo ao mais recente; `saldoFim` = saldo de hoje − movimentos líquidos de débito do dia 1º do mês seguinte até hoje; cache por `${resp}|${mês de hoje}` (promessa; erro não fica em cache)

- [ ] **Step 1: teste (falha primeiro)**

```ts
it('meses passados: previsto na véspera, real e saldo no fim reconstruído, por pessoa', async () => {
  await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo, atualizado_em) VALUES ('mp-c', 'X', 'Ariane', 'checking', 900, now())
    ON CONFLICT (id_conta) DO UPDATE SET saldo = 900`);
  await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
    ('mp-1', '2034-02-10', 200, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2034-02-10'),
    ('mp-2', '2034-03-10', 100, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2034-03-10')`);
  const r = await queries.getMesesPassados('Ariane', '2034-04-15');
  expect(r.map((m) => m.mes)).toEqual(['2034-01', '2034-02', '2034-03']);
  expect(r[1].real.debito).toBe(200);
  expect(r[2].saldoFim).toBe(900);       // nada depois de março
  expect(r[1].saldoFim).toBe(1000);      // desfaz os 100 de março
  expect(r[0].real).toMatchObject({ receita: 0, debito: 0, saldo: 0 }); // mês sem lançamento
});
```

> Se `financas_saldos` em `test/integracao/base.sql` tiver outras colunas obrigatórias, ajustar o `INSERT` ao schema dele (ledger).

Run → FAIL "getMesesPassados is not a function".

- [ ] **Step 2: implementar** (em `queries.ts`, perto de `getCalibracao`):

```ts
export interface MesPassado { mes: string; previsto: Componentes; real: Componentes; saldoFim: number }

// promessa por pessoa+mês; virou o mês, as chaves do mês anterior saem (as das outras pessoas ficam)
const cachePassados = new Map<string, Promise<MesPassado[]>>();

/** Os `n` meses fechados antes do atual: previsto na véspera × real × saldo em conta no fim (reconstruído). */
export function getMesesPassados(resp: Resp, hoje: string = currentDateSP(), n = 3): Promise<MesPassado[]> {
  const mesRef = hoje.slice(0, 7);
  const chave = `${resp}|${mesRef}|${n}`;
  const ja = cachePassados.get(chave);
  if (ja) return ja;
  for (const k of cachePassados.keys()) if (k.split('|')[1] !== mesRef) cachePassados.delete(k);
  const p = calcularPassados(resp, hoje, n);
  cachePassados.set(chave, p);
  p.catch(() => cachePassados.delete(chave));
  return p;
}

async function calcularPassados(resp: Resp, hoje: string, n: number): Promise<MesPassado[]> {
  const atual = hoje.slice(0, 7);
  const meses = Array.from({ length: n }, (_, i) => addMonths(atual, -(n - i)));
  const [saldo, movs] = await Promise.all([getSaldoContas(resp), getMovimentosDiarios(resp, `${meses[0]}-01`, hoje)]);
  return Promise.all(meses.map(async (mes) => {
    const ant = addMonths(mes, -1);
    const vesp = `${ant}-${String(diasNoMes(ant)).padStart(2, '0')}`;
    // mesma régua da calibração: véspera do mês e a regra do débito em uso
    const [base, real] = await Promise.all([getProjecaoBase(resp, vesp, { regraDebito: REGRA_DEBITO }), getRealizado(mes, resp)]);
    const fimDoMes = `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`;
    const depois = Object.entries(movs).filter(([d]) => d > fimDoMes).reduce((s, [, v]) => s + v, 0);
    return { mes, previsto: componentesPrevistos(computeProjecao(base, 1, vesp)[1]), real, saldoFim: Math.round((saldo.total - depois) * 100) / 100 };
  }));
}
```

- [ ] **Step 3:** acrescentar ao mesmo teste a chamada repetida (`await queries.getMesesPassados('Ariane', '2034-04-15')` devolve o mesmo objeto: `toBe(r)`) e a de outra pessoa no mesmo mês (`getMesesPassados('Matheus', '2034-04-15')` não apaga a de Ariane: a 2ª chamada de Ariane continua `toBe(r)`).
- [ ] **Step 4:** integração → PASS. **Step 5: commit** — `feat(previsao): meses passados com previsto, real e saldo no fim (F2b)`.

---

### Task 3: O que a tela mostra (funções puras)

**Files:** Create `src/lib/mesAMes.ts`; Modify `src/lib/previsao.ts` (exportar `compromissoAtivoNoMes`); Test `test/lib/mesAMes.test.ts`

**Interfaces:**
- Consumes: `ProjecaoMes`, `ProjecaoBase`, `CompromissoManual` (previsao.ts); `CompromissoParcelado` (queries.ts, só o tipo); `MesPassado` (Task 2); `Calibracao`, `faixaMes`, `faixaMesCorrente` (faixa.ts)
- Produces:
  - `interface LinhaLista { tipo: 'passado' | 'atual' | 'futuro'; mes: string; sobra: number; previsto: number | null; saldoFim: number; piorCaso: number | null }`
  - `linhasDaLista(projecao: ProjecaoMes[], passados: MesPassado[], calib: Calibracao | null, diasRestantes: number, diasMesAtual: number): LinhaLista[]`
  - `interface Item { nome: string; valor: number; nota?: string }`
  - `interface LinhaDetalhe { chave: 'entra' | 'casa' | 'debito' | 'cartao'; titulo: string; total: number; itens: Item[] }`
  - `detalheMesFuturo(base: ProjecaoBase, m: ProjecaoMes, parcelados: CompromissoParcelado[]): { linhas: LinhaDetalhe[]; sobra: number; saldoFim: number }`
  - `detalheMesAtual(base: ProjecaoBase, m0: ProjecaoMes): { linhas: { chave: LinhaDetalhe['chave']; titulo: string; jaAconteceu: number; aindaFalta: number }[]; fechaCom: number }`
  - `detalheMesPassado(p: MesPassado): { linhas: { chave: string; titulo: string; previsto: number; real: number; diferenca: number }[]; saldoFim: number }`

- [ ] **Step 1: teste (falha primeiro)** — `test/lib/mesAMes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { detalheMesAtual, detalheMesFuturo, detalheMesPassado, linhasDaLista } from '../../src/lib/mesAMes';
import type { ProjecaoBase, ProjecaoMes } from '../../src/lib/previsao';

const mes = (p: Partial<ProjecaoMes>): ProjecaoMes => ({ mes: '2027-01', mesLabel: 'jan/27', receita: 5000, despesaFixa: 0, despesaManual: 1000, despesaCasa: 500, despesaVariavel: 2000, fatura: 1200, parcelas: 300, saldo: 300, saldoProjetado: 800, ...p });
const base = {
  fontesReceita: [{ fonte: 'a', nome: 'Salário A', valor: 3000, diaTipico: 5, responsavel: 'X' }, { fonte: 'b', nome: 'Salário B', valor: 2000, diaTipico: 20, responsavel: 'Y' }],
  compromissosManuais: [{ id: 1, nome: 'Aluguel', categoria: 'Housing', valor: 1000, responsavel: 'casal', dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: null }],
  despesaCasaPorCategoria: { Housing: 999, Electricity: 500 },
  despesaVariavelMediaMensal: 1600, despesaFixaDebitoMedia: 400,
  creditoPorVencimento: { '2027-01': 300 },
  mesCorrente: { recebidoPorFonte: { a: 3000 }, variavelJaGasto: 700, fixoJaGasto: 100, casaNoMesPorCategoria: { Housing: 1000 }, faturaJaPaga: 400, receitaAgendada: 0, receitasAReceber: [], agendadoRestante: 0 },
} as unknown as ProjecaoBase;
const parcelados = [{ chave: 'loja x', categoria: 'Shopping', banco: 'B1', responsavel: 'X', valorParcela: 300, restantes: 2, dataFim: '2027-02-10', parcelaAtual: 4, parcelaTotal: 6 }] as any;

describe('detalhe do mês futuro', () => {
  it('quatro linhas cujos totais fecham com a sobra do mês', () => {
    const d = detalheMesFuturo(base, mes({}), parcelados);
    const t = Object.fromEntries(d.linhas.map((l) => [l.chave, l.total]));
    expect(t).toEqual({ entra: 5000, casa: 1500, debito: 2000, cartao: 1200 });
    expect(t.entra - t.casa - t.debito - t.cartao).toBe(d.sobra);
    expect(d.sobra).toBe(300);
  });
  it('itens: salários com dia, fixos ativos + casa não cadastrada, débito livre/travado, cartão parcelas + compras novas', () => {
    const d = detalheMesFuturo(base, mes({}), parcelados);
    const it = (k: string) => d.linhas.find((l) => l.chave === k)!.itens;
    expect(it('entra')).toEqual([{ nome: 'Salário A', valor: 3000, nota: 'dia 5' }, { nome: 'Salário B', valor: 2000, nota: 'dia 20' }]);
    expect(it('casa').map((x) => x.nome)).toEqual(['Aluguel', 'Electricity']);
    expect(it('debito')).toEqual([{ nome: 'Dia a dia (média)', valor: 1600 }, { nome: 'Contas travadas (média)', valor: 400 }]);
    expect(it('cartao')).toEqual([{ nome: 'loja x', valor: 300, nota: 'B1 · parcela 4/6' }, { nome: 'Compras novas (média)', valor: 900 }]);
  });
  it('sem parcela conhecida, o cartão é só compras novas; sem receita, Entra = 0', () => {
    const d = detalheMesFuturo({ ...base, fontesReceita: [], creditoPorVencimento: {} } as ProjecaoBase, mes({ receita: 0, saldo: -4700 }), []);
    expect(d.linhas.find((l) => l.chave === 'cartao')!.itens).toEqual([{ nome: 'Compras novas (média)', valor: 1200 }]);
    expect(d.linhas.find((l) => l.chave === 'entra')!.total).toBe(0);
  });
});

describe('detalhe do mês atual e passado', () => {
  it('atual: já aconteceu × ainda falta', () => {
    const d = detalheMesAtual(base, mes({ receita: 2000, despesaVariavel: 900, despesaFixa: 100, despesaManual: 0, despesaCasa: 200, fatura: 800, saldoProjetado: -50 }));
    expect(d.linhas).toEqual([
      { chave: 'entra', titulo: 'Entra', jaAconteceu: 3000, aindaFalta: 2000 },
      { chave: 'casa', titulo: 'Casa e fixos', jaAconteceu: 1000, aindaFalta: 200 },
      { chave: 'debito', titulo: 'Débito', jaAconteceu: 800, aindaFalta: 1000 },
      { chave: 'cartao', titulo: 'Cartão', jaAconteceu: 400, aindaFalta: 800 },
    ]);
    expect(d.fechaCom).toBe(-50);
  });
  it('passado: previsto × real × diferença (real − previsto); mês vazio dá diferença = −previsto', () => {
    const z = { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: 0 };
    const d = detalheMesPassado({ mes: '2026-09', previsto: { receita: 100, debito: 50, casa: 20, fatura: 10, saldo: 20 }, real: z, saldoFim: 5 });
    expect(d.linhas.find((l) => l.chave === 'saldo')).toMatchObject({ previsto: 20, real: 0, diferenca: -20 });
    expect(d.saldoFim).toBe(5);
  });
});

describe('lista de meses', () => {
  it('passados com real e previsto, atual, futuros; pior caso só com calibração', () => {
    const passados = [{ mes: '2026-09', previsto: { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: -100 }, real: { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: 50 }, saldoFim: 900 }];
    const proj = [mes({ mes: '2026-10', saldo: -20, saldoProjetado: 880 }), mes({ mes: '2026-11', saldo: -30, saldoProjetado: 850 })];
    const l = linhasDaLista(proj, passados, null, 20, 31);
    expect(l).toEqual([
      { tipo: 'passado', mes: '2026-09', sobra: 50, previsto: -100, saldoFim: 900, piorCaso: null },
      { tipo: 'atual', mes: '2026-10', sobra: -20, previsto: null, saldoFim: 880, piorCaso: null },
      { tipo: 'futuro', mes: '2026-11', sobra: -30, previsto: null, saldoFim: 850, piorCaso: null },
    ]);
    const c = { p10: -100, p90: 100, n: 6, calculadaEm: 'x' };
    expect(linhasDaLista(proj, [], c, 20, 31)[1].piorCaso).toBe(750);
  });
});
```

Run → FAIL "Failed to load url ../../src/lib/mesAMes".

- [ ] **Step 2: implementar** — em `previsao.ts` trocar `function compromissoAtivoNoMes` por `export function compromissoAtivoNoMes`. Criar `src/lib/mesAMes.ts`:

```ts
// O que a Previsão mês a mês mostra (F2b). Só remonta números que já existem na projeção.
import { compromissoAtivoNoMes, type ProjecaoBase, type ProjecaoMes } from './previsao';
import { faixaMes, faixaMesCorrente, type Calibracao } from './faixa';
import type { Componentes } from './backtest';
import type { MesPassado } from './queries'; // só o tipo: some na compilação, não puxa o banco

export interface LinhaLista { tipo: 'passado' | 'atual' | 'futuro'; mes: string; sobra: number; previsto: number | null; saldoFim: number; piorCaso: number | null }
export interface Item { nome: string; valor: number; nota?: string }
export interface LinhaDetalhe { chave: 'entra' | 'casa' | 'debito' | 'cartao'; titulo: string; total: number; itens: Item[] }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function linhasDaLista(projecao: ProjecaoMes[], passados: MesPassado[], calib: Calibracao | null, diasRestantes: number, diasMesAtual: number): LinhaLista[] {
  return [
    ...passados.map((p): LinhaLista => ({ tipo: 'passado', mes: p.mes, sobra: p.real.saldo, previsto: p.previsto.saldo, saldoFim: p.saldoFim, piorCaso: null })),
    ...projecao.map((m, k): LinhaLista => ({
      tipo: k === 0 ? 'atual' : 'futuro', mes: m.mes, sobra: m.saldo, previsto: null, saldoFim: m.saldoProjetado,
      piorCaso: calib ? (k === 0 ? faixaMesCorrente(m.saldoProjetado, diasRestantes, diasMesAtual, calib).piorCaso : faixaMes(m.saldoProjetado, k, calib).piorCaso) : null,
    })),
  ];
}

export function detalheMesFuturo(base: ProjecaoBase, m: ProjecaoMes, parcelados: { chave: string; banco: string; valorParcela: number; dataFim: string; parcelaAtual: number | null; parcelaTotal: number | null }[]) {
  const ativos = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, m.mes));
  const cobertas = new Set(ativos.map((c) => c.categoria));
  const conhecidas = parcelados.filter((p) => p.dataFim.slice(0, 7) >= m.mes);
  const somaConhecidas = Math.min(m.fatura, base.creditoPorVencimento[m.mes] ?? 0);
  const linhas: LinhaDetalhe[] = [
    { chave: 'entra', titulo: 'Entra', total: m.receita, itens: base.fontesReceita.map((f) => ({ nome: f.nome, valor: f.valor, nota: `dia ${f.diaTipico}` })) },
    { chave: 'casa', titulo: 'Casa e fixos', total: r2(m.despesaManual + m.despesaCasa), itens: [
      ...ativos.map((c) => ({ nome: c.nome, valor: c.valor })),
      ...Object.entries(base.despesaCasaPorCategoria).filter(([cat]) => !cobertas.has(cat)).map(([cat, v]) => ({ nome: cat, valor: r2(v) })),
    ] },
    // nos meses futuros despesaFixa é 0 (o travado já está em despesaVariavel); somar não muda nada e protege se mudar
    { chave: 'debito', titulo: 'Débito', total: r2(m.despesaVariavel + m.despesaFixa), itens: [
      { nome: 'Dia a dia (média)', valor: base.despesaVariavelMediaMensal },
      { nome: 'Contas travadas (média)', valor: base.despesaFixaDebitoMedia ?? 0 },
    ] },
    { chave: 'cartao', titulo: 'Cartão', total: m.fatura, itens: [
      ...(somaConhecidas > 0 ? conhecidas.map((p) => ({ nome: p.chave, valor: p.valorParcela, nota: `${p.banco}${p.parcelaAtual && p.parcelaTotal ? ` · parcela ${p.parcelaAtual}/${p.parcelaTotal}` : ''}` })) : []),
      { nome: 'Compras novas (média)', valor: r2(m.fatura - somaConhecidas) },
    ] },
  ];
  return { linhas, sobra: m.saldo, saldoFim: m.saldoProjetado };
}

export function detalheMesAtual(base: ProjecaoBase, m0: ProjecaoMes) {
  const mc = base.mesCorrente;
  const soma = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);
  return {
    linhas: [
      { chave: 'entra' as const, titulo: 'Entra', jaAconteceu: r2(soma(mc.recebidoPorFonte)), aindaFalta: m0.receita },
      { chave: 'casa' as const, titulo: 'Casa e fixos', jaAconteceu: r2(soma(mc.casaNoMesPorCategoria)), aindaFalta: r2(m0.despesaManual + m0.despesaCasa) },
      { chave: 'debito' as const, titulo: 'Débito', jaAconteceu: r2(mc.variavelJaGasto + (mc.fixoJaGasto ?? 0)), aindaFalta: r2(m0.despesaVariavel + m0.despesaFixa) },
      { chave: 'cartao' as const, titulo: 'Cartão', jaAconteceu: mc.faturaJaPaga, aindaFalta: m0.fatura },
    ],
    fechaCom: m0.saldoProjetado,
  };
}

export function detalheMesPassado(p: MesPassado) {
  const L: [keyof Componentes, string][] = [['receita', 'Entra'], ['casa', 'Casa e fixos'], ['debito', 'Débito'], ['fatura', 'Cartão'], ['saldo', 'Sobra do mês']];
  return {
    linhas: L.map(([k, titulo]) => ({ chave: k, titulo, previsto: r2(p.previsto[k]), real: r2(p.real[k]), diferenca: r2(p.real[k] - p.previsto[k]) })),
    saldoFim: p.saldoFim,
  };
}
```

O tipo `MesPassado` mora em `queries.ts` (Task 2); aqui só é importado como tipo.

- [ ] **Step 3:** `npx vitest run test/lib/mesAMes.test.ts` → PASS (6 testes). **Step 4: commit** — `feat(previsao): funcoes da previsao mes a mes (F2b)`.

---

### Task 4: Simulador em tela própria

**Files:** Create `src/app/simulador/page.tsx`, `src/app/components/SimuladorPagina.tsx`; Modify `src/lib/links.ts`, `src/app/components/Nav.tsx`, `test/lib/links.test.ts`

**Interfaces:** Produces rota `/simulador`; `linkPara('simulador')`.

- [ ] **Step 1: teste (falha primeiro)** — em `test/lib/links.test.ts`: `expect(linkPara('simulador')).toBe('/simulador');` → FAIL (tipo/caminho inexistente).
- [ ] **Step 2:** `links.ts`: acrescentar `'simulador'` ao tipo `Tela` e `simulador: '/simulador'` em `CAMINHO`. `Nav.tsx`: em `EXTRA`, depois de Faturas, `{ href: '/simulador', label: 'Simulador de compra', short: 'Simular', icon: Calculator }` (importar `Calculator` de `lucide-react`).
- [ ] **Step 3:** `SimuladorPagina.tsx` (cliente):

```tsx
'use client';
import { useMemo, useState } from 'react';
import { mesLabel } from '@/lib/format';
import { compraCabe, textoVeredito } from '@/lib/decisoes';
import type { Calibracao } from '@/lib/faixa';
import type { ProjecaoMes } from '@/lib/previsao';
import { SimuladorCompra, simularCompra } from './SimuladorCompra';

export function SimuladorPagina({ projecao, saldoAtual, calib }: { projecao: ProjecaoMes[]; saldoAtual: number; calib: Calibracao | null }) {
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const sim = useMemo(() => simularCompra(valor, parcelas, saldoAtual, projecao), [valor, parcelas, saldoAtual, projecao]);
  const veredito = sim ? textoVeredito(compraCabe(projecao, calib, sim.valorParcela, sim.parcelas), (m) => mesLabel(m)) : null;
  return <SimuladorCompra valorStr={valor} setValorStr={setValor} parcelasStr={parcelas} setParcelasStr={setParcelas} resultado={sim} veredito={veredito} />;
}
```

`src/app/simulador/page.tsx`:

```tsx
import { computeProjecao, getCalibracaoPara, getProjecaoBase, Resp } from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { SimuladorPagina } from '../components/SimuladorPagina';

export const dynamic = 'force-dynamic';
const resolveResp = (v?: string): Resp => (v === 'Matheus' || v === 'Ariane' ? v : 'casal');

export default async function Simulador({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [base, { calib }] = await Promise.all([getProjecaoBase(resp), getCalibracaoPara(resp)]);
  return (
    <div>
      <PageTitle title="Simulador de compra" subtitle="Se eu comprar isso agora, algum mês vai para o vermelho? Olha os próximos 24 meses pelo pior caso." />
      <SimuladorPagina projecao={computeProjecao(base, 24)} saldoAtual={base.saldoContas.total} calib={calib} />
    </div>
  );
}
```

- [ ] **Step 4:** testes + `tsc` + `build` → ok. **Step 5: commit** — `feat(simulador): simulador de compra em tela propria (F2b)`.

---

### Task 5: A nova tela de Previsão

**Files:** Create `src/app/components/ListaMeses.tsx`, `src/app/components/DetalheMes.tsx`, `src/app/components/MetaDebito.tsx`; Modify `src/app/previsibilidade/page.tsx`, `src/app/components/PrevisibilidadeClient.tsx`; Delete `src/app/components/ProjecaoPainel.tsx`; Test `test/lib/componentesPrevisao.test.ts`

**Interfaces:** Consumes Tasks 1–4 (`getMesesPassados`, `linhasDaLista`, `detalheMes*`), `tabelaMeta`/`textoMetaAlvo` (meta.ts), `saiDoVermelho`, `getCalibracaoPara`, `linkPara`.

- [ ] **Step 1: teste dos componentes (falha primeiro)** — `test/lib/componentesPrevisao.test.ts` com `renderToStaticMarkup` (mesmo padrão de `componentesHome.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListaMeses } from '../../src/app/components/ListaMeses';
import { DetalheMes } from '../../src/app/components/DetalheMes';

describe('lista de meses', () => {
  const linhas = [
    { tipo: 'passado', mes: '2026-09', sobra: 50, previsto: -100, saldoFim: 900, piorCaso: null },
    { tipo: 'atual', mes: '2026-10', sobra: -20, previsto: null, saldoFim: -880, piorCaso: null },
    ...Array.from({ length: 14 }, (_, i) => ({ tipo: 'futuro', mes: `2027-${String(i + 1).padStart(2, '0')}`, sobra: -1, previsto: null, saldoFim: -1, piorCaso: null })),
  ] as any;
  it('cada mês é um link para o detalhe; dinheiro com "money"; mostra 12 futuros e "ver até 24"', () => {
    const h = renderToStaticMarkup(createElement(ListaMeses, { linhas, resp: 'casal', mostrarTodos: false }));
    expect(h).toContain('href="/previsibilidade?mes=2026-09"');
    expect(h).toContain('href="/previsibilidade?mes=2026-10"');
    expect((h.match(/href="\/previsibilidade\?mes=2027-/g) ?? []).length).toBe(12);
    expect(h).toContain('ver até 24 meses');
    expect(h).toContain('class="money');
  });
});

describe('detalhe do mês', () => {
  it('mês futuro: linhas com total e itens; setas e voltar', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      tipo: 'futuro', mes: '2027-01', resp: 'casal', anterior: '2026-12', seguinte: '2027-02', mesAtual: '2026-10',
      futuro: { linhas: [{ chave: 'entra', titulo: 'Entra', total: 5000, itens: [{ nome: 'Salário A', valor: 5000, nota: 'dia 5' }] }], sobra: 300, saldoFim: 800 },
    } as any));
    expect(h).toContain('Entra');
    expect(h).toContain('Salário A');
    expect(h).toContain('href="/previsibilidade?mes=2026-12"');
    expect(h).toContain('href="/previsibilidade?mes=2027-02"');
    expect(h).toContain('voltar à lista');
  });
  it('mês passado: previsto, real e diferença', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      tipo: 'passado', mes: '2026-09', resp: 'casal', anterior: null, seguinte: '2026-10', mesAtual: '2026-10',
      passado: { linhas: [{ chave: 'saldo', titulo: 'Sobra do mês', previsto: 20, real: 50, diferenca: 30 }], saldoFim: 5 },
    } as any));
    expect(h).toMatch(/Previsto[\s\S]*Real[\s\S]*Diferença/);
  });
});
```

Run → FAIL (componentes inexistentes).

- [ ] **Step 2: `ListaMeses.tsx`** (servidor):

```tsx
import Link from 'next/link';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { LinhaLista } from '@/lib/mesAMes';

/** Saldo em conta no fim de cada mês; cada linha abre o detalhe do mês. */
export function ListaMeses({ linhas, resp, mostrarTodos }: { linhas: LinhaLista[]; resp: 'casal' | 'Matheus' | 'Ariane'; mostrarTodos: boolean }) {
  const futuros = linhas.filter((l) => l.tipo === 'futuro');
  const visiveis = [...linhas.filter((l) => l.tipo !== 'futuro'), ...(mostrarTodos ? futuros : futuros.slice(0, 12))];
  const cor = (v: number) => (v >= 0 ? 'text-accent' : 'text-despesa');
  return (
    <div className="card p-0">
      <div className="px-3.5 pt-3 text-[11px] text-muted">Saldo em conta no fim de cada mês</div>
      <div className="divide-y divide-border/60">
        {visiveis.map((l) => (
          <Link key={l.mes} href={linkPara('previsao', { resp, mes: l.mes }, '')}
            className={`flex min-h-[44px] items-center justify-between px-3.5 py-2 text-sm hover:bg-surface-2/40 ${l.tipo === 'atual' ? 'bg-surface-2/60' : ''}`}>
            <span className={l.tipo === 'passado' ? 'text-muted' : ''}>
              {mesLabel(l.mes)} {l.tipo === 'passado' ? '✓' : l.tipo === 'atual' ? '•' : ''}
              <span className="ml-2 text-[11px] text-faint">
                {l.tipo === 'passado' && l.previsto !== null ? <>real <span className="money">{brl(l.sobra)}</span> · previsto <span className="money">{brl(l.previsto)}</span></> : <>sobra <span className="money">{brl(l.sobra)}</span></>}
              </span>
            </span>
            <span className={`tnum money font-medium ${cor(l.saldoFim)}`}>{brl(l.saldoFim)}</span>
          </Link>
        ))}
      </div>
      {!mostrarTodos && futuros.length > 12 && (
        <Link href={`${linkPara('previsao', { resp })}${resp === 'casal' ? '?' : '&'}todos=1`} className="block px-3.5 py-2.5 text-center text-xs text-accent">ver até 24 meses</Link>
      )}
    </div>
  );
}
```

> O terceiro argumento `''` faz o `linkPara` sempre pôr o `mes` (nenhum mês é "o padrão"): assim o mês atual também abre o detalhe, e `/previsibilidade` sem `mes` continua sendo a lista. O teste do Step 1 ganha `expect(h).toContain('href="/previsibilidade?mes=2026-10"')`. `mesAtual` sai das props da lista.

- [ ] **Step 3: `DetalheMes.tsx`** (servidor; as linhas abrem com `<details>`, sem estado):

```tsx
import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { LinhaDetalhe } from '@/lib/mesAMes';

type Props = {
  tipo: 'passado' | 'atual' | 'futuro'; mes: string; resp: 'casal' | 'Matheus' | 'Ariane';
  anterior: string | null; seguinte: string | null; mesAtual: string;
  futuro?: { linhas: LinhaDetalhe[]; sobra: number; saldoFim: number };
  atual?: { linhas: { chave: string; titulo: string; jaAconteceu: number; aindaFalta: number }[]; fechaCom: number };
  passado?: { linhas: { chave: string; titulo: string; previsto: number; real: number; diferenca: number }[]; saldoFim: number };
};

export function DetalheMes(p: Props) {
  const link = (m: string) => linkPara('previsao', { resp: p.resp, mes: m }, '');
  const cor = (v: number) => (v >= 0 ? 'text-accent' : 'text-despesa');
  const rotulo = { passado: 'fechado', atual: 'em andamento', futuro: 'previsão' }[p.tipo];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {p.anterior ? <Link href={link(p.anterior)} aria-label="Mês anterior" className="grid h-10 w-10 place-items-center rounded-lg border border-border"><ChevronLeft size={18} /></Link> : <span className="w-10" />}
        <div className="text-center"><div className="font-semibold capitalize">{mesLabel(p.mes)}</div><div className="text-[11px] text-muted">{rotulo}</div></div>
        {p.seguinte ? <Link href={link(p.seguinte)} aria-label="Próximo mês" className="grid h-10 w-10 place-items-center rounded-lg border border-border"><ChevronRight size={18} /></Link> : <span className="w-10" />}
      </div>

      {p.futuro && (
        <div className="card p-0 divide-y divide-border/60">
          {p.futuro.linhas.map((l) => (
            <details key={l.chave} className="px-3.5 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
                <span>{l.titulo}</span><span className="tnum money">{l.chave === 'entra' ? '+' : '−'}{brl(l.total)}</span>
              </summary>
              <div className="mt-2 space-y-1">
                {l.itens.length === 0 && <div className="text-xs text-faint">{l.chave === 'entra' ? 'nenhuma receita prevista' : 'nada previsto'}</div>}
                {l.itens.map((i, k) => (
                  <div key={k} className="flex justify-between text-xs text-muted">
                    <span>{i.nome}{i.nota ? <span className="text-faint"> · {i.nota}</span> : null}</span><span className="tnum money">{brl(i.valor)}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
          <div className="flex justify-between px-3.5 py-2.5 text-sm font-semibold"><span>Sobra do mês</span><span className={`tnum money ${cor(p.futuro.sobra)}`}>{brl(p.futuro.sobra)}</span></div>
          <div className="flex justify-between px-3.5 py-2.5 text-sm"><span>Saldo no fim</span><span className={`tnum money ${cor(p.futuro.saldoFim)}`}>{brl(p.futuro.saldoFim)}</span></div>
        </div>
      )}

      {p.atual && (
        <div className="card">
          <div className="grid grid-cols-3 gap-y-2 text-sm">
            <span className="text-[11px] text-muted" /><span className="text-right text-[11px] text-muted">Já aconteceu</span><span className="text-right text-[11px] text-muted">Ainda falta</span>
            {p.atual.linhas.map((l) => (
              <Fragment key={l.chave}><span>{l.titulo}</span><span className="text-right tnum money">{brl(l.jaAconteceu)}</span><span className="text-right tnum money">{brl(l.aindaFalta)}</span></Fragment>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold"><span>Fecha com</span><span className={`tnum money ${cor(p.atual.fechaCom)}`}>{brl(p.atual.fechaCom)}</span></div>
        </div>
      )}

      {p.passado && (
        <div className="card">
          <div className="grid grid-cols-4 gap-y-2 text-sm">
            <span /><span className="text-right text-[11px] text-muted">Previsto</span><span className="text-right text-[11px] text-muted">Real</span><span className="text-right text-[11px] text-muted">Diferença</span>
            {p.passado.linhas.map((l) => (
              <Fragment key={l.chave}><span>{l.titulo}</span><span className="text-right tnum money text-muted">{brl(l.previsto)}</span><span className="text-right tnum money">{brl(l.real)}</span><span className="text-right tnum money text-faint">{brl(l.diferenca)}</span></Fragment>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm"><span>Saldo no fim</span><span className={`tnum money ${cor(p.passado.saldoFim)}`}>{brl(p.passado.saldoFim)}</span></div>
          <div className="mt-2 flex gap-3 text-xs">
            <Link className="text-accent" href={linkPara('gastos', { resp: p.resp, mes: p.mes }, '')}>ver gastos do mês</Link>
            <Link className="text-accent" href={linkPara('faturas', { resp: p.resp }, '')}>ver faturas</Link>
          </div>
        </div>
      )}

      <Link href={linkPara('previsao', { resp: p.resp })} className="mt-3 block text-center text-xs text-accent">voltar à lista</Link>
    </div>
  );
}
```

- [ ] **Step 4: `MetaDebito.tsx`** — mover o bloco "Meta de gasto no débito" que hoje está dentro do `PrevisibilidadeClient` (props `meta`) para um componente de servidor com a mesma marcação; o `PrevisibilidadeClient` perde a prop `meta`.

- [ ] **Step 5: `previsibilidade/page.tsx`** — montar:

```tsx
const resp = resolveResp(searchParams.resp);
const hoje = currentDateSP(); const atual = hoje.slice(0, 7);
const [base, parcelados, { calib, motivo }, passados] = await Promise.all([
  getProjecaoBase(resp), getCompromissosParcelados(resp), getCalibracaoPara(resp), getMesesPassados(resp, hoje),
]);
const projecao = computeProjecao(base, HORIZONTE_MAX);
const ritmo = computeRitmo(base, projecao[0]);
const linhas = linhasDaLista(projecao, passados, calib, ritmo.diasRestantes, diasNoMes(atual));
const meses = linhas.map((l) => l.mes);
const pedido = mesValido(searchParams.mes);
const i = pedido ? meses.indexOf(pedido) : -1;   // fora do intervalo → lista
const sai = saiDoVermelho(projecao, calib);
// + meta (como hoje), topo com sai/meta, e:
//   i < 0  → <ListaMeses …/> ; senão <DetalheMes tipo={linhas[i].tipo} … anterior={meses[i-1] ?? null} seguinte={meses[i+1] ?? null}
//            futuro={detalheMesFuturo(base, projecao[k], parcelados)} | atual={detalheMesAtual(base, projecao[0])} | passado={detalheMesPassado(passados[j])} />
//   depois: <MetaDebito …/> e <PrevisibilidadeClient … /> (compromissos e cadastro)
```

(`k` = índice do mês em `projecao`; `j` = índice em `passados`; `mostrarTodos = searchParams.todos === '1'`.) Topo: o mesmo texto de "sai do vermelho" e do motivo sem faixa que hoje está no `PrevisibilidadeClient`, agora como servidor.

- [ ] **Step 6: `PrevisibilidadeClient`** — remover: KPIs do topo, card "Fechamento do mês" (vira o detalhe do mês atual), simulador (`SimuladorCompra`, estados `valorSim`/`parcelasSim`, `simulacao`, `veredito`, `sai`), horizonte e `ProjecaoPainel`. Fica: "Compromissos ativos" (lista) + formulário de cadastro/edição/exclusão. Remover as props que ficarem sem uso. Apagar `ProjecaoPainel.tsx` (confirmar com `grep -rn ProjecaoPainel src` que nada mais importa).

- [ ] **Step 7: verificar** — `npx tsc --noEmit -p . && npx vitest run && npm run build` → ok; testes do Step 1 → PASS. Coerência: em `test/integracao/previsao.test.ts`, um teste que monta `linhasDaLista` com `computeProjecao(base)` real e confere que a linha `atual` tem `saldoFim === computeRitmo(base, proj[0]).fechaCom`.

- [ ] **Step 8: prévia local** (cópia dos dados só na máquina): celular e computador — lista; abrir passado (previsto × real), atual (já × falta) e futuro (linhas abrindo itens); setas; voltar; `?mes=2020-01` cai na lista; "ver até 24 meses"; `/simulador` com veredito; compromissos e cadastro funcionando.

- [ ] **Step 9: commit** — `feat(previsao): tela mes a mes com lista, detalhe e meta (F2b)`.

---

### Task 6: Verificação final e deploy

- [ ] suíte completa com integração, `tsc`, `build`; varredura de valores/pessoal no diff e nas mensagens; deploy (cópia `/root/finance-dash.bak-pre-f2b`); rotas em 200 (incl. `/simulador`, `/previsibilidade?mes=` de um passado, do atual e de um futuro); "fecha com" da lista = home = `/api/previsao`; tempo da 1ª chamada de `/previsibilidade` medido; push e PR com base `feat/meta-debito`.
