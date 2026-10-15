# Onda 5 — Uma pergunta por tela · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gastos, Faturas, Contas e Previsão abrem respondendo a sua pergunta (card-resposta no estilo da home), com cabeçalho de uma linha e elos entre as telas.

**Architecture:** Toda conta nova é função pura em `src/lib` (testada); as páginas (server components) só juntam dados que já existem e passam para componentes de apresentação testáveis com `renderToStaticMarkup`. Nenhum cálculo de previsão muda.

**Tech Stack:** Next.js 14 (app router, server components), TypeScript, Tailwind, Vitest 3, SVG à mão (sem biblioteca de gráfico nova).

**Spec:** `docs/superpowers/specs/2026-10-14-onda5-uma-pergunta-por-tela-design.md`

## Global Constraints

- Os números são os de hoje; muda a forma. Nenhum cálculo novo de previsão.
- Nenhuma biblioteca nova. A rosca (`CategoriaDonut`) sai de Gastos.
- Barra de baixo continua Início · Contas · Gastos · Previsão · Mais.
- Gastos mostra **grupos**; categoria só dentro do grupo.
- Todo valor de dinheiro na tela leva a classe `money` (o olho borra).
- Valores em testes são inventados (repo público); nunca valores reais.
- Celular 375 px: cabeçalho em uma linha no mês atual.
- Testes de integração: `docker exec pg-teste-c1 psql -U postgres -q -c "DROP DATABASE IF EXISTS personal_hub_db" -c "CREATE DATABASE personal_hub_db"` e `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run`.

## Review Focus

1. Mês fechado/futuro: Gastos sem "cabe" num mês fechado; Contas de mês futuro com tudo em "Falta"; Faturas ignora o mês — testes em Tasks 1, 3, 6.
2. Visão individual: Previsão sem linha da meta; Contas sem "fecha em" — testes em Tasks 4, 8.
3. Sem dado: pessoa sem cartão ("Nenhum cartão"), grupo sem média (sem seta), sem conexões (sem bolinha) — testes em Tasks 1, 2, 5.
4. Filtros dos links das mensagens (`grupo`, `tipo=livre`, `forma=debito`, `p=sem-…`, `cartao`, `ciclo`) continuam valendo — Task 6 (Gastos) e Task 7 (Faturas) mantêm a leitura de `searchParams` atual.
5. Olho de privacidade: card-resposta, linha do tempo, gráfico e elos com `money` — testes de render em Tasks 5–9.

---

### Task 1: Funções puras de Gastos e a seta compartilhada

**Files:**
- Create: `src/lib/seta.ts`, `src/lib/gastosTela.ts`
- Modify: `src/worker/notificacoes/textosD.ts` (importa `seta` de `../../lib/seta`, apaga a local)
- Test: `test/lib/gastosTela.test.ts`

**Interfaces:**
- Produces: `seta(atual: number, media: number): string`; `type LancGasto = { id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string; forma?: string; dinheiroId?: number }`; `diaADia(ls: LancGasto[]): number`; `noCredito(ls: LancGasto[]): number`; `ateODia(ls: LancGasto[], dia: number): LancGasto[]`; `interface GrupoTela { nome: string; emoji: string; total: number; cats: string[]; seta: string | null; categorias: CatGroup[] }`; `gruposDoPeriodo(ls: LancGasto[], mediaPorGrupo: Map<string, number> | null): GrupoTela[]`; `mediaPorGrupo(meses: LancGasto[][]): Map<string, number>`; `cabeNoMes(gasto: number, sobra: number): number`.

- [ ] **Step 1: teste (falha)**

```ts
// test/lib/gastosTela.test.ts
import { describe, expect, it } from 'vitest';
import { seta } from '../../src/lib/seta';
import { ateODia, cabeNoMes, diaADia, gruposDoPeriodo, mediaPorGrupo, noCredito, type LancGasto } from '../../src/lib/gastosTela';

const l = (categoria: string, valor: number, extra: Partial<LancGasto> = {}): LancGasto =>
  ({ id: `${categoria}-${valor}`, data: '2026-10-05', valor, descricao: 'x', categoria, banco: 'B', responsavel: 'Matheus', forma: 'Débito', ...extra });

describe('Gastos (Onda 5)', () => {
  it('seta: mesma régua do semanal', () => {
    expect([seta(200, 100), seta(120, 100), seta(100, 100), seta(80, 100), seta(40, 100)]).toEqual(['⏫', '⬆️', '➖', '⬇️', '⏬']);
  });
  it('dia a dia = débito/PIX fora de Casa e Dívida, sem dinheiro vivo', () => {
    const ls = [l('Groceries', 100), l('Housing', 900), l('Loans', 300), l('Groceries', 50, { forma: 'Crédito' }), l('Eating out', 30, { dinheiroId: 1 })];
    expect(diaADia(ls)).toBe(100);
  });
  it('no crédito: soma só forma Crédito', () => {
    expect(noCredito([l('Groceries', 100), l('Shopping', 70, { forma: 'Crédito' }), l('Travel', 30.5, { forma: 'Crédito' })])).toBe(100.5);
  });
  it('até o dia: corta pelo dia do mês', () => {
    expect(ateODia([l('Groceries', 1, { data: '2026-09-05' }), l('Groceries', 2, { data: '2026-09-20' })], 14).map((x) => x.valor)).toEqual([1]);
  });
  it('grupos ordenados por total, categorias dentro, seta vs média; sem média = sem seta', () => {
    const ls = [l('Groceries', 300), l('Eating out', 80), l('Food delivery', 40), l('Housing', 900)];
    const gs = gruposDoPeriodo(ls, new Map([['Mercado', 100], ['Casa', 900]]));
    expect(gs.map((g) => [g.nome, g.total, g.seta])).toEqual([['Casa', 900, '➖'], ['Mercado', 300, '⏫'], ['Comer fora', 120, null]]);
    expect(gs[2].categorias.map((c) => c.categoria)).toEqual(['Eating out', 'Food delivery']);
    expect(gs[2].cats).toEqual(['Eating out', 'Food delivery']);
    expect(gruposDoPeriodo(ls, null).every((g) => g.seta === null)).toBe(true);
  });
  it('categoria sem grupo vai para "Resto"', () => {
    expect(gruposDoPeriodo([l('Coisa nova', 10)], null)[0]).toMatchObject({ nome: 'Resto', emoji: '❓' });
  });
  it('média por grupo: soma dos meses ÷ número de meses', () => {
    expect(mediaPorGrupo([[l('Groceries', 300)], [l('Groceries', 100)], []]).get('Mercado')).toBeCloseTo(133.33, 2);
  });
  it('cabe no mês = gasto + sobra, nunca abaixo do gasto', () => {
    expect(cabeNoMes(2000, 500)).toBe(2500);
    expect(cabeNoMes(2000, -300)).toBe(2000);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/lib/gastosTela.test.ts` → FAIL (módulos não existem).

