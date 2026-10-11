# F3 — Trilha e reserva: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faixa da trilha (4 fases: dívidas → sobrar → reserva → patrimônio) no topo da home e tela `/trilha` com o detalhe, tudo calculado dos dados.

**Architecture:** Regras e textos em funções puras em `src/lib/trilha.ts` (`ehDivida`, `ehAtraso`, `agruparDividas`, `mesesComContaNegativa`, `avaliarTrilha`); `getTrilhaDados(hoje)` em `queries.ts` junta o que já existe (meses passados, projeção, meta do débito, patrimônio) com três consultas novas (lançamentos de dívida/atraso, aplicação líquida por mês); componentes de servidor desenham a faixa e a tela.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, lucide-react, `pg`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-11-f3-trilha-reserva-design.md`

## Global Constraints

- Nenhuma dependência nova.
- Repositório público: nenhum valor real em reais, CPF/CNPJ, nome de terceiro ou descrição da situação financeira pessoal em código, teste, comentário ou commit.
- Todo dinheiro mostrado leva a classe `money`; texto que não é dinheiro não leva.
- Todos os números da trilha são da visão do **casal**, qualquer que seja a pessoa escolhida na home.
- Constantes: `MESES_RESERVA = 6`, `META_PATRIMONIO = 0.10`, `MESES_ATRASO = 2`, `MESES_SOBRA = 3`.
- Mês `AAAA-MM`; textos com `mesLabel` (ex.: "mar/27") e `brl`.
- Testes: `npx vitest run`; integração com `TEST_DATABASE_URL` (Postgres descartável em 127.0.0.1:55432, banco `personal_hub_db`).
- Commits via `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Parcela de dívida no cartão que já acabou (nenhuma futura)** → não aparece como dívida ativa (só débito sem data futura vira "sem fim"). (Task 1)
2. **Compra parcelada comum ("LOJA X 3/10")** → não é dívida, nem com a palavra "PARC" na descrição. (Task 1)
3. **Receita zero nos 3 meses** → % da renda aplicada = 0, sem divisão por zero nem `NaN` na tela. (Task 2)
4. **Ritmo de aplicação negativo (resgatou mais que aplicou)** → reserva "sem previsão", não data no passado. (Task 2)
5. **Menos de 3 meses fechados com dado** → fase 2 não cumprida e o progresso mostra os que existem, sem quebrar. (Task 2)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/trilha.ts` (novo) | regras (`ehDivida`, `ehAtraso`), `agruparDividas`, `mesesComContaNegativa`, `avaliarTrilha`, tipos |
| `src/lib/queries.ts` | `getTrilhaDados(hoje)` |
| `src/lib/links.ts` | tela `'trilha'`; `temSeletorDeMes('/trilha') = false` |
| `src/app/components/FaixaTrilha.tsx` (novo) | a faixa da home |
| `src/app/components/CartaoFase.tsx` (novo) | um cartão de fase da tela |
| `src/app/trilha/page.tsx` (novo) | a tela |
| `src/app/page.tsx` | faixa no topo da home |
| `src/app/components/Nav.tsx` | "Trilha" no Mais |

---

### Task 1: Regras de dívida, atraso e conta negativa

**Files:** Create `src/lib/trilha.ts`; Test `test/lib/trilha.test.ts`

**Interfaces — Produces:**
- `ehDivida(descricao: string, categoria: string | null): boolean`
- `ehAtraso(descricao: string, categoria: string | null): boolean`
- `interface LancDivida { descricao: string; categoria: string | null; banco: string; forma: string; data: string /* AAAA-MM-DD */; valor: number }`
- `interface DividaAtiva { nome: string; banco: string; valorParcela: number; restantes: number | null; fim: string | null /* AAAA-MM */ }`
- `agruparDividas(lancs: LancDivida[], hoje: string): DividaAtiva[]` — só lançamentos `ehDivida`; agrupa por nome (descrição minúscula, sem dígitos/barras/pontos, espaços normalizados) + banco; grupo com lançamento depois de `hoje` → `restantes` = quantos futuros, `valorParcela` = valor do último futuro, `fim` = mês do último; sem futuro e forma `Débito` → `restantes: null, fim: null` (os lançamentos já vêm filtrados à janela de 2 meses pela consulta); sem futuro e outra forma → não é ativa. Ordena por `fim` (null por último).
- `mesesComContaNegativa(saldoHoje: number, movs: Record<string, number>, desde: string, hoje: string): string[]` — saldo no início de `desde` = saldoHoje − soma dos movs ≥ desde; percorre os dias com movimento em ordem; devolve os meses (`AAAA-MM`, sem repetir) em que o saldo ficou < 0 em algum fim de dia (inclui o mês de `desde` se já começou negativo).

- [ ] **Step 1: teste (falha primeiro)** — `test/lib/trilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { agruparDividas, ehAtraso, ehDivida, mesesComContaNegativa } from '../../src/lib/trilha';

describe('o que é dívida', () => {
  it('renegociação, parcelamento de fatura, empréstimo e financiamento são dívida', () => {
    expect(ehDivida('RENEGOCIAÇÃO DE PENDÊNCIAS 3/12', 'Transfers')).toBe(true);
    expect(ehDivida('Renegociacao de divida', null)).toBe(true);
    expect(ehDivida('PARCELAMENTO DE FATURA 2/6', 'Credit card payment')).toBe(true);
    expect(ehDivida('PARC.FATURA 01/04', null)).toBe(true);
    expect(ehDivida('PREST. DE EMPREST. FINANCIAMENTO PARC 3 10', 'Loans and financing')).toBe(true);
    expect(ehDivida('qualquer coisa', 'Loans')).toBe(true);
  });
  it('compra parcelada comum não é dívida, mesmo com "PARC" na descrição', () => {
    expect(ehDivida('LOJA X 3/10', 'Shopping')).toBe(false);
    expect(ehDivida('PARC LOJA DE MOVEIS 2/5', 'Houseware')).toBe(false);
    expect(ehDivida('CRÉDITO DE PARCELAMENTO', 'Transfers')).toBe(false);
  });
  it('juros e encargos de atraso são atraso', () => {
    expect(ehAtraso('JUROS DE MORA', 'Late payment and overdraft costs')).toBe(true);
    expect(ehAtraso('ENCARGOS DE ATRASO', 'Bank fees')).toBe(true);
    expect(ehAtraso('ENC ATRASO PARC FATURA', 'Automotive')).toBe(true);
    expect(ehAtraso('juros', 'Interests charged')).toBe(true);
    expect(ehAtraso('TARIFA PACOTE', 'Bank fees')).toBe(false);
  });
});

