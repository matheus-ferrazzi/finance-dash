# E3 — Gasto em dinheiro vivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "bot gastei 50 em dinheiro na feira" vira proposta → "sim" → gasto em `financas_gastos_dinheiro`, visto na tela Gastos, no semanal e nas respostas de gasto do bot, sempre separado ("💵"), sem tocar em nenhuma conta do saldo do banco.

**Architecture:** Tabela própria que só as visões de "gasto por categoria" leem, via funções novas somadas de propósito (`getDinheiroPorCategoriaEntre`, `getGastosDinheiro`). Lançar reaproveita a mecânica do E2 (proposta tipo `dinheiro` → executar/desfazer no painel). As funções do banco (`getDespesas`, `getGastoPorCategoriaEntre`, previsão, ritmo, trilha) não mudam.

**Tech Stack:** Next.js 14, TypeScript, `pg`, Vitest 3, worker esbuild/Node 20.

**Spec:** `docs/superpowers/specs/2026-10-12-e3-gasto-dinheiro-design.md`

## Global Constraints

- Branch `feat/e3-dinheiro` (base `feat/e2-bot-acoes`, PR #18).
- Dinheiro entra só em: tela Gastos, semanal, bot `gasto_periodo`/`comparar`/`maiores_gastos` — sempre separado ("💵", "dos quais R$ X em dinheiro"). Nunca em ritmo, previsão, simulador, trilha, mensal, diário, home, orçamento, casa, contas.
- `getDespesas` e `getGastoPorCategoriaEntre` não mudam.
- Limites: valor 0,01–10.000; descrição 1–80; data = hoje (SP) por padrão, até 30 dias atrás, nunca futura; pessoa Matheus/Ariane (padrão quem pediu); categoria ∈ `CATEGORIAS_PAINEL`.
- Mecânica do E2: proposta → "sim/confirma/confirmo" de quem pediu em ≤ 5 min → executar no painel; `bot desfaz` ≤ 24 h. O modelo nunca grava.
- `pluggy_worker` sem permissão em `financas_gastos_dinheiro`; `dash_writer` SELECT/INSERT/DELETE; `bot_readonly` SELECT.
- Arquivos LF; editar com as ferramentas de edição. Testes de integração um arquivo por vez, banco recriado. Commits `git commit -F` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gasto em dinheiro lançado** → previsão, ritmo, "dá pra gastar" e trilha dão exatamente o mesmo número que sem ele. (Task 1)
2. **Tocar num gasto em dinheiro na tela Gastos** → não abre "Mudar categoria" do banco (id inexistente); mostra 💵 e "apagar". (Task 3)
3. **Data "ontem" pedida às 23h50 de SP** (UTC já é amanhã) → vale a data de SP; data futura ou > 30 dias recusada. (Task 4)
4. **Visão de uma pessoa** (Ariane) → só os gastos em dinheiro dela; casal → os dois. (Task 1, Task 2)
5. **Desfazer depois de apagar pela tela** → "já não existe", sem marcar desfeita. (Task 2)

---

### Task 1: Tabela e consultas do dinheiro

**Files:**
- Create: `db/migrations/011_gastos_dinheiro.sql`, `src/lib/dinheiro.ts`
- Test: `test/integracao/dinheiro.test.ts`

**Interfaces:**
- Produces (em `src/lib/dinheiro.ts`, usando `q`/`qw` de `./db`): `getDinheiroPorCategoriaEntre(inicio: string, fimExcl: string, resp: Resp = 'casal'): Promise<Map<string, number>>`; `getGastosDinheiro(resp: Resp, inicio: string, fimExcl: string): Promise<{ id: number; data: string; valor: number; descricao: string; categoria: string; pessoa: string }[]>` (data `AAAA-MM-DD`, mais recentes primeiro); `inserirDinheiro(g: { data: string; valor: number; descricao: string; categoria: string; responsavel: 'Matheus' | 'Ariane' }): Promise<number>`; `apagarDinheiro(id: number): Promise<boolean>`; `somarMapas(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Map<string, number>`.

- [ ] **Step 1: Teste** — `test/integracao/dinheiro.test.ts` com o `beforeAll` de `test/integracao/previsao.test.ts` (que já monta o que a previsão precisa), acrescido de `db/migrations/011_gastos_dinheiro.sql` e do import dinâmico `dinheiro = await import('../../src/lib/dinheiro')`:

```ts
  it('insere, lista e soma por categoria, pessoa e período; apagar devolve se existia', async () => {
    const a = await dinheiro.inserirDinheiro({ data: '2047-01-03', valor: 50, descricao: 'feira', categoria: 'Groceries', responsavel: 'Ariane' });
    await dinheiro.inserirDinheiro({ data: '2047-01-04', valor: 20, descricao: 'pastel', categoria: 'Eating out', responsavel: 'Matheus' });
    await dinheiro.inserirDinheiro({ data: '2047-02-01', valor: 99, descricao: 'fora do período', categoria: 'Groceries', responsavel: 'Matheus' });
    expect(Object.fromEntries(await dinheiro.getDinheiroPorCategoriaEntre('2047-01-01', '2047-02-01'))).toEqual({ Groceries: 50, 'Eating out': 20 });
    expect(Object.fromEntries(await dinheiro.getDinheiroPorCategoriaEntre('2047-01-01', '2047-02-01', 'Ariane'))).toEqual({ Groceries: 50 });
    expect((await dinheiro.getGastosDinheiro('casal', '2047-01-01', '2047-02-01')).map((g: any) => [g.data, g.valor, g.descricao, g.pessoa]))
      .toEqual([['2047-01-04', 20, 'pastel', 'Matheus'], ['2047-01-03', 50, 'feira', 'Ariane']]);
    expect(await dinheiro.apagarDinheiro(a)).toBe(true);
    expect(await dinheiro.apagarDinheiro(a)).toBe(false);
  });

  it('o banco não enxerga o dinheiro: gasto por categoria e previsão iguais com e sem', async () => {
    const queries = await import('../../src/lib/queries');
    const hoje = (await import('../../src/lib/format')).currentDateSP();
    const ini = `${hoje.slice(0, 7)}-01`;
    const antesCat = Object.fromEntries(await queries.getGastoPorCategoriaEntre(ini, '2999-01-01'));
    const antesPrev = await queries.getPrevisaoResumo('casal');
    await dinheiro.inserirDinheiro({ data: hoje, valor: 777, descricao: 'teste', categoria: 'Groceries', responsavel: 'Matheus' });
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre(ini, '2999-01-01'))).toEqual(antesCat);
    const depoisPrev = await queries.getPrevisaoResumo('casal');
    expect([depoisPrev.fechaCom, depoisPrev.ritmoAtualDia, depoisPrev.ritmoSeguroDia]).toEqual([antesPrev.fechaCom, antesPrev.ritmoAtualDia, antesPrev.ritmoSeguroDia]);
  });

  it('somarMapas', () => {
    expect(Object.fromEntries(dinheiro.somarMapas(new Map([['A', 1], ['B', 2]]), new Map([['B', 3], ['C', 4]])))).toEqual({ A: 1, B: 5, C: 4 });
  });
```

(Se o `beforeAll` do teste de previsão inserir dados que fazem `getPrevisaoResumo` cair na memória de cache entre as duas chamadas, o teste ainda vale: o que se compara é igualdade; se o cache esconder uma mudança, trocar por `computeRitmo(await getProjecaoBase('casal'), ...)` direto — ledger.)

- [ ] **Step 2: Rodar e ver falhar** — FAIL (módulo/tabela).

- [ ] **Step 3: Migração** — `db/migrations/011_gastos_dinheiro.sql`:

```sql
-- E3: gasto em dinheiro vivo (não passa pelo banco). Só as visões de gasto por categoria leem esta tabela;
-- previsão, ritmo e trilha (saldo do banco) não. Também libera o tipo 'dinheiro' nas propostas do bot.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_gastos_dinheiro (
  id          bigserial PRIMARY KEY,
  data        date NOT NULL,
  valor       numeric(12,2) NOT NULL CHECK (valor > 0 AND valor <= 10000),
  descricao   text NOT NULL CHECK (length(descricao) BETWEEN 1 AND 80),
  categoria   text NOT NULL,
  responsavel text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  origem      text NOT NULL DEFAULT 'bot',
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financas_gastos_dinheiro_data_idx ON financas_gastos_dinheiro (data);
ALTER TABLE financas_bot_acoes DROP CONSTRAINT IF EXISTS financas_bot_acoes_tipo_check;
ALTER TABLE financas_bot_acoes ADD CONSTRAINT financas_bot_acoes_tipo_check CHECK (tipo IN ('categoria', 'avulsa', 'dinheiro'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, DELETE ON financas_gastos_dinheiro TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_gastos_dinheiro_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_gastos_dinheiro TO bot_readonly;
  END IF;
END $$;
COMMIT;
```

(Conferir o nome real do CHECK de `tipo` criado pela 010 com `\d financas_bot_acoes` no Postgres de teste; o padrão do Postgres é `financas_bot_acoes_tipo_check`.)

- [ ] **Step 4: `src/lib/dinheiro.ts`**:

```ts
// E3: gasto em dinheiro vivo. Só as visões de gasto por categoria somam isto (de propósito);
// as contas do saldo do banco (previsão, ritmo, trilha) não leem esta tabela.
import { q, qw } from './db';
import type { Resp } from './queries';

const r2 = (x: number) => Math.round(x * 100) / 100;
const filtroPessoa = (resp: Resp, idx: number) => (resp === 'casal' ? { sql: '', p: [] as string[] } : { sql: ` AND responsavel = $${idx}`, p: [resp] });

export async function getDinheiroPorCategoriaEntre(inicio: string, fimExcl: string, resp: Resp = 'casal'): Promise<Map<string, number>> {
  const f = filtroPessoa(resp, 3);
  const rows = await q<any>(
    `SELECT categoria, SUM(valor)::float8 AS v FROM financas_gastos_dinheiro
     WHERE data >= $1::date AND data < $2::date${f.sql} GROUP BY 1`, [inicio, fimExcl, ...f.p]);
  return new Map(rows.map((x) => [x.categoria as string, r2(Number(x.v))]));
}

export async function getGastosDinheiro(resp: Resp, inicio: string, fimExcl: string) {
  const f = filtroPessoa(resp, 3);
  const rows = await q<any>(
    `SELECT id, to_char(data,'YYYY-MM-DD') AS data, valor::float8 AS valor, descricao, categoria, responsavel AS pessoa
     FROM financas_gastos_dinheiro WHERE data >= $1::date AND data < $2::date${f.sql} ORDER BY data DESC, id DESC`, [inicio, fimExcl, ...f.p]);
  return rows.map((x) => ({ id: Number(x.id), data: x.data, valor: r2(Number(x.valor)), descricao: x.descricao, categoria: x.categoria, pessoa: x.pessoa }));
}

export async function inserirDinheiro(g: { data: string; valor: number; descricao: string; categoria: string; responsavel: 'Matheus' | 'Ariane' }): Promise<number> {
  const rows = await qw<any>(
    `INSERT INTO financas_gastos_dinheiro (data, valor, descricao, categoria, responsavel) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [g.data, g.valor, g.descricao, g.categoria, g.responsavel]);
  return Number(rows[0].id);
}