- [ ] **Step 3: implementação**

```ts
// src/lib/seta.ts
/** Seta de comparação com a média (semanal do WhatsApp e grupos da tela Gastos): ⏫ ≥ 2x, ⏬ ≤ metade. */
export function seta(atual: number, media: number): string {
  if (media > 0 && atual >= 2 * media) return '⏫';
  if (media > 0 && atual <= media / 2) return '⏬';
  if (atual > media) return '⬆️';
  if (atual < media) return '⬇️';
  return '➖';
}
```

```ts
// src/lib/gastosTela.ts
// Onda 5 (Gastos): contas da tela — dia a dia, crédito, grupos com categorias e seta vs média.
import type { CatGroup } from '../app/components/CategoryAccordion';
import { categoriaNoFiltro, grupoDaCategoria } from './grupos';
import { seta } from './seta';

export type LancGasto = { id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string; forma?: string; dinheiroId?: number };
export interface GrupoTela { nome: string; emoji: string; total: number; cats: string[]; seta: string | null; categorias: CatGroup[] }

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (ls: LancGasto[]) => r2(ls.reduce((s, x) => s + x.valor, 0));

/** O mesmo recorte do "Ritmo do dia" da home: débito e PIX, fora Casa e Dívida, sem dinheiro vivo. */
export const diaADia = (ls: LancGasto[]) => soma(ls.filter((x) => !x.dinheiroId && x.forma === 'Débito' && categoriaNoFiltro(x.categoria, { tipo: 'livre' })));
export const noCredito = (ls: LancGasto[]) => soma(ls.filter((x) => x.forma === 'Crédito'));
export const ateODia = (ls: LancGasto[], dia: number) => ls.filter((x) => Number(x.data.slice(8, 10)) <= dia);
export const cabeNoMes = (gasto: number, sobra: number) => r2(gasto + Math.max(0, sobra));

function grupoDe(cat: string) {
  const g = grupoDaCategoria(cat);
  return g ? { nome: g.nome, emoji: g.emoji } : { nome: 'Resto', emoji: '❓' };
}

export function mediaPorGrupo(meses: LancGasto[][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mes of meses) for (const x of mes) { const g = grupoDe(x.categoria).nome; m.set(g, (m.get(g) ?? 0) + x.valor); }
  for (const [k, v] of m) m.set(k, r2(v / Math.max(1, meses.length)));
  return m;
}

export function gruposDoPeriodo(ls: LancGasto[], medias: Map<string, number> | null): GrupoTela[] {
  const grupos = new Map<string, { emoji: string; cats: Map<string, CatGroup> }>();
  for (const x of ls) {
    const g = grupoDe(x.categoria);
    const gr = grupos.get(g.nome) ?? { emoji: g.emoji, cats: new Map() };
    const c = gr.cats.get(x.categoria) ?? { categoria: x.categoria, total: 0, n: 0, items: [] };
    c.total = r2(c.total + x.valor); c.n += 1;
    c.items.push({ id: x.id, data: x.data, valor: x.valor, descricao: x.descricao, banco: x.banco, responsavel: x.responsavel, dinheiroId: x.dinheiroId });
    gr.cats.set(x.categoria, c); grupos.set(g.nome, gr);
  }
  return [...grupos].map(([nome, gr]) => {
    const categorias = [...gr.cats.values()].sort((a, b) => b.total - a.total);
    const total = r2(categorias.reduce((s, c) => s + c.total, 0));
    const media = medias?.get(nome);
    return { nome, emoji: gr.emoji, total, cats: categorias.slice(0, 3).map((c) => c.categoria), seta: media === undefined ? null : seta(total, media), categorias };
  }).sort((a, b) => b.total - a.total);
}
```

Em `textosD.ts`: trocar a `function seta(...)` local por `import { seta } from '../../lib/seta';`.

- [ ] **Step 4:** `npx vitest run test/lib/gastosTela.test.ts test/worker/notificacoes-textosD.test.ts` → PASS.
- [ ] **Step 5: commit** `feat(gastos): funcoes da tela - dia a dia, credito, grupos com seta (onda 5)`

### Task 2: Faturas — próximos vencimentos

**Files:** Modify `src/lib/faturas.ts`; Test `test/lib/faturas.test.ts`

**Interfaces:**
- Consumes: `cicloAtual`, `diaDoMes`, `UltimaFatura`.
- Produces: `interface Vencimento { banco: string; responsavel: string; vence: string | null; fecha: string | null; valor: number; situacao: 'fechada' | 'atrasada' | 'parcial'; ciclo: string }`; `proximosVencimentos(cs: { banco: string; responsavel: string; fechamento: string | null; ultima: UltimaFatura | null; somaCiclo: number }[], hoje: string): Vencimento[]`.

- [ ] **Step 1: teste (falha)** — acrescentar a `test/lib/faturas.test.ts` (e `proximosVencimentos` ao import):

```ts
describe('próximos vencimentos (Onda 5)', () => {
  const u = (vencimento: string, total: number, pago: number, situacao: any, falta: number) => ({ vencimento, total, pago, parcelado: 0, situacao, falta });
  it('fechada a vencer + ciclo em curso, ordenados pela data; vencimento do ciclo = mesmo dia, mês seguinte ao fechamento', () => {
    const v = proximosVencimentos([
      { banco: 'Nubank', responsavel: 'Matheus', fechamento: '2026-09-30', ultima: u('2026-10-17', 500, 0, 'a_vencer', 500), somaCiclo: 120 },
      { banco: 'Neon', responsavel: 'Ariane', fechamento: '2026-09-29', ultima: u('2026-10-05', 80, 80, 'paga', 0), somaCiclo: 60 },
    ], '2026-10-14');
    expect(v.map((x) => [x.banco, x.situacao, x.vence, x.valor, x.ciclo])).toEqual([
      ['Nubank', 'fechada', '2026-10-17', 500, 'fechada'],
      ['Neon', 'parcial', '2026-11-05', 60, '2026-10'],
      ['Nubank', 'parcial', '2026-11-17', 120, '2026-10'],
    ]);
    expect(v[1].fecha).toBe('2026-10-29');
  });
  it('atrasada vem primeiro; sem fatura no histórico: vencimento desconhecido (fica no fim)', () => {
    const v = proximosVencimentos([
      { banco: 'Inter', responsavel: 'Matheus', fechamento: '2026-09-10', ultima: null, somaCiclo: 40 },
      { banco: 'Santander', responsavel: 'Matheus', fechamento: '2026-09-28', ultima: u('2026-10-04', 90, 0, 'atrasada', 90), somaCiclo: 0 },
    ], '2026-10-14');
    expect(v.map((x) => [x.banco, x.situacao, x.vence])).toEqual([['Santander', 'atrasada', '2026-10-04'], ['Inter', 'parcial', null]]);
  });
  it('ciclo em curso sem compra não aparece; nenhum cartão = lista vazia', () => {
    expect(proximosVencimentos([{ banco: 'Neon', responsavel: 'Ariane', fechamento: '2026-09-29', ultima: null, somaCiclo: 0 }], '2026-10-14')).toEqual([]);
    expect(proximosVencimentos([], '2026-10-14')).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx vitest run test/lib/faturas.test.ts` → FAIL.