describe('dívidas ativas', () => {
  const l = (descricao: string, data: string, valor: number, forma = 'Crédito', banco = 'B1', categoria: string | null = null) => ({ descricao, categoria, banco, forma, data, valor });
  it('parcelas futuras: quantas faltam, valor e fim; débito sem data futura fica sem fim; cartão já acabado não aparece', () => {
    const r = agruparDividas([
      l('RENEGOCIAÇÃO DE PENDÊNCIAS 5/12', '2026-10-10', 100), l('RENEGOCIAÇÃO DE PENDÊNCIAS 6/12', '2026-11-10', 100), l('RENEGOCIAÇÃO DE PENDÊNCIAS 7/12', '2026-12-10', 100),
      l('PREST. DE EMPREST. FINANCIAMENTO PARC 3 10', '2026-10-02', 50, 'Débito', 'B2', 'Loans and financing'),
      l('PARCELAMENTO DE FATURA 6/6', '2026-10-05', 80),
      l('LOJA X 3/10', '2026-12-01', 40),
    ], '2026-10-15');
    expect(r).toEqual([
      { nome: 'renegociação de pendências', banco: 'B1', valorParcela: 100, restantes: 2, fim: '2026-12' },
      { nome: 'prest de emprest financiamento parc', banco: 'B2', valorParcela: 50, restantes: null, fim: null },
    ]);
  });
  it('sem lançamento de dívida: lista vazia', () => {
    expect(agruparDividas([l('LOJA X 3/10', '2026-12-01', 40)], '2026-10-15')).toEqual([]);
  });
});

describe('conta negativa', () => {
  it('meses em que o saldo de fim de dia ficou abaixo de zero', () => {
    // hoje 100; em 05/09 saiu 300 e em 20/09 entrou 250 → início de set = 100 − (−300 + 250) = 150
    expect(mesesComContaNegativa(100, { '2026-09-05': -300, '2026-09-20': 250 }, '2026-09-01', '2026-10-15')).toEqual(['2026-09']);
    expect(mesesComContaNegativa(500, { '2026-09-05': -100 }, '2026-09-01', '2026-10-15')).toEqual([]);
  });
  it('já começa negativo: conta o mês do início', () => {
    expect(mesesComContaNegativa(-10, {}, '2026-09-01', '2026-10-15')).toEqual(['2026-09']);
  });
});
```

Run `npx vitest run test/lib/trilha.test.ts` → FAIL "Failed to load url ../../src/lib/trilha".

- [ ] **Step 2: implementar** — `src/lib/trilha.ts`:

```ts
// Trilha do casal (F3): sair das dívidas → fazer sobrar → reserva → patrimônio. Regras e textos puros.

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const CATS_DIVIDA = ['Loans and financing', 'Loans'];
const PALAVRAS_DIVIDA = ['RENEGOCIA', 'PARCELAMENTO DE FATURA', 'PARC.FATURA', 'EMPREST', 'FINANCIAMENTO'];
const CATS_ATRASO = ['Interests charged', 'Late payment and overdraft costs'];
const PALAVRAS_ATRASO = ['JUROS DE MORA', 'ENCARGOS DE ATRASO', 'ENC ATRASO'];

/** Dívida de verdade (renegociação, parcelamento de fatura, empréstimo); compra parcelada comum não é. */
export function ehDivida(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_DIVIDA.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_DIVIDA.some((p) => d.includes(p));
}

/** Juros/encargos de atraso: sinal de fatura não paga inteira ou de conta no negativo. */
export function ehAtraso(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_ATRASO.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_ATRASO.some((p) => d.includes(p));
}

export interface LancDivida { descricao: string; categoria: string | null; banco: string; forma: string; data: string; valor: number }
export interface DividaAtiva { nome: string; banco: string; valorParcela: number; restantes: number | null; fim: string | null }

const nomeDivida = (d: string) => d.toLowerCase().replace(/[0-9/.]/g, ' ').replace(/\s+/g, ' ').trim();