export async function apagarDinheiro(id: number): Promise<boolean> {
  return (await qw<any>(`DELETE FROM financas_gastos_dinheiro WHERE id = $1 RETURNING id`, [id])).length > 0;
}

export function somarMapas(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Map<string, number> {
  const m = new Map(a);
  for (const [k, v] of b) m.set(k, r2((m.get(k) ?? 0) + v));
  return m;
}
```

(`q` e `qw` vêm de `src/lib/db.ts` — conferido.)

- [ ] **Step 5: Rodar e ver passar; commit** — `feat(dinheiro): tabela e consultas do gasto em dinheiro vivo (E3)`.

---

### Task 2: Painel — executar/desfazer, apagar, rotas do bot e semanal

**Files:**
- Modify: `src/lib/botAcoes.ts` (tipo `dinheiro`), `src/lib/bot.ts` (`montarGasto` e `montarComparar` com dinheiro), `src/app/api/bot/gasto/route.ts`, `src/app/api/bot/comparar/route.ts`, `src/app/api/bot/maiores/route.ts`, `src/app/api/resumo/semanal/route.ts`
- Create: `src/app/api/dinheiro/[id]/route.ts`
- Test: `test/lib/bot.test.ts`, `test/integracao/bot-acoes-painel.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `montarGasto(porCat, grupo, dinheiro?: ReadonlyMap<string, number>)` → `{ total, totalDinheiro, itens: { nome, valor, dinheiro }[] }` (valor inclui o dinheiro); `montarComparar(a, b, dinA?, dinB?)` → campos de antes + `totalDinheiroA`, `totalDinheiroB` (totais e grupos incluem o dinheiro); JSON semanal `+ totalDinheiro`; `DELETE /api/dinheiro/[id]` → `{ ok: true }` ou 404.

- [ ] **Step 1: Testes unitários** — em `test/lib/bot.test.ts` acrescentar:

```ts
describe('dinheiro nos montadores (E3)', () => {
  it('montarGasto soma o dinheiro e diz quanto foi em dinheiro por item e no total', () => {
    const r = montarGasto(m({ Groceries: 300 }), null, m({ Groceries: 50, 'Eating out': 20 }));
    expect(r).toEqual({ total: 370, totalDinheiro: 70, itens: [{ nome: 'Mercado', valor: 350, dinheiro: 50 }, { nome: 'Comer fora', valor: 20, dinheiro: 20 }] });
  });
  it('sem dinheiro: dinheiro 0 (formato estável)', () => {
    expect(montarGasto(m({ Groceries: 10 }), null)).toEqual({ total: 10, totalDinheiro: 0, itens: [{ nome: 'Mercado', valor: 10, dinheiro: 0 }] });
  });
  it('montarComparar inclui o dinheiro dos dois lados', () => {
    const r = montarComparar(m({ Groceries: 100 }), m({ Groceries: 100 }), m({ Groceries: 50 }), m({}));
    expect([r.totalA, r.totalB, r.totalDinheiroA, r.totalDinheiroB, r.diferenca]).toEqual([150, 100, 50, 0, 50]);
  });
});
```

e ajustar os testes existentes de `montarGasto` (os `toEqual` passam a ter `totalDinheiro: 0` e `dinheiro: 0` em cada item).

- [ ] **Step 2: Rodar e ver falhar; implementar em `src/lib/bot.ts`**:

```ts
import { somarMapas } from './dinheiro';
// ...
export function montarGasto(porCat: ReadonlyMap<string, number>, grupo: string | null, dinheiro: ReadonlyMap<string, number> = new Map()) {
  const tudo = somarMapas(porCat, dinheiro);
  const din = (nomes: (cat: string) => string) => {
    const out = new Map<string, number>();
    for (const [cat, v] of dinheiro) out.set(nomes(cat), r2((out.get(nomes(cat)) ?? 0) + v));
    return out;
  };
  if (grupo === null) {
    const porGrupo = din((cat) => grupoDaCategoria(cat)?.nome ?? 'Resto');
    const itens = agruparGastos(tudo, 0).map((g) => ({ nome: g.nome, valor: r2(g.total), dinheiro: porGrupo.get(g.nome) ?? 0 }))
      .filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
    return { total: soma(tudo), totalDinheiro: soma(dinheiro), itens };
  }
  const itens = Array.from(tudo.entries())
    .filter(([cat]) => (grupoDaCategoria(cat)?.nome ?? 'Resto') === grupo)
    .map(([nome, valor]) => ({ nome, valor: r2(valor), dinheiro: dinheiro.get(nome) ?? 0 }))
    .filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  return { total: r2(itens.reduce((s, i) => s + i.valor, 0)), totalDinheiro: r2(itens.reduce((s, i) => s + i.dinheiro, 0)), itens };
}

export function montarComparar(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>,
  dinA: ReadonlyMap<string, number> = new Map(), dinB: ReadonlyMap<string, number> = new Map()) {
  const ta = somarMapas(a, dinA), tb = somarMapas(b, dinB);
  // (corpo atual de montarComparar usando ta e tb no lugar de a e b)
  // ...
  return { totalA, totalB, diferenca, pct, grupos, totalDinheiroA: soma(dinA), totalDinheiroB: soma(dinB) };
}
```

(O corpo de `montarComparar` é o atual, trocando `a`/`b` por `ta`/`tb`; os testes antigos continuam passando porque os mapas de dinheiro vazios não mudam nada.) Rodar `npx vitest run test/lib/bot.test.ts` → PASS.

- [ ] **Step 3: Rotas** — `gasto/route.ts`: `const [cat, din] = await Promise.all([getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa), getDinheiroPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa)]);` e `montarGasto(cat, grupo, din)`. `comparar/route.ts`: os quatro mapas (`a`, `b`, `dinA`, `dinB`) e `montarComparar(a, b, dinA, dinB)`. `maiores/route.ts`:

```ts
  const [banco, din] = await Promise.all([
    getMaioresGastos(pessoa, periodo.inicio, periodo.fimExcl, grupo),
    getGastosDinheiro(pessoa, periodo.inicio, periodo.fimExcl),
  ]);
  const itens = [
    ...banco.map(({ categoria: _c, ...x }) => x),
    ...din.filter((g) => grupo === null || (grupoDaCategoria(g.categoria)?.nome ?? 'Resto') === grupo)
      .map((g) => ({ data: `${g.data.slice(8, 10)}/${g.data.slice(5, 7)}`, valor: g.valor, descricao: `💵 ${g.descricao}`, pessoa: g.pessoa })),
  ].sort((x, y) => y.valor - x.valor).slice(0, 10);
```

`resumo/semanal/route.ts`: buscar também `getDinheiroPorCategoriaEntre` da semana e das 4 anteriores; usar `somarMapas` antes de `agruparGastos`/`gruposDaSemana`/`soma`; acrescentar `totalDinheiro: soma(dinSemana)` ao JSON.

`src/app/api/dinheiro/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { apagarDinheiro } from '@/lib/dinheiro';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  return (await apagarDinheiro(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: 'não existe' }, { status: 404 });
}
```

- [ ] **Step 4: `botAcoes.ts` com `dinheiro`** — teste em `test/integracao/bot-acoes-painel.test.ts` (aplicar também `011_gastos_dinheiro.sql` no `beforeAll`):

```ts
  it('dinheiro: executa (insere), desfaz (apaga); já apagado pela tela: recusa', async () => {
    const id = await acao('dinheiro', { data: '2047-03-02', valor: 50, descricao: 'feira', categoria: 'Groceries', responsavel: 'Ariane' });
    expect(await executarAcao(id)).toMatchObject({ ok: true, resumo: expect.stringContaining('💵 feira') });
    expect((await pool.query(`SELECT count(*)::int n FROM financas_gastos_dinheiro WHERE descricao='feira'`)).rows[0].n).toBe(1);
    expect(await desfazerAcao(id, 'Matheus')).toEqual({ ok: true });
    expect((await pool.query(`SELECT count(*)::int n FROM financas_gastos_dinheiro WHERE descricao='feira'`)).rows[0].n).toBe(0);
    const id2 = await acao('dinheiro', { data: '2047-03-02', valor: 5, descricao: 'pastel', categoria: 'Eating out', responsavel: 'Matheus' });
    await executarAcao(id2);
    await pool.query(`DELETE FROM financas_gastos_dinheiro WHERE descricao='pastel'`);
    expect(await desfazerAcao(id2, 'Matheus')).toMatchObject({ ok: false });
  });
```

Implementar em `executarAcao`, antes do ramo da avulsa:

```ts
    if (a.tipo === 'dinheiro') {
      const p = a.params;
      const dinheiroId = await inserirDinheiro({ data: p.data, valor: p.valor, descricao: p.descricao, categoria: p.categoria, responsavel: p.responsavel });
      await marcar(id, 'feita', { dinheiroId });
      return { ok: true, resumo: `💵 ${p.descricao} ${brl(p.valor)} em ${traduzCategoria(p.categoria)}` };
    }
```

e em `desfazerAcao`, ramo `dinheiro`: `if (!(await apagarDinheiro(a.resultado.dinheiroId))) return { ok: false, erro: 'esse gasto em dinheiro já não existe' };` (antes do `UPDATE ... 'desfeita'`). Imports de `./dinheiro`.

- [ ] **Step 5: Rodar** — `npx vitest run test/lib`, integração `bot-acoes-painel.test.ts`, `dinheiro.test.ts`, `bot.test.ts`, `resumos.test.ts`; `npx tsc --noEmit`; `npm run build` → ok. Commit `feat(dinheiro): bot e semanal somam o dinheiro; executar e desfazer (E3)`.

---

### Task 3: Tela Gastos com 💵

**Files:**
- Create: `src/lib/dinheiroTela.ts`, `src/app/components/LinhaDinheiro.tsx`
- Modify: `src/app/gastos/page.tsx`, `src/app/components/CategoryAccordion.tsx`
- Test: `test/lib/dinheiroTela.test.ts`, `test/lib/componentesDinheiro.test.tsx`

**Interfaces:**
- Consumes: `getGastosDinheiro` (Task 1).
- Produces: `paraLancamentos(gs: { id: number; data: string; valor: number; descricao: string; categoria: string; pessoa: string }[]): { id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string; dinheiroId: number }[]` (id `din-<id>`, banco `💵 Dinheiro`); `CatGroup.items[].dinheiroId?: number`; componente `LinhaDinheiro({ it })`.

- [ ] **Step 1: Testes** — `test/lib/dinheiroTela.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { paraLancamentos } from '../../src/lib/dinheiroTela';

describe('paraLancamentos', () => {
  it('vira linha da lista de gastos com id próprio e banco 💵 Dinheiro', () => {
    expect(paraLancamentos([{ id: 7, data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', pessoa: 'Ariane' }]))
      .toEqual([{ id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', banco: '💵 Dinheiro', responsavel: 'Ariane', dinheiroId: 7 }]);
  });
});
```

`test/lib/componentesDinheiro.test.tsx` (padrão dos testes de componente: `renderToStaticMarkup`):

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CategoryAccordion } from '../../src/app/components/CategoryAccordion';