- [ ] **Step 3: implementação** (em `src/lib/faturas.ts`)

```ts
export interface Vencimento {
  banco: string; responsavel: string; vence: string | null; fecha: string | null; valor: number;
  situacao: 'fechada' | 'atrasada' | 'parcial'; ciclo: string;
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Onda 5: linha do tempo de Faturas — fechadas não pagas e o ciclo em curso de cada cartão, pela data de vencimento. */
export function proximosVencimentos(
  cs: readonly { banco: string; responsavel: string; fechamento: string | null; ultima: UltimaFatura | null; somaCiclo: number }[], hoje: string,
): Vencimento[] {
  const [y, m, d] = hoje.split('-').map(Number);
  const out: Vencimento[] = [];
  for (const c of cs) {
    const u = c.ultima;
    if (u && (u.situacao === 'a_vencer' || u.situacao === 'atrasada')) {
      out.push({ banco: c.banco, responsavel: c.responsavel, vence: u.vencimento, fecha: null, valor: u.falta,
        situacao: u.situacao === 'atrasada' ? 'atrasada' : 'fechada', ciclo: 'fechada' });
    }
    if (c.somaCiclo <= 0) continue;
    const { end } = cicloAtual(c.fechamento, Date.UTC(y, m - 1, d));
    const fim = new Date(end);
    // vence no dia de sempre (o da última fatura), no primeiro mês em que esse dia cai depois do fechamento
    let vence: string | null = null;
    if (u) {
      const dia = Number(u.vencimento.slice(8, 10));
      let t = diaDoMes(fim.getUTCFullYear(), fim.getUTCMonth(), dia);
      if (t <= end) t = diaDoMes(fim.getUTCFullYear(), fim.getUTCMonth() + 1, dia);
      vence = iso(t);
    }
    out.push({ banco: c.banco, responsavel: c.responsavel, vence, fecha: iso(end), valor: Math.round(c.somaCiclo * 100) / 100,
      situacao: 'parcial', ciclo: iso(end).slice(0, 7) });
  }
  const ordem = (v: Vencimento) => (v.situacao === 'atrasada' ? '0' : '1') + (v.vence ?? '9999');
  return out.sort((a, b) => (ordem(a) < ordem(b) ? -1 : ordem(a) > ordem(b) ? 1 : 0));
}
```

- [ ] **Step 4:** testes → PASS. **Step 5: commit** `feat(faturas): linha do tempo dos proximos vencimentos (onda 5)`

### Task 3: Contas — separar falta/pagas e reconhecer fatura na lista

**Files:** Modify `src/lib/contas.ts`, `src/lib/resumos.ts` (o `noCaderno` de `faturasDoDia` passa a usar `contaEhFatura`); Test `test/lib/contas.test.ts`

**Interfaces:**
- Produces: `separarContas(itens: ItemConta[]): { falta: ItemConta[]; pagas: ItemConta[] }` (falta = status ≠ 'pago', por `vence` crescente, sem `vence` no fim; pagas por `dia`); `contaEhFatura(item: { nome: string; responsavel: string }, cartoes: readonly { banco: string; responsavel: string }[]): { banco: string; responsavel: string } | null` (mesma pessoa e nome sem acento contém o banco sem acento).

- [ ] **Step 1: teste (falha)**

```ts
describe('Contas (Onda 5)', () => {
  const it_ = (nome: string, status: any, vence: number | null = null, dia: number | null = null) =>
    ({ contaId: 1, marcaId: null, nome, responsavel: 'Ariane', previsto: 10, pago: status === 'pago' ? 10 : null, status, dia, vence, parcela: null, avulsa: false, origem: null });
  it('falta (por vencimento, sem vencimento no fim) e pagas (por dia)', () => {
    const r = separarContas([it_('A', 'pago', 5, 9), it_('B', 'falta', 20), it_('C', 'a_confirmar', 3), it_('D', 'falta', null), it_('E', 'pago', 2, 2)]);
    expect(r.falta.map((i) => i.nome)).toEqual(['C', 'B', 'D']);
    expect(r.pagas.map((i) => i.nome)).toEqual(['E', 'A']);
  });
  it('mês futuro: tudo em falta', () => {
    expect(separarContas([it_('A', 'falta', 5), it_('B', 'falta', 9)]).pagas).toEqual([]);
  });
  it('conta que é fatura: mesma pessoa e nome contém o banco (sem acento)', () => {
    const cartoes = [{ banco: 'Neon', responsavel: 'Ariane' }, { banco: 'Itaú', responsavel: 'Matheus' }];
    expect(contaEhFatura({ nome: 'Crédito Neon', responsavel: 'Ariane' }, cartoes)).toEqual({ banco: 'Neon', responsavel: 'Ariane' });
    expect(contaEhFatura({ nome: 'Fatura itau', responsavel: 'Matheus' }, cartoes)).toEqual({ banco: 'Itaú', responsavel: 'Matheus' });
    expect(contaEhFatura({ nome: 'Crédito Neon', responsavel: 'Matheus' }, cartoes)).toBeNull();
    expect(contaEhFatura({ nome: 'Sabesp', responsavel: 'Ariane' }, cartoes)).toBeNull();
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:**

```ts
// src/lib/contas.ts
const semAcentoC = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Onda 5: o topo de Contas é o que falta; a lista começa por ele (por vencimento) e as pagas ficam recolhidas. */
export function separarContas(itens: ItemConta[]): { falta: ItemConta[]; pagas: ItemConta[] } {
  const v = (i: ItemConta) => i.vence ?? 99;
  return {
    falta: itens.filter((i) => i.status !== 'pago').sort((a, b) => v(a) - v(b)),
    pagas: itens.filter((i) => i.status === 'pago').sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99)),
  };
}