/** Dívidas ainda em aberto: parcelas depois de hoje; prestação no débito (sem data futura) fica sem fim. */
export function agruparDividas(lancs: LancDivida[], hoje: string): DividaAtiva[] {
  const grupos = new Map<string, LancDivida[]>();
  for (const l of lancs) {
    if (!ehDivida(l.descricao, l.categoria)) continue;
    const k = `${nomeDivida(l.descricao)}|${l.banco}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const out: DividaAtiva[] = [];
  for (const [k, ls] of Array.from(grupos)) {
    const [nome, banco] = k.split('|');
    const futuras = ls.filter((l) => l.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
    if (futuras.length > 0) {
      const ult = futuras[futuras.length - 1];
      out.push({ nome, banco, valorParcela: ult.valor, restantes: futuras.length, fim: ult.data.slice(0, 7) });
    } else if (ls.some((l) => l.forma === 'Débito')) {
      const ult = [...ls].sort((a, b) => a.data.localeCompare(b.data))[ls.length - 1];
      out.push({ nome, banco, valorParcela: ult.valor, restantes: null, fim: null });
    }
  }
  return out.sort((a, b) => (a.fim ?? '9999').localeCompare(b.fim ?? '9999'));
}

/** Meses em que o saldo em conta (reconstruído do saldo de hoje e dos movimentos) ficou negativo. */
export function mesesComContaNegativa(saldoHoje: number, movs: Record<string, number>, desde: string, hoje: string): string[] {
  const dias = Object.keys(movs).filter((d) => d >= desde && d <= hoje).sort();
  let saldo = saldoHoje - dias.reduce((s, d) => s + movs[d], 0);
  const meses = new Set<string>();
  if (saldo < -0.005) meses.add(desde.slice(0, 7));
  for (const d of dias) {
    saldo += movs[d];
    if (saldo < -0.005) meses.add(d.slice(0, 7));
  }
  return Array.from(meses).sort();
}
```

- [ ] **Step 3:** `npx vitest run test/lib/trilha.test.ts` → PASS. **Step 4: commit** — `feat(trilha): regras de divida, atraso e conta negativa (F3)`.

---

### Task 2: Avaliar a trilha

**Files:** Modify `src/lib/trilha.ts`; Test `test/lib/trilha.test.ts`

**Interfaces:**
- Consumes: `DividaAtiva` (Task 1); `addMonths` (previsao.ts); `brl`, `mesLabel` (format.ts)
- Produces:
  - `const MESES_RESERVA = 6, META_PATRIMONIO = 0.1, MESES_ATRASO = 2, MESES_SOBRA = 3`
  - `interface DadosTrilha { hoje: string; dividas: DividaAtiva[]; atrasos: { mes: string; motivo: 'juros' | 'conta_negativa' }[]; passados: { mes: string; sobra: number; receita: number }[]; sobraPrevista: { mes: string; sobra: number }[]; textoMeta: string; gastoTravado: { fixos: number; casa: number; debitoTravado: number }; aplicado: number; aplicacaoMensal: { mes: string; valor: number }[] }`
  - `type StatusFase = 'cumprida' | 'atual' | 'depois'`
  - `interface Fase { n: 1 | 2 | 3 | 4; titulo: string; status: StatusFase; quando: string | null; proximoPasso: string }`
  - `interface Trilha { atual: 1 | 2 | 3 | 4; fases: Fase[]; reserva: { meta: number; aplicado: number; ritmo: number }; patrimonio: { pct: number; meta: number } ; sobra: { cumpridos: number; meses: { mes: string; sobra: number }[] } }`
  - `avaliarTrilha(d: DadosTrilha): Trilha`

Regras (spec §1): fase 1 cumprida ⇔ sem dívidas e sem atrasos; `quando` = "sem data de fim conhecida" se alguma dívida tem `fim` null, senão o maior entre o último `fim` e (último mês com atraso + `MESES_ATRASO`), em `mesLabel`; sem nada pendente, `null`. Fase 2 cumprida ⇔ `passados.length >= 3` e todos com sobra ≥ 0; `quando` = fim da primeira sequência de 3 sobras previstas ≥ 0, ou "pela previsão, não acontece em 24 meses"; próximo passo = `textoMeta`. Fase 3: meta = 6 × (fixos + casa + débito travado); cumprida ⇔ aplicado ≥ meta; ritmo = média de `aplicacaoMensal`; `quando` = mês atual + ⌈falta/ritmo⌉ (ritmo ≤ 0 → "sem previsão"); próximo passo "Aplicar R$ X/mês completa a reserva em MMM/AA" com X = ⌈falta/12⌉ (cumprida → "Reserva completa: manter."). Fase 4 nunca cumprida; pct = Σ aplicação / Σ receita dos passados (receita 0 → 0); próximo passo "Aplicar 10% do que entra (R$ X/mês)" com X = receita média × 0,1. Fase atual = primeira não cumprida entre 1–3, senão 4. Status: `n === atual` → 'atual'; cumprida → 'cumprida'; senão 'depois'.

- [ ] **Step 1: teste (falha primeiro)** — acrescentar em `test/lib/trilha.test.ts`:

```ts
import { avaliarTrilha, type DadosTrilha } from '../../src/lib/trilha';

const dados = (p: Partial<DadosTrilha> = {}): DadosTrilha => ({
  hoje: '2026-10-15', dividas: [], atrasos: [],
  passados: [{ mes: '2026-07', sobra: 100, receita: 1000 }, { mes: '2026-08', sobra: 50, receita: 1000 }, { mes: '2026-09', sobra: 10, receita: 1000 }],
  sobraPrevista: [{ mes: '2026-11', sobra: 10 }, { mes: '2026-12', sobra: 10 }, { mes: '2027-01', sobra: 10 }],
  textoMeta: 'meta do débito', gastoTravado: { fixos: 100, casa: 50, debitoTravado: 50 },
  aplicado: 0, aplicacaoMensal: [{ mes: '2026-07', valor: 100 }, { mes: '2026-08', valor: 100 }, { mes: '2026-09', valor: 100 }],
  ...p,
});

describe('avaliar a trilha', () => {
  it('com dívida: fase 1 atual, quando = última parcela, próximo passo cita o mês', () => {
    const t = avaliarTrilha(dados({ dividas: [{ nome: 'reneg', banco: 'B', valorParcela: 10, restantes: 3, fim: '2027-03' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases[0]).toMatchObject({ status: 'atual', quando: 'mar/27' });
    expect(t.fases[0].proximoPasso).toContain('mar/27');
    expect(t.fases[1].status).toBe('cumprida'); // sobra já cumprida aparece como cumprida mesmo depois da atual
  });
  it('dívida sem fim conhecido e atraso: quando sem data; atraso conta até 2 meses depois', () => {
    expect(avaliarTrilha(dados({ dividas: [{ nome: 'emp', banco: 'B', valorParcela: 10, restantes: null, fim: null }] })).fases[0].quando).toBe('sem data de fim conhecida');
    const t = avaliarTrilha(dados({ atrasos: [{ mes: '2026-09', motivo: 'juros' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases[0].quando).toBe('nov/26');
    expect(t.fases[0].proximoPasso).toContain('set/26');
  });
  it('sem dívida e sem atraso: fase 1 cumprida; com sobra negativa num dos 3 meses a fase 2 é a atual', () => {
    const t = avaliarTrilha(dados({ passados: [{ mes: '2026-07', sobra: 100, receita: 1000 }, { mes: '2026-08', sobra: -1, receita: 1000 }, { mes: '2026-09', sobra: 10, receita: 1000 }] }));
    expect(t.atual).toBe(2);
    expect(t.fases[0].status).toBe('cumprida');
    expect(t.sobra.cumpridos).toBe(2);
    expect(t.fases[1]).toMatchObject({ quando: 'jan/27', proximoPasso: 'meta do débito' });
  });
  it('previsão sem 3 sobras seguidas em 24 meses', () => {
    const t = avaliarTrilha(dados({ passados: [], sobraPrevista: [{ mes: '2026-11', sobra: 1 }, { mes: '2026-12', sobra: -1 }, { mes: '2027-01', sobra: 1 }] }));
    expect(t.atual).toBe(2);
    expect(t.fases[1].quando).toBe('pela previsão, não acontece em 24 meses');
    expect(t.sobra.cumpridos).toBe(0);
  });
  it('reserva: meta = 6 × gasto travado; ritmo da aplicação dá a data; sem aplicação, sem previsão', () => {
    const t = avaliarTrilha(dados()); // meta 6 × 200 = 1200, aplicado 0, ritmo 100 → 12 meses
    expect(t.atual).toBe(3);
    expect(t.reserva).toEqual({ meta: 1200, aplicado: 0, ritmo: 100 });
    expect(t.fases[2].quando).toBe('out/27');
    expect(t.fases[2].proximoPasso).toContain('/mês completa a reserva em out/27');
    const resgate = avaliarTrilha(dados({ aplicacaoMensal: [{ mes: '2026-09', valor: -50 }] }));
    expect(resgate.fases[2].quando).toBe('sem previsão');
  });
  it('reserva completa: fase 4 é a atual; % da renda aplicada; receita zero não quebra', () => {
    const t = avaliarTrilha(dados({ aplicado: 5000 }));
    expect(t.atual).toBe(4);
    expect(t.fases[2]).toMatchObject({ status: 'cumprida', proximoPasso: 'Reserva completa: manter.' });
    expect(t.patrimonio).toEqual({ pct: 0.1, meta: 0.1 });
    const semRenda = avaliarTrilha(dados({ aplicado: 5000, passados: [] }));
    expect(semRenda.patrimonio.pct).toBe(0);
    expect(semRenda.fases[3].proximoPasso).not.toContain('NaN');
  });
  it('fase cumprida que volta a falhar reabre (dívida nova com sobra e reserva em dia)', () => {
    const t = avaliarTrilha(dados({ aplicado: 5000, dividas: [{ nome: 'nova', banco: 'B', valorParcela: 1, restantes: 1, fim: '2026-11' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases.map((f) => f.status)).toEqual(['atual', 'cumprida', 'cumprida', 'depois']);
  });
});
```

Run → FAIL ("avaliarTrilha is not a function" / import).

- [ ] **Step 2: implementar** — acrescentar em `src/lib/trilha.ts`:

```ts
import { addMonths } from './previsao';
import { brl, mesLabel } from './format';

export const MESES_RESERVA = 6;
export const META_PATRIMONIO = 0.1;
export const MESES_ATRASO = 2;
export const MESES_SOBRA = 3;

export interface DadosTrilha {
  hoje: string;
  dividas: DividaAtiva[];
  atrasos: { mes: string; motivo: 'juros' | 'conta_negativa' }[];
  passados: { mes: string; sobra: number; receita: number }[];
  sobraPrevista: { mes: string; sobra: number }[];
  textoMeta: string;
  gastoTravado: { fixos: number; casa: number; debitoTravado: number };
  aplicado: number;
  aplicacaoMensal: { mes: string; valor: number }[];
}
export type StatusFase = 'cumprida' | 'atual' | 'depois';
export interface Fase { n: 1 | 2 | 3 | 4; titulo: string; status: StatusFase; quando: string | null; proximoPasso: string }
export interface Trilha {
  atual: 1 | 2 | 3 | 4; fases: Fase[];
  reserva: { meta: number; aplicado: number; ritmo: number };
  patrimonio: { pct: number; meta: number };
  sobra: { cumpridos: number; meses: { mes: string; sobra: number }[] };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function avaliarTrilha(d: DadosTrilha): Trilha {
  const mesAtual = d.hoje.slice(0, 7);

  // 1. dívidas
  const semFim = d.dividas.some((x) => x.fim === null);
  const ultAtraso = d.atrasos.map((a) => a.mes).sort().pop() ?? null;
  const limpaEm = [...d.dividas.map((x) => x.fim).filter((f): f is string => !!f), ...(ultAtraso ? [addMonths(ultAtraso, MESES_ATRASO)] : [])].sort().pop() ?? null;
  const f1ok = d.dividas.length === 0 && d.atrasos.length === 0;
  const q1 = f1ok ? null : semFim ? 'sem data de fim conhecida' : limpaEm ? mesLabel(limpaEm) : null;
  const ultParcela = d.dividas.map((x) => x.fim).filter((f): f is string => !!f).sort().pop();
  const p1 = ultAtraso
    ? `Houve juros ou conta negativa em ${mesLabel(ultAtraso)}: pagar a fatura inteira e não deixar a conta negativa.`
    : semFim ? 'Manter a fatura paga inteira; há dívida sem data de fim conhecida.'
    : ultParcela ? `Manter a fatura paga inteira; a última parcela de dívida é em ${mesLabel(ultParcela)}.`
    : 'Sem dívidas: manter assim.';

  // 2. fazer sobrar
  const meses = d.passados.slice(-MESES_SOBRA);
  const cumpridos = meses.filter((m) => m.sobra >= 0).length;
  const f2ok = meses.length >= MESES_SOBRA && cumpridos === MESES_SOBRA;
  let q2: string | null = 'pela previsão, não acontece em 24 meses';
  for (let i = 0; i + MESES_SOBRA <= d.sobraPrevista.length; i++) {
    if (d.sobraPrevista.slice(i, i + MESES_SOBRA).every((m) => m.sobra >= 0)) { q2 = mesLabel(d.sobraPrevista[i + MESES_SOBRA - 1].mes); break; }
  }

  // 3. reserva
  const g = d.gastoTravado;
  const meta = r2(MESES_RESERVA * (g.fixos + g.casa + g.debitoTravado));
  const f3ok = d.aplicado >= meta;
  const ritmo = d.aplicacaoMensal.length ? r2(d.aplicacaoMensal.reduce((s, m) => s + m.valor, 0) / d.aplicacaoMensal.length) : 0;
  const falta = Math.max(0, meta - d.aplicado);
  const q3 = f3ok ? null : ritmo > 0 ? mesLabel(addMonths(mesAtual, Math.ceil(falta / ritmo))) : 'sem previsão';
  const p3 = f3ok ? 'Reserva completa: manter.'
    : `Aplicar ${brl(Math.ceil(falta / 12))}/mês completa a reserva em ${mesLabel(addMonths(mesAtual, 12))}.`;

  // 4. patrimônio
  const receita = d.passados.reduce((s, m) => s + m.receita, 0);
  const aplicacao = d.aplicacaoMensal.reduce((s, m) => s + m.valor, 0);
  const pct = receita > 0 ? r2(aplicacao / receita) : 0;
  const receitaMedia = d.passados.length ? receita / d.passados.length : 0;

  const ok = [f1ok, f2ok, f3ok];
  const atual = ((ok.findIndex((x) => !x) + 1) || 4) as 1 | 2 | 3 | 4;
  const st = (n: number, cumprida: boolean): StatusFase => (n === atual ? 'atual' : cumprida ? 'cumprida' : 'depois');
  return {
    atual,
    fases: [
      { n: 1, titulo: 'Sair das dívidas', status: st(1, f1ok), quando: q1, proximoPasso: p1 },
      { n: 2, titulo: 'Fazer sobrar', status: st(2, f2ok), quando: f2ok ? null : q2, proximoPasso: d.textoMeta },
      { n: 3, titulo: 'Reserva de emergência', status: st(3, f3ok), quando: q3, proximoPasso: p3 },
      { n: 4, titulo: 'Construir patrimônio', status: st(4, false), quando: null, proximoPasso: `Aplicar 10% do que entra (${brl(r2(receitaMedia * META_PATRIMONIO))}/mês).` },
    ],
    reserva: { meta, aplicado: d.aplicado, ritmo },
    patrimonio: { pct, meta: META_PATRIMONIO },
    sobra: { cumpridos, meses: meses.map((m) => ({ mes: m.mes, sobra: m.sobra })) },
  };
}
```

> Os imports de `addMonths`, `brl` e `mesLabel` vão para o topo do arquivo.

- [ ] **Step 3:** `npx vitest run test/lib/trilha.test.ts` → PASS. **Step 4: commit** — `feat(trilha): fases, datas e proximo passo (F3)`.

---

### Task 3: Dados da trilha

**Files:** Modify `src/lib/queries.ts`; Test `test/integracao/previsao.test.ts`

**Interfaces:**
- Consumes: `agruparDividas`, `ehAtraso`, `mesesComContaNegativa`, `DadosTrilha`, `MESES_ATRASO`, `MESES_SOBRA` (Tasks 1–2); `getMesesPassados`, `getProjecaoBase`, `computeProjecao`, `getMovimentosDiarios`, `getSaldoContas`; `debitoParaSairAte`, `textoMetaAlvo` (meta.ts)
- Produces: `getTrilhaDados(hoje?: string): Promise<DadosTrilha>`

- [ ] **Step 1: teste (falha primeiro)** — no fim do `describe` de `test/integracao/previsao.test.ts`:

```ts
  it('dados da trilha: dívida futura, atraso, aplicação líquida e aplicado', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('tr-1', '2038-05-10', 100, 'RENEGOCIAÇÃO DE PENDÊNCIAS 5/7', 'Loans and financing', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-04-01'),
      ('tr-2', '2038-06-10', 100, 'RENEGOCIAÇÃO DE PENDÊNCIAS 6/7', 'Loans and financing', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-04-01'),
      ('tr-3', '2038-03-20', 30, 'JUROS DE MORA', 'Late payment and overdraft costs', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-03-20'),
      ('tr-4', '2038-02-05', 200, 'APLICAÇÃO RDB', 'Investments', 'Débito', 'B1', 'Ariane', 'transferencia_interna', 'Saída', '2038-02-05'),
      ('tr-5', '2038-03-05', 50, 'RESGATE RDB', 'Investments', 'Débito', 'B1', 'Ariane', 'transferencia_interna', 'Entrada', '2038-03-05'),
      ('tr-6', '2038-03-06', 1, 'REND PAGO APLIC AUT', 'Proceeds interests and dividends', 'Débito', 'B1', 'Ariane', 'receita', 'Entrada', '2038-03-06'),
      ('tr-7', '2038-03-07', 80, 'PIX APLICACAO', 'Transfers', 'Débito', 'B1', 'Ariane', 'aporte', 'Saída', '2038-03-07'),
      ('tr-8', '2038-02-11', 40, 'LOJA X 2/5', 'Shopping', 'Crédito', 'B1', 'Ariane', 'despesa', 'Saída', '2038-02-11')`);
    const d = await queries.getTrilhaDados('2038-04-15');
    expect(d.dividas).toEqual([{ nome: 'renegociação de pendências', banco: 'B1', valorParcela: 100, restantes: 2, fim: '2038-06' }]);
    expect(d.atrasos).toContainEqual({ mes: '2038-03', motivo: 'juros' });
    expect(d.aplicacaoMensal).toEqual([{ mes: '2038-01', valor: 0 }, { mes: '2038-02', valor: 200 }, { mes: '2038-03', valor: 30 }]);
    expect(d.passados.map((p) => p.mes)).toEqual(['2038-01', '2038-02', '2038-03']);
    expect(d.sobraPrevista).toHaveLength(24);
    expect(typeof d.textoMeta).toBe('string');
    expect(d.aplicado).toBeGreaterThanOrEqual(0);
  });