describe('lançamento em dinheiro no acordeão', () => {
  it('mostra 💵 e "apagar", sem o botão de mudar categoria do banco', () => {
    // o acordeão começa fechado: o teste renderiza a linha diretamente
    const { LinhaDinheiro } = require('../../src/app/components/LinhaDinheiro');
    const html = renderToStaticMarkup(<LinhaDinheiro it={{ id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', banco: '💵 Dinheiro', responsavel: 'Ariane', dinheiroId: 7 }} />);
    expect(html).toContain('💵 Dinheiro');
    expect(html).toContain('apagar');
    expect(html).not.toContain('Mudar categoria');
    expect(renderToStaticMarkup(<CategoryAccordion grupos={[]} />)).toBeDefined();
  });
});
```

(Usar `import` estático de `LinhaDinheiro` em vez de `require` se o arquivo de teste já for ESM — o padrão dos outros testes de componente do repo manda.)

- [ ] **Step 2: Rodar e ver falhar; implementar** — `src/lib/dinheiroTela.ts`:

```ts
// E3: gasto em dinheiro como linha da tela Gastos (id próprio: não é lançamento do banco).
export function paraLancamentos(gs: { id: number; data: string; valor: number; descricao: string; categoria: string; pessoa: string }[]) {
  return gs.map((g) => ({ id: `din-${g.id}`, data: g.data, valor: g.valor, descricao: g.descricao, categoria: g.categoria, banco: '💵 Dinheiro', responsavel: g.pessoa, dinheiroId: g.id }));
}
```

`src/app/components/LinhaDinheiro.tsx` (`'use client'`): mesma marcação visual da linha do acordeão (descrição, `dataBR(data) · banco`, badge da pessoa, valor) e, à direita, um botão `apagar` que pede `window.confirm('Apagar este gasto em dinheiro?')`, chama `fetch('/api/dinheiro/' + it.dinheiroId, { method: 'DELETE' })` e faz `window.location.reload()` (o mesmo padrão de `ListaRegras`). Importar `brl`/`dataBR` de `@/lib/format` e `respBadge` de `./ui` (os mesmos do `CategoryAccordion`).

`CategoryAccordion.tsx`: `CatGroup.items[]` ganha `dinheiroId?: number`; no `map`, `it.dinheiroId ? <LinhaDinheiro key={it.id} it={it} /> : <BotaoCorrigir ...>` (o resto igual).

`gastos/page.tsx`: buscar `getGastosDinheiro(resp, per.start, per.endExcl)` junto com `getDespesas`; `const todas = [...banco, ...paraLancamentos(din)]` antes do filtro; o `items.push` leva `dinheiroId: (d as any).dinheiroId`; acima do `StatStrip`, quando `totalDinheiro > 0`: `<p className="mb-2 text-xs text-muted">Inclui {brl(totalDinheiro)} em dinheiro vivo 💵</p>` (`totalDinheiro` = soma das linhas de dinheiro que passaram pelo filtro).

- [ ] **Step 3: Rodar e ver passar; `npm run build`; commit** — `feat(gastos): gastos em dinheiro na tela Gastos com apagar (E3)`.

---

### Task 4: Worker — propor gasto em dinheiro, textos e trava

**Files:**
- Modify: `src/worker/bot/locais.ts`, `src/worker/bot/acoesTextos.ts`, `src/worker/bot/ferramentas.ts` (schema + formatadores com 💵), `src/worker/bot/acoes.ts` (tipo), `src/worker/bot/trava.ts` (campos), `src/worker/notificacoes/textosD.ts` (semanal)
- Test: `test/worker/bot-locais.test.ts`, `test/worker/bot-acoes-textos.test.ts`, `test/worker/bot-formatadores.test.ts`, `test/worker/bot-trava.test.ts`, `test/worker/notificacoes-textosD.test.ts`

**Interfaces:**
- Produces: ferramenta `propor_gasto_dinheiro(valor, descricao, categoria, data?, pessoa?)`; `textoPropostaDinheiro(d: { valor: number; descricao: string; categoria: string; data: string; pessoa: string }): string`; `PgAcoes.criar` aceita `'dinheiro'`; `ResumoSemanal.totalDinheiro?: number`.

- [ ] **Step 1: Testes** —

`test/worker/bot-locais.test.ts`:
```ts
describe('gasto em dinheiro (E3)', () => {
  it('valida e cria a proposta; padrão hoje e quem pediu; recusa futuro, > 30 dias, valor e descrição fora', async () => {
    const m = montar();
    const r = await m.locais.propor_gasto_dinheiro({ valor: 50, descricao: 'feira', categoria: 'Groceries' });
    expect(m.criadas[0]).toEqual(['Matheus', 'dinheiro', { data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', responsavel: 'Matheus' }, expect.stringContaining('feira')]);
    expect(r.dados.proposta).toBe('🟡 Lançar 💵 *R$ 50,00* em *Mercado* (feira, 12/10, Matheus)?\n👉 Responde *sim* ou *não*.');
    for (const a of [{ data: '2026-10-13' }, { data: '2026-09-11' }, { valor: 0 }, { valor: 10000.01 }, { descricao: '' }, { descricao: 'x'.repeat(81) }, { categoria: 'Inventada' }]) {
      expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'ok', categoria: 'Groceries', ...a })).toMatchObject({ ok: false });
    }
    expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'ok', categoria: 'Groceries', data: '2026-09-12', pessoa: 'Ariane' })).toMatchObject({ ok: true });
  });
});
```

`test/worker/bot-formatadores.test.ts`:
```ts
describe('💵 nas respostas de gasto (E3)', () => {
  it('gasto_periodo mostra quanto foi em dinheiro', () => {
    const t = formatar('gasto_periodo', { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 370, totalDinheiro: 70, itens: [{ nome: 'Mercado', valor: 350, dinheiro: 50 }, { nome: 'Lazer', valor: 20, dinheiro: 0 }], link: '/gastos' }, 'https://p');
    expect(t).toContain(`💰 Gasto em out/26 (casal): *${brl(370)}* (💵 ${brl(70)})`);
    expect(t).toContain(`• Mercado: ${brl(350)} (💵 ${brl(50)})`);
    expect(t).toContain(`• Lazer: ${brl(20)}\n`);
  });
  it('schema tem propor_gasto_dinheiro com categoria em enum', () => {
    const t: any = TOOLS.find((x: any) => x.function.name === 'propor_gasto_dinheiro');
    expect(t.function.parameters.properties.categoria.enum).toContain('Groceries');
    expect(t.function.parameters.required).toEqual(['valor', 'descricao', 'categoria']);
  });
});
```

`test/worker/bot-trava.test.ts`:
```ts
  it('campos de dinheiro do E3 valem como R$', () => {
    expect(respostaConfere('💵 R$ 70,00 em dinheiro', [{ totalDinheiro: 70 }])).toBe(true);
    expect(respostaConfere('💵 R$ 50,00', [{ itens: [{ dinheiro: 50 }] }])).toBe(true);
  });