/** Conta do caderno que é a fatura de um cartão (ex.: "Crédito Neon" da Ariane): mesma pessoa, nome contém o banco. */
export function contaEhFatura(item: { nome: string; responsavel: string }, cartoes: readonly { banco: string; responsavel: string }[]) {
  const c = cartoes.find((f) => f.responsavel === item.responsavel && semAcentoC(item.nome).includes(semAcentoC(f.banco)));
  return c ? { banco: c.banco, responsavel: c.responsavel } : null;
}
```

Em `resumos.ts`, `noCaderno` vira `caderno.some((c) => contaEhFatura(c, [f]) !== null)`.

- [ ] **Step 4:** `npx vitest run test/lib/contas.test.ts test/lib/resumos.test.ts` → PASS. **Step 5: commit** `feat(contas): falta/pagas e fatura reconhecida na lista (onda 5)`

### Task 4: Previsão — projeção com a meta e série do gráfico

**Files:** Modify `src/lib/meta.ts`; Create `src/lib/saida.ts`; Test `test/lib/saida.test.ts`

**Interfaces:**
- Produces: `projecaoComDebito(base: ProjecaoBase, debitoMensal: number, hoje: string): ProjecaoMes[]` (24 meses; `saiCom` passa a usá-la); `interface PontoSaida { mes: string; mesLabel: string; saldo: number; meta: number | null; passado: boolean; hoje: boolean }`; `serieSaida(passados: { mes: string; saldoFim: number }[], projecao: ProjecaoMes[], comMeta: ProjecaoMes[] | null): PontoSaida[]`.

- [ ] **Step 1: teste (falha)**

```ts
// test/lib/saida.test.ts
import { describe, expect, it } from 'vitest';
import { serieSaida } from '../../src/lib/saida';

const pm = (mes: string, saldoProjetado: number) => ({ mes, mesLabel: mes, saldoProjetado } as any);
describe('série do gráfico da Previsão (Onda 5)', () => {
  it('passados (real) + atual (hoje) + futuros; a meta acompanha a projeção a partir de hoje', () => {
    const s = serieSaida([{ mes: '2026-08', saldoFim: -900 }, { mes: '2026-09', saldoFim: -500 }],
      [pm('2026-10', -250), pm('2026-11', -4000)], [pm('2026-10', -250), pm('2026-11', -3000)]);
    expect(s.map((p) => [p.mes, p.saldo, p.meta, p.passado, p.hoje])).toEqual([
      ['2026-08', -900, null, true, false], ['2026-09', -500, null, true, false],
      ['2026-10', -250, -250, false, true], ['2026-11', -4000, -3000, false, false]]);
  });
  it('sem meta (visão individual ou já sai no ritmo de hoje): meta null em tudo', () => {
    expect(serieSaida([], [pm('2026-10', 10)], null).every((p) => p.meta === null)).toBe(true);
  });
});
```

E em `test/lib/meta.test.ts`: `projecaoComDebito(base, 0, hoje).at(-1)!.saldoProjetado > computeProjecao(base, 24, hoje).at(-1)!.saldoProjetado` com a `base` fake do próprio arquivo.

- [ ] **Step 2:** FAIL. **Step 3:**

```ts
// src/lib/meta.ts (saiCom passa a usar)
export function projecaoComDebito(base: ProjecaoBase, debitoMensal: number, hoje: string) {
  const fixo = base.despesaFixaDebitoMedia ?? 0;
  return computeProjecao({ ...base, despesaVariavelMediaMensal: Math.max(0, debitoMensal - fixo) }, HORIZONTE, hoje);
}
function saiCom(base: ProjecaoBase, debitoMensal: number, hoje: string): string | null {
  return saiDoVermelho(projecaoComDebito(base, debitoMensal, hoje), null).provavel;
}
```

```ts
// src/lib/saida.ts
// Onda 5 (Previsão): pontos do gráfico "saldo no fim de cada mês" — passados reais, atual e projeção, e a linha da meta.
import { mesLabel } from './format';
import type { ProjecaoMes } from './previsao';

export interface PontoSaida { mes: string; mesLabel: string; saldo: number; meta: number | null; passado: boolean; hoje: boolean }

export function serieSaida(passados: { mes: string; saldoFim: number }[], projecao: ProjecaoMes[], comMeta: ProjecaoMes[] | null): PontoSaida[] {
  return [
    ...passados.map((p) => ({ mes: p.mes, mesLabel: mesLabel(p.mes), saldo: p.saldoFim, meta: null, passado: true, hoje: false })),
    ...projecao.map((p, i) => ({ mes: p.mes, mesLabel: p.mesLabel, saldo: p.saldoProjetado, meta: comMeta?.[i]?.saldoProjetado ?? null, passado: false, hoje: i === 0 })),
  ];
}
```

- [ ] **Step 4:** PASS. **Step 5: commit** `feat(previsao): serie do grafico e projecao com a meta (onda 5)`

### Task 5: Peças visuais e cabeçalho de uma linha

**Files:**
- Create: `src/app/components/CardResposta.tsx`, `src/app/components/Elo.tsx`, `src/app/components/SyncDot.tsx`
- Modify: `src/lib/links.ts` (`temSeletorDeMes`: `/faturas` também sem mês), `src/app/components/PeriodPicker.tsx` (sai o bloco 7/15/30 — vai para a Gastos; mês curto `out/26` no celular via `mesLabel` em `sm:hidden` e `mesLongo` em `hidden sm:inline`), `src/app/components/Nav.tsx` (`RespToggle`: bolinhas `hidden sm:inline-block`, `px-2`), `src/app/layout.tsx` (header `flex-nowrap gap-1.5 px-3`; `SyncDot` no celular, `SyncBadge` `hidden md:block`)
- Test: `test/lib/componentesOnda5.test.ts`, `test/lib/links.test.ts`

**Interfaces:**
- Produces: `CardResposta({ pergunta: string; valor: string; dinheiro?: boolean; tom?: 'bom' | 'atencao' | 'ruim' | 'neutro'; complemento?: React.ReactNode; apoio?: React.ReactNode; children?: React.ReactNode })`; `Elo({ href: string; children: React.ReactNode; acao: string })`; `corDaSincronizacao(h: number): 'bom' | 'atencao' | 'ruim'` (em `src/lib/format.ts`); `SyncDot({ status: { oldestH: number; conns: unknown[] } })`.

- [ ] **Step 1: teste (falha)**

```ts
// test/lib/componentesOnda5.test.ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardResposta } from '../../src/app/components/CardResposta';
import { Elo } from '../../src/app/components/Elo';
import { SyncDot } from '../../src/app/components/SyncDot';
import { corDaSincronizacao } from '../../src/lib/format';