```

Run integração → FAIL "getTrilhaDados is not a function".

- [ ] **Step 2: implementar** — em `queries.ts` (imports: `agruparDividas, ehAtraso, mesesComContaNegativa, MESES_ATRASO, MESES_SOBRA, type DadosTrilha` de `./trilha`; `debitoParaSairAte, textoMetaAlvo` de `./meta`; `brl` de `./format`):

```ts
/** Tudo que a trilha (F3) precisa, sempre na visão do casal. */
export async function getTrilhaDados(hoje: string = currentDateSP()): Promise<DadosTrilha> {
  const mesAtual = hoje.slice(0, 7);
  const desde = `${addMonths(mesAtual, -(MESES_ATRASO - 1))}-01`; // janela de atraso: o mês anterior e o atual
  const iniPassados = `${addMonths(mesAtual, -MESES_SOBRA)}-01`;
  const [base, passados, saldo, movs, divRows, aplRows] = await Promise.all([
    getProjecaoBase('casal', hoje),
    getMesesPassados('casal', hoje),
    getSaldoContas('casal'),
    getMovimentosDiarios('casal', desde, hoje),
    q<any>(
      `SELECT descricao, categoria, COALESCE(banco,'—') AS banco, forma_pagamento AS forma,
              to_char(data_lancamento,'YYYY-MM-DD') AS data, valor::float8 AS valor
       FROM financas_lancamentos
       WHERE classe = 'despesa' AND ${SEM_ESPELHO}
         AND (data_lancamento > $2::date OR data_lancamento >= $1::date)
         AND (data_lancamento <= $2::date OR criado_em::date <= $2::date)`,
      [desde, hoje],
    ),
    q<any>(
      `SELECT to_char(data_lancamento,'YYYY-MM') AS mes,
              SUM(CASE WHEN tipo_movimento = 'Entrada' THEN -valor ELSE valor END)::float8 AS liq
       FROM financas_lancamentos
       WHERE forma_pagamento = 'Débito' AND classe <> 'receita'
         AND (classe = 'aporte' OR categoria = 'Investments')
         AND data_lancamento >= $1::date AND data_lancamento < date_trunc('month', $2::date)
       GROUP BY 1`,
      [iniPassados, hoje],
    ),
  ]);
  const proj = computeProjecao(base, 24, hoje);
  const debitoAtual = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
  const alvo = addMonths(mesAtual, 12);
  const lancs = divRows.map((x) => ({ descricao: x.descricao ?? '', categoria: x.categoria, banco: x.banco, forma: x.forma, data: x.data, valor: Number(x.valor) }));
  const juros = lancs.filter((l) => l.data >= desde && l.data <= hoje && ehAtraso(l.descricao, l.categoria)).map((l) => l.data.slice(0, 7));
  const porMes = new Map(aplRows.map((x) => [x.mes, Math.round(Number(x.liq) * 100) / 100]));
  return {
    hoje,
    dividas: agruparDividas(lancs, hoje),
    atrasos: [
      ...Array.from(new Set(juros)).sort().map((mes) => ({ mes, motivo: 'juros' as const })),
      ...mesesComContaNegativa(saldo.total, movs, desde, hoje).map((mes) => ({ mes, motivo: 'conta_negativa' as const })),
    ],
    passados: passados.map((p) => ({ mes: p.mes, sobra: p.real.saldo, receita: p.real.receita })),
    sobraPrevista: proj.slice(1).map((m) => ({ mes: m.mes, sobra: m.saldo })),
    textoMeta: textoMetaAlvo(debitoParaSairAte(base, hoje, alvo), debitoAtual, mesLabel(alvo), (v) => brl(v)),
    gastoTravado: { fixos: proj[1]?.despesaManual ?? 0, casa: proj[1]?.despesaCasa ?? 0, debitoTravado: base.despesaFixaDebitoMedia ?? 0 },
    aplicado: base.patrimonioAtual,
    aplicacaoMensal: Array.from({ length: MESES_SOBRA }, (_, i) => addMonths(mesAtual, -(MESES_SOBRA - i))).map((mes) => ({ mes, valor: porMes.get(mes) ?? 0 })),
  };
}
```

> A consulta de dívidas traz lançamentos da janela (`>= desde`) **e** os futuros já conhecidos (`> hoje`, gravados até hoje). `agruparDividas` filtra `ehDivida`; os juros saem dos mesmos lançamentos com `ehAtraso`, só dentro da janela. Confira se `mesLabel` e `brl` já estão importados em `queries.ts` (estão, de `./format`).

- [ ] **Step 3:** integração → PASS; suíte inteira + `tsc`. **Step 4: commit** — `feat(trilha): dados da trilha (F3)`.

---

### Task 4: Faixa na home, tela `/trilha` e navegação

**Files:** Create `src/app/components/FaixaTrilha.tsx`, `src/app/components/CartaoFase.tsx`, `src/app/trilha/page.tsx`; Modify `src/app/page.tsx`, `src/app/components/Nav.tsx`, `src/lib/links.ts`, `test/lib/links.test.ts`; Test `test/lib/componentesTrilha.test.ts`

**Interfaces:** Consumes `Trilha`, `Fase`, `avaliarTrilha` (Task 2), `getTrilhaDados` (Task 3). Produces rota `/trilha`, `linkPara('trilha')`.

- [ ] **Step 1: testes (falham primeiro)** — `test/lib/componentesTrilha.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaixaTrilha } from '../../src/app/components/FaixaTrilha';
import { CartaoFase } from '../../src/app/components/CartaoFase';
import type { Trilha } from '../../src/lib/trilha';