```

`test/worker/notificacoes-textosD.test.ts` (no `describe('semanal')`):
```ts
  it('dinheiro na semana: linha 💵 logo depois do total', () => {
    const t = montarSemanal({ ...sem, totalDinheiro: 70 }, { gastos: 'G', trilha: 'T' });
    expect(t.split('\n')[2]).toBe(`💵 ${brl(70)} em dinheiro vivo`);
    expect(montarSemanal(sem, { gastos: 'G', trilha: 'T' })).not.toContain('dinheiro vivo');
  });
```

- [ ] **Step 2: Rodar e ver falhar; implementar**:
  - `acoesTextos.ts`:
    ```ts
    export function textoPropostaDinheiro(d: { valor: number; descricao: string; categoria: string; data: string; pessoa: string }): string {
      return `🟡 Lançar 💵 *${brl(d.valor)}* em *${d.categoria}* (${d.descricao}, ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}, ${d.pessoa})?\n👉 Responde *sim* ou *não*.`;
    }
    ```
  - `locais.ts` (import `CATEGORIAS_PAINEL` de `../../lib/format`, `textoPropostaDinheiro`):
    ```ts
    async propor_gasto_dinheiro(a) {
      const valor = Math.round(Number(a.valor) * 100) / 100;
      const descricao = String(a.descricao ?? '').trim();
      const data = String(a.data ?? d.hoje);
      const pessoa = !a.pessoa || a.pessoa === 'eu' ? d.pessoa : String(a.pessoa);
      const min = somaDias(d.hoje, -30);
      if (!(valor >= 0.01 && valor <= 10000)) return { ok: false, dados: { erro: 'valor entre 0,01 e 10.000' } };
      if (!descricao || descricao.length > 80) return { ok: false, dados: { erro: 'descrição de 1 a 80 letras' } };
      if (!CATEGORIAS_PAINEL.includes(a.categoria)) return { ok: false, dados: { erro: 'categoria da lista' } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > d.hoje || data < min) return { ok: false, dados: { erro: 'data de hoje até 30 dias atrás (AAAA-MM-DD)' } };
      if (pessoa !== 'Matheus' && pessoa !== 'Ariane') return { ok: false, dados: { erro: 'pessoa: Matheus ou Ariane' } };
      const categoria = traduzCategoria(a.categoria);
      await d.acoes.criar(d.pessoa, 'dinheiro', { data, valor, descricao, categoria: a.categoria, responsavel: pessoa }, `💵 ${descricao} ${brl(valor)}`);
      return { ok: true, dados: { proposta: textoPropostaDinheiro({ valor, descricao, categoria, data, pessoa }) } };
    },
    ```
    com `const somaDias = (dt: string, n: number) => new Date(Date.parse(`${dt}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);` (o `d.hoje` já é a data de SP — Review Focus 3).
  - `ferramentas.ts`: no `TOOLS`, `fn('propor_gasto_dinheiro', 'Propõe lançar um gasto pago em dinheiro vivo (NÃO grava: o casal confirma). Não entra no saldo do banco.', { valor: { type: 'number' }, descricao: { type: 'string' }, categoria: { type: 'string', enum: CATEGORIAS_PAINEL }, data: { type: 'string', description: 'AAAA-MM-DD; padrão hoje' }, pessoa: { type: 'string', enum: ['Matheus', 'Ariane', 'eu'] } }, ['valor', 'descricao', 'categoria'])`; `LOCAIS` ganha `'propor_gasto_dinheiro'`; no `formatar('gasto_periodo')`: cabeçalho `... *${brl(d.total)}*${d.totalDinheiro > 0 ? ` (💵 ${brl(d.totalDinheiro)})` : ''}` e cada item `• ${i.nome}: ${brl(i.valor)}${i.dinheiro > 0 ? ` (💵 ${brl(i.dinheiro)})` : ''}`; no `comparar`, a linha do total acrescenta `💵` dos lados que têm dinheiro.
  - `acoes.ts`: `tipo: 'categoria' | 'avulsa' | 'dinheiro'`.
  - `trava.ts`: `DINHEIRO` ganha `'dinheiro', 'totalDinheiro', 'totalDinheiroA', 'totalDinheiroB'`.
  - `textosD.ts`: `ResumoSemanal.totalDinheiro?: number`; em `montarSemanal`, logo depois da linha do total: `if ((r.totalDinheiro ?? 0) > 0) l.push(`💵 ${brl(r.totalDinheiro!)} em dinheiro vivo`);`.
  - O prompt do sistema (`agente.ts`): "Gasto pago em dinheiro vivo: propor_gasto_dinheiro."
- [ ] **Step 3: Rodar** — `npx vitest run test/worker`, `npx tsc --noEmit`, `npm run build:worker` → ok; commit `feat(bot): propor gasto em dinheiro e 💵 nas respostas (E3)`.

---

### Task 5: Produção

- [ ] Suíte com integração, `tsc`, `build`, `build:worker`; varredura; revisão final (opus) com a Review Focus.
- [ ] Antes do SSH: conferir `is_synced` do firewall pelo MCP da Hostinger (lição do E2).
- [ ] Migração 011 (conferir o CHECK de `tipo` com `dinheiro` e os grants); deploy do painel (`bak-pre-e3`) e do worker (`pre-e3`) fora das janelas 16h–16h40/22h–22h40 SP e dos :09.
- [ ] Janela de teste (webhook ligado): `bot gastei 1 real em dinheiro num chiclete` → `sim` → ver na tela Gastos (💵) e em `bot quanto gastei esse mês?`; conferir `/api/bot/situacao` e `/api/previsao` iguais a antes; `bot desfaz`; uma proposta com data futura (deve recusar). Webhook desligado no fim.
- [ ] Push, PR com base `feat/e2-bot-acoes` (#18); roadmap (linha do E3).