describe('peças da Onda 5', () => {
  it('card-resposta: pergunta, valor com money, tom', () => {
    const h = renderToStaticMarkup(createElement(CardResposta, { pergunta: 'Falta pagar', valor: 'R$ 10,00', tom: 'atencao' }));
    expect(h).toContain('Falta pagar');
    expect(h).toMatch(/money[^"]*text-warn|text-warn[^"]*money/);
  });
  it('valor que não é dinheiro não leva money', () => {
    expect(renderToStaticMarkup(createElement(CardResposta, { pergunta: 'p', valor: 'Não sai em 24 meses', dinheiro: false }))).not.toContain('money');
  });
  it('elo é link com a ação', () => {
    const h = renderToStaticMarkup(createElement(Elo, { href: '/faturas', acao: 'ver faturas' }, 'no crédito'));
    expect(h).toContain('href="/faturas"');
    expect(h).toContain('ver faturas');
  });
  it('bolinha: cor pela pior conexão, link pro diagnóstico; sem conexões, nada', () => {
    expect([corDaSincronizacao(3), corDaSincronizacao(30), corDaSincronizacao(80)]).toEqual(['bom', 'atencao', 'ruim']);
    const h = renderToStaticMarkup(createElement(SyncDot, { status: { oldestH: 80, conns: [{}] } }));
    expect(h).toContain('href="/diagnostico"');
    expect(h).toContain('bg-despesa');
    expect(h).toContain('há 3 dias');
    expect(renderToStaticMarkup(createElement(SyncDot, { status: { oldestH: 0, conns: [] } }))).toBe('');
  });
});
```

Em `links.test.ts`: `expect(temSeletorDeMes('/faturas')).toBe(false)`.

- [ ] **Step 2:** FAIL. **Step 3:**

```tsx
// src/app/components/CardResposta.tsx
/** Onda 5: o topo de cada tela — a pergunta pequena, o número grande colorido, uma linha de apoio. */
export function CardResposta({ pergunta, valor, dinheiro = true, tom = 'neutro', complemento, apoio, children }: {
  pergunta: string; valor: string; dinheiro?: boolean; tom?: 'bom' | 'atencao' | 'ruim' | 'neutro';
  complemento?: React.ReactNode; apoio?: React.ReactNode; children?: React.ReactNode;
}) {
  const cor = { neutro: 'text-text', bom: 'text-accent', atencao: 'text-warn', ruim: 'text-despesa' }[tom];
  return (
    <div className="card mb-3 p-3.5">
      <div className="text-xs text-muted">{pergunta}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-2xl font-semibold tnum ${dinheiro ? 'money ' : ''}${cor}`}>{valor}</span>
        {complemento && <span className="text-sm text-muted">{complemento}</span>}
      </div>
      {children}
      {apoio && <div className="mt-1.5 text-xs leading-relaxed text-muted">{apoio}</div>}
    </div>
  );
}
```

```tsx
// src/app/components/Elo.tsx
import Link from 'next/link';
/** Onda 5: a faixa que leva para a tela relacionada (crédito → faturas, contas → previsão…). */
export function Elo({ href, acao, children }: { href: string; acao: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface px-3.5 py-2.5 text-xs text-muted hover:text-text">
      <span>{children}</span><span className="shrink-0 text-accent">{acao} ›</span>
    </Link>
  );
}
```

```tsx
// src/app/components/SyncDot.tsx
import Link from 'next/link';
import { corDaSincronizacao, textoHoras } from '@/lib/format';
/** Onda 5: no celular, a sincronização é uma bolinha (verde/âmbar/vermelha); toque abre o Diagnóstico. */
export function SyncDot({ status }: { status: { oldestH: number; conns: unknown[] } }) {
  if (!status.conns.length) return null;
  const cor = { bom: 'bg-accent', atencao: 'bg-warn', ruim: 'bg-despesa' }[corDaSincronizacao(status.oldestH)];
  return (
    <Link href="/diagnostico" aria-label={`Sincronização: ${textoHoras(status.oldestH)}. Abrir diagnóstico.`} title={textoHoras(status.oldestH)}
      className="grid h-8 w-6 shrink-0 place-items-center md:hidden">
      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} />
    </Link>
  );
}
```

Em `src/lib/format.ts`: mover `fmtH` do `SyncBadge` para `textoHoras(h)` (exportado; o `SyncBadge` passa a importar) e

```ts
export const corDaSincronizacao = (h: number): 'bom' | 'atencao' | 'ruim' => (h < 24 ? 'bom' : h < 48 ? 'atencao' : 'ruim');
```

`layout.tsx` (header): `<div className="mx-auto flex max-w-6xl items-center justify-between gap-1.5 px-3 py-2.5 md:flex-wrap md:gap-3 md:px-6 md:py-3">` com `PeriodPicker` à esquerda e, à direita, `SyncDot` + `<div className="hidden md:block"><SyncBadge/></div>` + `RespToggle` + `PrivacyToggle`. A barra 7/15/30 sai do `PeriodPicker` (o `selectKind` vai para `PeriodoGastos`, Task 6).

- [ ] **Step 4:** PASS + `npx tsc --noEmit -p .`. **Step 5: commit** `feat(painel): card-resposta, elo, bolinha de sincronizacao e cabecalho de uma linha (onda 5)`

### Task 6: Tela Gastos

**Files:**
- Create: `src/app/components/GruposGastos.tsx` (client; grupos → categorias via `CategoryAccordion`), `src/app/components/PeriodoGastos.tsx` (client; 7/15/30/Mês, o `selectKind` antigo)
- Modify: `src/app/gastos/page.tsx`
- Test: `test/lib/componentesOnda5.test.ts`

**Interfaces:**
- Consumes: Task 1 (`diaADia`, `noCredito`, `ateODia`, `gruposDoPeriodo`, `mediaPorGrupo`, `cabeNoMes`, `GrupoTela`), Task 5 (`CardResposta`, `Elo`), `BarraGrupos`, `CategoryAccordion`, `computeRitmo`, `getProjecaoBase`, `computeProjecao`.
- Produces: `GruposGastos({ grupos: GrupoTela[]; total: number; titulo: string; hrefGrupo: (nome: string) => string; periodo: React.ReactNode })`.

- [ ] **Step 1: teste (falha)** — render de `GruposGastos`:

```ts
it('Gastos: barra empilhada + grupos com seta; depois do 4º, "+ N grupos"; valores com money', () => {
  const g = (nome: string, total: number, seta: string | null = null) => ({ nome, emoji: '•', total, cats: ['Groceries'], seta, categorias: [] });
  const h = renderToStaticMarkup(createElement(GruposGastos, {
    grupos: [g('Casa', 500, '➖'), g('Mercado', 300, '⏫'), g('Saúde', 100), g('Pet', 50), g('Compras', 40), g('Resto', 10)],
    total: 1000, titulo: 'Tudo que saiu em outubro', hrefGrupo: (n: string) => `/gastos?grupo=${n}`, periodo: null,
  }));
  expect(h).toContain('Tudo que saiu em outubro');
  expect(h).toContain('⏫');
  expect(h).toContain('+ 2 grupos');
  expect((h.match(/money/g) ?? []).length).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `GruposGastos.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { brl, traduzCategoria } from '@/lib/format';
import type { GrupoTela } from '@/lib/gastosTela';
import { BarraGrupos, CORES_GRUPOS } from './BarraGrupos';
import { CategoryAccordion } from './CategoryAccordion';

/** Onda 5 (Gastos): "Tudo que saiu" — barra empilhada da home, grupos com seta vs média; grupo abre as categorias. */
export function GruposGastos({ grupos, total, titulo, hrefGrupo, periodo }: {
  grupos: GrupoTela[]; total: number; titulo: string; hrefGrupo: (nome: string) => string; periodo: React.ReactNode;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const visiveis = todos ? grupos : grupos.slice(0, 4);
  return (
    <div className="card mb-3 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{titulo} · <span className="money">{brl(total)}</span></span>
        {periodo}
      </div>
      <BarraGrupos grupos={grupos.slice(0, CORES_GRUPOS.length).map((g) => ({ nome: g.nome, pct: pct(g.total), href: hrefGrupo(g.nome) }))} />
      {grupos.length === 0 && <p className="mt-2 text-sm text-muted">Sem gastos no período.</p>}
      <div className="mt-2 divide-y divide-border/60">
        {visiveis.map((g) => (
          <div key={g.nome}>
            <button onClick={() => setAberto(aberto === g.nome ? null : g.nome)} aria-expanded={aberto === g.nome}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left">
              <span className="min-w-0">
                <span className="text-sm">{g.emoji} {g.nome}</span>
                <span className="block truncate text-[11px] text-faint">{g.cats.map(traduzCategoria).join(', ')}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm">
                <span className="tnum money">{brl(g.total)}</span>
                {g.seta && <span className="text-xs" aria-label="comparado com a média">{g.seta}</span>}
                <ChevronDown size={14} className={`text-faint transition-transform ${aberto === g.nome ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {aberto === g.nome && <div className="pb-2"><CategoryAccordion grupos={g.categorias} /></div>}
          </div>
        ))}
      </div>
      {!todos && grupos.length > 4 && (
        <button onClick={() => setTodos(true)} className="mt-1 flex min-h-[40px] w-full items-center justify-between text-sm text-muted">
          <span>+ {grupos.length - 4} grupos</span><span className="tnum money">{brl(grupos.slice(4).reduce((s, g) => s + g.total, 0))}</span>
        </button>
      )}
    </div>
  );
}
```

`PeriodoGastos.tsx`: os 4 botões 7 dias / 15 dias / 30 dias / Mês (estilo do `PeriodPicker` antigo, `text-[11px] px-1.5`), `router.push` mantendo os outros parâmetros (o `setParams`/`selectKind` que saiu do `PeriodPicker`).

`gastos/page.tsx`: mantém leitura de `searchParams` e filtros (Review Focus 4). Novo topo:

```tsx
const corrente = per.kind === 'mes' && per.mesAnchor === currentMonthSP();
// mês em andamento: o ritmo da home (mesma conta); mês fechado: média dos 3 anteriores
const [base, ...anteriores] = await Promise.all([
  corrente ? getProjecaoBase(resp) : Promise.resolve(null),
  ...(per.kind === 'mes' ? [1, 2, 3].map((k) => getDespesas(resp, resolvePeriodo(undefined, addMonths(per.mesAnchor, -k)))) : []),
]);
const diaHoje = Number(currentDateSP().slice(8, 10));
const medias = per.kind === 'mes' ? mediaPorGrupo(anteriores.map((ls) => (corrente ? ateODia(ls, diaHoje) : ls))) : null;
const ritmo = base ? computeRitmo(base, computeProjecao(base, 1)[0]) : null;
const gasto = ritmo ? base!.mesCorrente.variavelJaGasto : diaADia(despesas);
```

- corrente: `<CardResposta pergunta={`Dia a dia (débito e PIX) em ${mesLabel}`} valor={brl(gasto)} complemento={<>de <span className="money">{brl(cabe)}</span> que cabem</>} tom={gasto > cabe ? 'ruim' : gasto >= 0.8 * cabe ? 'atencao' : 'neutro'} apoio={<>Ritmo <span className="money">{brl(ritmo.ritmoAtualDia)}</span>/dia · cabe <span className="money">{brl(ritmo.ritmoSeguroDia)}</span>/dia até o dia {dias}</>}>` + barra (gasto ÷ cabe), `cabe = cabeNoMes(gasto, ritmo.sobraParaODiaADia)`.
- mês fechado: `pergunta="Dia a dia em <mês>"`, `apoio="média dos 3 meses antes: R$ m"` (m = média de `diaADia` dos 3 anteriores).
- 7/15/30 / semana: `pergunta="Dia a dia em <per.label>"`, `apoio="R$ x/dia"`.

Depois: `<GruposGastos grupos={gruposDoPeriodo(despesas, medias)} total={...} titulo={`Tudo que saiu em ${per.label}`} hrefGrupo={(n) => linkPara('gastos', { resp, mes: searchParams.mes, grupo: n })} periodo={<PeriodoGastos />} />`, a linha do 💵, chip de filtro ativo, e `{credito > 0 && <Elo href={linkPara('faturas', { resp })} acao="ver faturas">💳 <span className="money">{brl(credito)}</span> foram no crédito</Elo>}`. Saem `StatStrip`, `CategoriaDonut`, "Por banco" e o `porBanco` (o import morre; `porBanco` segue usado em `dinheiroTela` testes).

- [ ] **Step 4:** testes + `tsc` PASS. **Step 5: commit** `feat(gastos): tela abre com o dia a dia x o que cabe e os grupos (onda 5)`

### Task 7: Tela Faturas

**Files:** Create `src/app/components/LinhaVencimentos.tsx`; Modify `src/app/faturas/page.tsx`, `src/app/components/FaturaCard.tsx` (vira item compacto de limite, recolhido); Test `test/lib/componentesOnda5.test.ts`

**Interfaces:** Consumes Task 2 (`proximosVencimentos`, `Vencimento`), Task 5; Produces `LinhaVencimentos({ itens: Vencimento[]; resp: Resp })`.

- [ ] **Step 1: teste (falha)**

```ts
it('Faturas: linha do tempo com data, pessoa, situação e link do ciclo; atrasada em vermelho', () => {
  const h = renderToStaticMarkup(createElement(LinhaVencimentos, { resp: 'casal', itens: [
    { banco: 'Santander', responsavel: 'Matheus', vence: '2026-10-04', fecha: null, valor: 90, situacao: 'atrasada', ciclo: 'fechada' },
    { banco: 'Neon', responsavel: 'Ariane', vence: '2026-11-05', fecha: '2026-10-29', valor: 60, situacao: 'parcial', ciclo: '2026-10' },
  ] }));
  expect(h).toContain('04/10');
  expect(h).toContain('em atraso');
  expect(h).toContain('text-despesa');
  expect(h).toContain('fecha 29/10 · parcial');
  expect(h).toContain('href="/faturas?cartao=Neon%3AAriane&amp;ciclo=2026-10"');
  expect(h).toContain('money');
});
it('Faturas sem cartão: aviso', () => {
  expect(renderToStaticMarkup(createElement(LinhaVencimentos, { resp: 'Ariane', itens: [] }))).toContain('Nenhuma fatura por vir');
});
```

- [ ] **Step 2:** FAIL. **Step 3:**

```tsx
// src/app/components/LinhaVencimentos.tsx
import Link from 'next/link';
import { brl } from '@/lib/format';
import type { Vencimento } from '@/lib/faturas';
import { linkPara } from '@/lib/links';
import { respBadge } from './ui';

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Onda 5 (Faturas): o que vai sair dos cartões, por data; toque abre as compras daquela fatura. */
export function LinhaVencimentos({ itens, resp }: { itens: Vencimento[]; resp: 'casal' | 'Matheus' | 'Ariane' }) {
  if (!itens.length) return <div className="card mb-3 p-3.5 text-sm text-muted">Nenhuma fatura por vir.</div>;
  return (
    <div className="card mb-3 divide-y divide-border/60 p-3.5 py-1">
      {itens.map((v) => (
        <Link key={`${v.banco}-${v.responsavel}-${v.ciclo}`} href={linkPara('faturas', { resp, cartao: `${v.banco}:${v.responsavel}`, ciclo: v.ciclo })}
          className="flex min-h-[48px] items-center justify-between gap-2 py-2">
          <span className="min-w-0">
            <span className="text-sm">{v.vence ? ddmm(v.vence) : '—'} · {v.banco}</span> {resp === 'casal' && respBadge(v.responsavel)}
            <span className={`block text-[11px] ${v.situacao === 'atrasada' ? 'text-despesa' : 'text-faint'}`}>
              {v.situacao === 'atrasada' ? 'em atraso' : v.situacao === 'fechada' ? 'fechada · a vencer' : `fecha ${ddmm(v.fecha!)} · parcial`}
            </span>
          </span>
          <span className={`shrink-0 text-sm tnum money ${v.situacao === 'atrasada' ? 'text-despesa' : ''}`}>{brl(v.valor)}</span>
        </Link>
      ))}
    </div>
  );
}
```

`faturas/page.tsx`: mantém `views` (com `soma` do ciclo e `?ciclo=`/`?cartao=`). Topo:

```tsx
const vencs = proximosVencimentos(views.map((v, k) => ({ banco: v.banco, responsavel: v.responsavel, fechamento: v.fechamento, ultima: v.ultima, somaCiclo: somaAtual[k] })), hoje);
const proxima = vencs.find((v) => v.situacao !== 'parcial');
```

- `aPagar > 0`: `<CardResposta pergunta="Próximo pagamento" valor={brl(aPagar)} tom={vencs.some((v) => v.situacao === 'atrasada') ? 'ruim' : 'atencao'} apoio={`${proxima.banco} (${proxima.responsavel}) ${proxima.situacao === 'atrasada' ? 'venceu' : 'vence'} ${ddmm(proxima.vence)}${n > 1 ? ` · + ${n - 1} fatura(s)` : ''}`} />`
- senão: `<CardResposta pergunta="Próximo pagamento" valor="R$ 0 agora" dinheiro={false} complemento={<span className="text-accent">tudo pago</span>} apoio={<>As faturas que fecham agora já somam <span className="money">{brl(emCurso)}</span> (parcial — ainda pode entrar compra)</>} />`
- seção "Próximos vencimentos" (`<LinhaVencimentos>`), seção "Limite" com os `FaturaCard` (compacto: nome, pessoa, % e barra; "Ver compras" recolhido; aberto quando pedido por `?cartao`/`?ciclo`). `somaAtual[k]` = soma do ciclo **em curso** de cada cartão (a mesma conta de `emCurso`, guardada por cartão). Sai o `StatStrip`.

- [ ] **Step 4:** PASS. **Step 5: commit** `feat(faturas): tela abre com o proximo pagamento e a linha do tempo (onda 5)`

### Task 8: Tela Contas

**Files:** Modify `src/app/contas/page.tsx`, `src/app/components/ContasLista.tsx` (duas seções); Test `test/lib/componentesOnda5.test.ts`

**Interfaces:** Consumes Task 3 (`separarContas`, `contaEhFatura`), Task 5; `ContasLista` ganha prop `cartoes?: { banco: string; responsavel: string }[]`.

- [ ] **Step 1: teste (falha)**

```ts
it('Contas: seção Falta primeiro, Pagas recolhidas com contagem; fatura ganha "ver fatura"', () => {
  vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
  const i = (nome: string, status: any) => ({ contaId: 1, marcaId: null, nome, responsavel: 'Ariane', previsto: 10, pago: status === 'pago' ? 10 : null, status, dia: 2, vence: 5, parcela: null, avulsa: false, origem: null });
  const h = renderToStaticMarkup(createElement(ContasLista, { mes: '2026-10', resp: 'casal', tiradas: [],
    itens: [i('Sabesp', 'pago'), i('Crédito Neon', 'falta')], cartoes: [{ banco: 'Neon', responsavel: 'Ariane' }] }));
  expect(h.indexOf('Crédito Neon')).toBeLessThan(h.indexOf('Pagas (1)'));
  expect(h).not.toContain('Sabesp'); // pagas recolhidas quando há falta
  expect(h).toContain('href="/faturas?cartao=Neon%3AAriane"');
});
it('Contas sem nada faltando: pagas abertas', () => {
  const h = renderToStaticMarkup(createElement(ContasLista, { mes: '2026-10', resp: 'casal', tiradas: [], itens: [
    { contaId: 1, marcaId: null, nome: 'Sabesp', responsavel: 'Ariane', previsto: 10, pago: 10, status: 'pago', dia: 2, vence: 5, parcela: null, avulsa: false, origem: null }] }));
  expect(h).toContain('Sabesp');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** em `ContasLista`: extrair o corpo do `itens.map` para `const linha = (i: ItemConta) => (...)` (sem mudar nada dentro); `const { falta, pagas } = separarContas(itens)`; `const [verPagas, setVerPagas] = useState(falta.length === 0)`; render:

```tsx
<div className="card divide-y divide-border/60">
  {itens.length === 0 && <p className="py-2 text-sm text-muted">Nenhuma conta cadastrada para este mês.</p>}
  {falta.map(linha)}
</div>
{pagas.length > 0 && (
  <>
    <button onClick={() => setVerPagas(!verPagas)} aria-expanded={verPagas} className="mt-3 mb-1.5 flex min-h-[40px] items-center gap-1 px-1 text-[11px] uppercase tracking-wide text-faint">
      Pagas ({pagas.length}) <ChevronDown size={13} className={verPagas ? 'rotate-180' : ''} />
    </button>
    {verPagas && <div className="card divide-y divide-border/60 opacity-90">{pagas.map(linha)}</div>}
  </>
)}
```

Dentro de `linha`, ao lado do nome: `{(() => { const f = contaEhFatura(i, cartoes ?? []); return f && <Link href={linkPara('faturas', { cartao: `${f.banco}:${f.responsavel}` })} className="text-[11px] text-accent">ver fatura ›</Link>; })()}`.

`contas/page.tsx`: busca também `getFaturas(resp)` (para `cartoes`), troca o `StatStrip` por:

```tsx
<CardResposta pergunta={`Falta pagar em ${mesLabel(mes)}`} valor={r.falta > 0 ? brl(r.falta) : 'Tudo pago'} dinheiro={r.falta > 0}
  tom={r.falta > 0 ? 'atencao' : 'bom'} apoio={`${faltam} conta(s) · ${pagasN} de ${r.itens.length} já pagas`}>
  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent" style={{ width: `${pctPagas}%` }} /></div>
</CardResposta>
```

e, depois da lista, `topo.valor !== null && <Elo href={linkPara('previsao', { resp })} acao="previsão">Entrou <span className="money">{brl(r.entrou)}</span> · {topo.label.toLowerCase()} <span className={`money ${topo.valor < 0 ? 'text-despesa' : 'text-accent'}`}>{brl(topo.valor)}</span></Elo>` (visão individual/futuro: `topo.valor === null` → sem elo; Review Focus 2).

- [ ] **Step 4:** PASS. **Step 5: commit** `feat(contas): tela abre com o que falta; pagas recolhidas; fatura com link (onda 5)`

### Task 9: Tela Previsão

**Files:** Create `src/app/components/GraficoSaida.tsx`; Modify `src/app/previsibilidade/page.tsx`; Test `test/lib/componentesOnda5.test.ts`

**Interfaces:** Consumes Task 4 (`serieSaida`, `PontoSaida`, `projecaoComDebito`), Task 5.

- [ ] **Step 1: teste (falha)**

```ts
it('Previsão: gráfico com linha do zero, ponto de hoje, linha da meta só quando há meta; rótulos do 1º e último mês', () => {
  const p = (mes: string, saldo: number, meta: number | null, hoje = false) => ({ mes, mesLabel: mes, saldo, meta, passado: false, hoje });
  const com = renderToStaticMarkup(createElement(GraficoSaida, { pontos: [p('jul/26', -800, null), p('out/26', -250, -250, true), p('out/28', -9000, 300)] }));
  expect(com).toContain('stroke-dasharray'); // zero e meta
  expect(com).toContain('com a meta');
  expect(com).toContain('jul/26');
  expect(com).toContain('out/28');
  const sem = renderToStaticMarkup(createElement(GraficoSaida, { pontos: [p('out/26', -250, null, true), p('nov/26', -400, null)] }));
  expect(sem).not.toContain('com a meta');
});
```

- [ ] **Step 2:** FAIL. **Step 3:** `GraficoSaida.tsx` (SVG 320×130, mesmo jeito da `LinhaDoMes`: escala com o zero sempre visível; `polyline` vermelha da projeção (passados cheios, futuro igual); `polyline` verde tracejada dos pontos com `meta !== null` + texto "com a meta"; linha do zero tracejada; círculo no ponto `hoje`; rótulos `pontos[0].mesLabel` e `pontos.at(-1).mesLabel`; `role="img"` com `aria-label` "Saldo no fim de cada mês, de X a Y"). Sem valores em texto no SVG (o olho não borra SVG).

`previsibilidade/page.tsx`: o card do topo vira

```tsx
const comMeta = resp === 'casal' && meta.maxDebito !== null && meta.maxDebito < meta.debitoAtual ? projecaoComDebito(base, meta.maxDebito, hoje) : null;
<CardResposta pergunta="Saindo do vermelho" dinheiro={false}
  valor={sai.provavel ? `Sai em ${mesLabel(sai.provavel)}` : `Não sai em ${HORIZONTE_MAX} meses`} tom={sai.provavel ? 'bom' : 'ruim'}
  apoio={<>{textoMetaCurto}{/* faixa/nota individual como hoje, menores */}</>}>
  <GraficoSaida pontos={serieSaida(passados.map((m) => ({ mes: m.mes, saldoFim: m.saldoFim })), projecao, comMeta)} />
</CardResposta>
```

com `textoMetaCurto` = `meta.maxDebito === null ? 'Nem zerando o débito sai até ' + alvoLabel : meta.maxDebito >= meta.debitoAtual ? 'No ritmo de hoje já sai até ' + alvoLabel : <>Com até <b className="money text-accent">{brl(meta.maxDebito)}/mês</b> no débito (hoje <span className="money">{brl(meta.debitoAtual)}</span>), sai em {alvoLabel}</>`. Logo abaixo `<MetaDebito meta={meta} />`. Depois: se `aberto` → `DetalheMes` (como hoje); senão `<details open={searchParams.todos === '1'} className="card mb-3 p-3.5"><summary className="min-h-[40px] cursor-pointer text-sm text-accent">Mês a mês (24) ›</summary><ListaMeses .../></details>` e `<Elo href="/simulador" acao="simular">E se a gente se mudar, ou comprar algo?</Elo>`. `PrevisibilidadeClient` no fim, como hoje.

- [ ] **Step 4:** PASS. **Step 5: commit** `feat(previsao): tela abre com quando sai do vermelho e o grafico de 24 meses (onda 5)`

### Task 10: Conferência, deploy e prints

- [ ] **Step 1:** suíte inteira (integração incluída) + `npx tsc --noEmit -p .` → tudo verde.
- [ ] **Step 2:** `bash scripts/deploy.sh painel` → 9 rotas 200.
- [ ] **Step 3:** no navegador do app (sessão do Matheus), 375×812: print das 4 telas + a home; conferir: cabeçalho em 1 linha no mês atual, olho borra todos os valores novos, links `?grupo=Mercado`, `?tipo=livre&forma=debito`, `?cartao=…&ciclo=fechada`, `/previsibilidade?mes=AAAA-MM`, mês passado em Gastos e Contas, visão Ariane nas 4. Achado visual = correção com teste antes do fim.
- [ ] **Step 4:** registrar no ledger, no Roadmap do vault (Onda 5 ✅) e push da branch (varredura de valores reais antes).