const trilha: Trilha = {
  atual: 1,
  fases: [
    { n: 1, titulo: 'Sair das dívidas', status: 'atual', quando: 'mar/27', proximoPasso: 'Manter a fatura paga inteira.' },
    { n: 2, titulo: 'Fazer sobrar', status: 'depois', quando: 'pela previsão, não acontece em 24 meses', proximoPasso: 'meta' },
    { n: 3, titulo: 'Reserva de emergência', status: 'depois', quando: 'sem previsão', proximoPasso: 'Aplicar' },
    { n: 4, titulo: 'Construir patrimônio', status: 'depois', quando: null, proximoPasso: 'Aplicar 10%' },
  ],
  reserva: { meta: 1200, aplicado: 300, ritmo: 0 }, patrimonio: { pct: 0, meta: 0.1 }, sobra: { cumpridos: 1, meses: [{ mes: '2026-09', sobra: 5 }] },
};

describe('faixa da trilha', () => {
  it('link para /trilha, fase N de 4, quatro tracinhos, título, quando e próximo passo', () => {
    const h = renderToStaticMarkup(createElement(FaixaTrilha, { trilha }));
    expect(h).toContain('href="/trilha"');
    expect(h).toContain('fase 1 de 4');
    expect((h.match(/data-fase=/g) ?? []).length).toBe(4);
    expect(h).toContain('Sair das dívidas');
    expect(h).toContain('mar/27');
    expect(h).toContain('Manter a fatura paga inteira.');
  });
});

describe('cartão de fase', () => {
  it('reserva: barra e valores com "money"; status no texto', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { fase: trilha.fases[2], trilha, dividas: [], atrasos: [], gastoTravado: { fixos: 100, casa: 50, debitoTravado: 50 }, aplicacaoMensal: [] }));
    expect(h).toContain('Reserva de emergência');
    expect(h).toContain('money');
    expect(h).toContain('role="progressbar"');
  });
  it('dívidas: cada dívida com parcela, quantas faltam e até quando; sem fim conhecido', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, {
      fase: trilha.fases[0], trilha, gastoTravado: { fixos: 0, casa: 0, debitoTravado: 0 }, aplicacaoMensal: [],
      dividas: [{ nome: 'renegociação', banco: 'B1', valorParcela: 10, restantes: 3, fim: '2027-03' }, { nome: 'empréstimo', banco: 'B2', valorParcela: 5, restantes: null, fim: null }],
      atrasos: [{ mes: '2026-09', motivo: 'juros' }],
    }));
    expect(h).toContain('faltam 3');
    expect(h).toContain('até mar/27');
    expect(h).toContain('sem data de fim');
    expect(h).toContain('juros de atraso em set/26');
  });
  it('fazer sobrar: cada mês é link para o mês na Previsão', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { fase: trilha.fases[1], trilha, dividas: [], atrasos: [], gastoTravado: { fixos: 0, casa: 0, debitoTravado: 0 }, aplicacaoMensal: [] }));
    expect(h).toContain('href="/previsibilidade?mes=2026-09"');
  });
});
```

E em `test/lib/links.test.ts`: `expect(linkPara('trilha')).toBe('/trilha');` e `expect(temSeletorDeMes('/trilha')).toBe(false);`.

Run → FAIL (módulos inexistentes / tela desconhecida).

- [ ] **Step 2: links e nav** — `links.ts`: `'trilha'` no tipo `Tela`, `trilha: '/trilha'` em `CAMINHO`, e `temSeletorDeMes` passa a devolver `false` também para `'/trilha'`. `Nav.tsx`: importar `Flag` de `lucide-react` e, em `EXTRA`, logo no começo, `{ href: '/trilha', label: 'Trilha', short: 'Trilha', icon: Flag }`.

- [ ] **Step 3: `FaixaTrilha.tsx`**:

```tsx
import Link from 'next/link';
import { linkPara } from '@/lib/links';
import type { Trilha } from '@/lib/trilha';

const COR = { cumprida: 'bg-accent', atual: 'bg-warn', depois: 'bg-surface-3' } as const;

/** Topo da home (F3): em que fase o casal está, quando sai dela e o próximo passo. */
export function FaixaTrilha({ trilha }: { trilha: Trilha }) {
  const f = trilha.fases[trilha.atual - 1];
  return (
    <Link href={linkPara('trilha')} className="card mb-3 block hover:bg-surface-2/40">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{`Trilha do casal · fase ${trilha.atual} de 4`}</span><span>›</span>
      </div>
      <div className="my-2 flex gap-1">
        {trilha.fases.map((x) => <span key={x.n} data-fase={x.status} className={`h-1.5 flex-1 rounded ${COR[x.status]}`} />)}
      </div>
      <div className="text-sm">
        <b>{f.titulo}</b>{f.quando && <span className="text-muted"> — {f.quando}</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-muted">{f.proximoPasso}</div>
    </Link>
  );
}
```

> `proximoPasso` pode trazer valor em reais (fases 3 e 4): a frase inteira não leva `money` (tem texto); fica registrado como limitação conhecida, igual à frase da meta do F2a.

- [ ] **Step 4: `CartaoFase.tsx`**:

```tsx
import Link from 'next/link';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { DadosTrilha, Fase, Trilha } from '@/lib/trilha';

type Props = { fase: Fase; trilha: Trilha } & Pick<DadosTrilha, 'dividas' | 'atrasos' | 'gastoTravado' | 'aplicacaoMensal'>;
const ROTULO = { cumprida: '✓ cumprida', atual: 'agora', depois: 'depois' } as const;

export function CartaoFase({ fase, trilha, dividas, atrasos, gastoTravado, aplicacaoMensal }: Props) {
  return (
    <div className={`card mb-3 ${fase.status === 'atual' ? 'border-warn/60' : ''}`}>
      <div className="flex items-center justify-between">
        <b className="text-sm">{fase.n} · {fase.titulo}</b>
        <span className={`text-[11px] ${fase.status === 'cumprida' ? 'text-accent' : fase.status === 'atual' ? 'text-warn' : 'text-muted'}`}>{ROTULO[fase.status]}</span>
      </div>
      {fase.quando && <div className="mt-1 text-xs text-muted">Quando: {fase.quando}</div>}

      {fase.n === 1 && (
        <div className="mt-2 space-y-1 text-xs">
          {dividas.length === 0 && <div className="text-muted">Nenhuma dívida em aberto.</div>}
          {dividas.map((d) => (
            <div key={`${d.nome}|${d.banco}`} className="flex justify-between gap-3">
              <span className="min-w-0 truncate first-letter:uppercase">{d.nome} <span className="text-faint">· {d.banco}</span></span>
              <span className="shrink-0 text-muted"><span className="tnum money">{brl(d.valorParcela)}</span> · {d.restantes === null ? 'sem data de fim' : `faltam ${d.restantes} · até ${mesLabel(d.fim!)}`}</span>
            </div>
          ))}
          {atrasos.map((a) => (
            <div key={`${a.mes}|${a.motivo}`} className="text-despesa">{`${a.motivo === 'juros' ? 'juros de atraso' : 'conta negativa'} em ${mesLabel(a.mes)}`}</div>
          ))}
        </div>
      )}

      {fase.n === 2 && (
        <div className="mt-2 flex gap-3 text-xs">
          {trilha.sobra.meses.map((m) => (
            <Link key={m.mes} href={linkPara('previsao', { mes: m.mes }, '')} className={m.sobra >= 0 ? 'text-accent' : 'text-despesa'}>
              {mesLabel(m.mes)} {m.sobra >= 0 ? '✓' : '✗'} <span className="tnum money">{brl(m.sobra)}</span>
            </Link>
          ))}
        </div>
      )}

      {fase.n === 3 && (
        <div className="mt-2 text-xs">
          <div className="flex justify-between"><span className="tnum money">{brl(trilha.reserva.aplicado)}</span><span className="text-muted">meta <span className="tnum money">{brl(trilha.reserva.meta)}</span></span></div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, trilha.reserva.meta ? trilha.reserva.aplicado / trilha.reserva.meta : 1) * 100)} className="mt-1 h-1.5 overflow-hidden rounded bg-surface-3">
            <i className="block h-full bg-accent" style={{ width: `${Math.min(100, trilha.reserva.meta ? (trilha.reserva.aplicado / trilha.reserva.meta) * 100 : 100)}%` }} />
          </div>
          <div className="mt-1 text-faint">6 × gasto travado: fixos <span className="tnum money">{brl(gastoTravado.fixos)}</span> + casa <span className="tnum money">{brl(gastoTravado.casa)}</span> + contas travadas <span className="tnum money">{brl(gastoTravado.debitoTravado)}</span></div>
          {aplicacaoMensal.length > 0 && (
            <div className="mt-1 text-faint">aplicado por mês: {aplicacaoMensal.map((m, i) => <span key={m.mes}>{i ? ' · ' : ''}{mesLabel(m.mes)} <span className="tnum money">{brl(m.valor)}</span></span>)}</div>
          )}
        </div>
      )}

      {fase.n === 4 && (
        <div className="mt-2 text-xs text-muted">
          {Math.round(trilha.patrimonio.pct * 100)}% da renda aplicada (meta {Math.round(trilha.patrimonio.meta * 100)}%) · total aplicado <span className="tnum money">{brl(trilha.reserva.aplicado)}</span>
        </div>
      )}

      <div className="mt-2 text-xs">{fase.proximoPasso}</div>
    </div>
  );
}
```

- [ ] **Step 5: `src/app/trilha/page.tsx`**:

```tsx
import { getTrilhaDados } from '@/lib/queries';
import { avaliarTrilha } from '@/lib/trilha';
import { PageTitle } from '../components/ui';
import { CartaoFase } from '../components/CartaoFase';

export const dynamic = 'force-dynamic';

export default async function TrilhaPagina() {
  const d = await getTrilhaDados();
  const t = avaliarTrilha(d);
  return (
    <div>
      <PageTitle title="Trilha" subtitle="Sair das dívidas, fazer sobrar, montar a reserva e construir patrimônio — sempre do casal." />
      {t.fases.map((f) => (
        <CartaoFase key={f.n} fase={f} trilha={t} dividas={d.dividas} atrasos={d.atrasos} gastoTravado={d.gastoTravado} aplicacaoMensal={d.aplicacaoMensal} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: home** — em `src/app/page.tsx`: importar `getTrilhaDados` (de `@/lib/queries`), `avaliarTrilha` (de `@/lib/trilha`) e `FaixaTrilha`; acrescentar `getTrilhaDados(hoje).catch(() => null)` ao `Promise.all` (a home não cai se a trilha falhar) e, antes do `<LinhaDoMes …/>`, `{trilhaDados && <FaixaTrilha trilha={avaliarTrilha(trilhaDados)} />}`.

> Texto que o teste procura inteiro vai numa template string: o `renderToStaticMarkup` põe `<!-- -->` entre pedaços de texto do JSX.

- [ ] **Step 7: verificar** — `npx tsc --noEmit -p . && npx vitest run && npm run build` → ok; testes do Step 1 → PASS.
- [ ] **Step 8: prévia local** (cópia dos dados só na máquina): celular e computador — faixa no topo da home (casal e pessoa), toque abre `/trilha`, quatro cartões, links dos meses, "Trilha" no Mais, seletor de mês escondido em `/trilha`; conferir à mão as dívidas listadas contra os lançamentos.
- [ ] **Step 9: commit** — `feat(trilha): faixa na home e tela da trilha (F3)`.

---

### Task 5: Verificação final e deploy

- [ ] suíte completa com integração, `tsc`, `build`; varredura de valores/pessoal no diff e nas mensagens; revisão final independente; deploy (`/root/finance-dash.bak-pre-f3`); home e `/trilha` em 200; tempo da 1ª chamada da home medido antes × depois; push e PR com base `feat/f2b-conciliacao`.
