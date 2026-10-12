# F4b — Ajustes da trilha: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar "não é dívida" / "é dívida" e ajustar as metas da reserva (meses) e do patrimônio (%) pelo painel, com desfazer na tela Regras.

**Architecture:** Regras puras em `src/lib/trilha.ts` (`chaveDivida`, marcas em `agruparDividas`, metas em `avaliarTrilha`, `validarMeta`); migração 007 com duas tabelas; `queries.ts` lê e grava; rotas em `/api/trilha/*`; botões clientes pequenos dentro dos cartões (servidor) da `/trilha`, na folha do F4 e na tela Regras.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, `pg`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-11-f4b-trilha-ajustes-design.md`

## Global Constraints

- Nenhuma dependência nova; repositório público (nenhum dado real em código, teste ou commit).
- Metas: `meses_reserva` inteiro 1–24 (padrão 6); `meta_patrimonio` 1–50 em % na tela, gravado como fração (padrão 0,10).
- Chave de dívida = `nomeDivida(descricao) + '|' + banco` (a mesma do agrupamento; sem documento).
- Marcar um tipo apaga a marcação do tipo oposto para a mesma chave.
- Escrita pelo `writerPool`; testes de integração com `TEST_DATABASE_URL`.
- Commits via `git commit -F` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **"Não é dívida" num grupo que também tem atraso (juros)** → a dívida sai, mas o atraso continua contando (marcação é sobre dívida, não sobre juros). (Task 1)
2. **Meta digitada com vírgula ("12,5" %) ou vazia** → aceita 12,5 % ou recusa vazio com mensagem, sem gravar NaN. (Task 1)
3. **Marcar "é dívida" num lançamento antigo, fora da janela** → grava a marcação; a trilha só passa a contar se houver parcela futura ou prestação no débito recente (sem erro). (Task 2)
4. **Apagar a meta** → volta ao padrão (6 / 10%) e o texto diz "padrão". (Task 2, Task 3)
5. **Marcação de um grupo que não existe mais** → aparece na tela Regras e pode ser apagada, sem quebrar a trilha. (Task 2)

---

### Task 1: Regras puras

**Files:** Modify `src/lib/trilha.ts`; Test `test/lib/trilha.test.ts`

**Interfaces — Produces:**
- `chaveDivida(descricao: string, banco: string): string`
- `DividaAtiva` ganha `chave: string`
- `interface MarcasDivida { nao: ReadonlySet<string>; sim: ReadonlySet<string> }`; `agruparDividas(lancs, hoje, marcas?: MarcasDivida)`
- `interface MetasTrilha { mesesReserva: number; metaPatrimonio: number }`; `METAS_PADRAO: MetasTrilha = { mesesReserva: 6, metaPatrimonio: 0.1 }`; `DadosTrilha.metas?: MetasTrilha`
- `Trilha.reserva` ganha `meses: number`
- `type ChaveMeta = 'meses_reserva' | 'meta_patrimonio'`; `validarMeta(chave: unknown, valor: unknown): { ok: true; chave: ChaveMeta; valor: number } | { ok: false; erro: string }` (valor gravado: meses inteiros; patrimônio em fração)

- [ ] **Step 1: testes (falham primeiro)** — acrescentar em `test/lib/trilha.test.ts` (importar `chaveDivida, validarMeta`):

```ts
describe('marcações de dívida', () => {
  const l = (descricao: string, data: string, valor: number, forma = 'Crédito', banco = 'B1', categoria: string | null = null) => ({ descricao, categoria, banco, forma, data, valor });
  const lancs = [
    l('RENEGOCIAÇÃO DE PENDÊNCIAS 6/12', '2026-11-10', 100),
    l('LOJA X 3/10', '2026-12-01', 40),
  ];
  it('chave = descrição sem números + banco; DividaAtiva traz a chave', () => {
    expect(chaveDivida('LOJA X 3/10', 'B1')).toBe('loja x|B1');
    expect(agruparDividas(lancs, '2026-10-15')[0].chave).toBe('renegociação de pendências|B1');
  });
  it('"não é dívida" tira um grupo detectado; "é dívida" inclui um não detectado', () => {
    const nao = agruparDividas(lancs, '2026-10-15', { nao: new Set(['renegociação de pendências|B1']), sim: new Set() });
    expect(nao).toEqual([]);
    const sim = agruparDividas(lancs, '2026-10-15', { nao: new Set(), sim: new Set(['loja x|B1']) });
    expect(sim.map((d) => d.nome)).toEqual(['renegociação de pendências', 'loja x']);
  });
});

describe('metas da trilha', () => {
  it('metas gravadas mudam a meta da reserva e o texto do patrimônio; sem metas, o padrão', () => {
    const t = avaliarTrilha(dados({ metas: { mesesReserva: 3, metaPatrimonio: 0.2 } }));
    expect(t.reserva).toMatchObject({ meta: 600, meses: 3 });
    expect(t.patrimonio.meta).toBe(0.2);
    expect(t.fases[3].proximoPasso).toContain('Aplicar 20% do que entra');
    expect(avaliarTrilha(dados()).reserva).toMatchObject({ meta: 1200, meses: 6 });
  });
  it('"não é dívida" não apaga atraso: a fase 1 continua aberta com juros', () => {
    const t = avaliarTrilha(dados({ dividas: [], atrasos: [{ mes: '2026-09', motivo: 'juros' }] }));
    expect(t.atual).toBe(1);
  });
  it('validarMeta: limites, vírgula, vazio, chave desconhecida', () => {
    expect(validarMeta('meses_reserva', '6')).toEqual({ ok: true, chave: 'meses_reserva', valor: 6 });
    expect(validarMeta('meses_reserva', 25)).toEqual({ ok: false, erro: 'Meses da reserva: de 1 a 24.' });
    expect(validarMeta('meses_reserva', 2.5)).toEqual({ ok: false, erro: 'Meses da reserva: de 1 a 24.' });
    expect(validarMeta('meta_patrimonio', '12,5')).toEqual({ ok: true, chave: 'meta_patrimonio', valor: 0.125 });
    expect(validarMeta('meta_patrimonio', '')).toEqual({ ok: false, erro: 'Patrimônio: de 1% a 50%.' });
    expect(validarMeta('meta_patrimonio', 60)).toEqual({ ok: false, erro: 'Patrimônio: de 1% a 50%.' });
    expect(validarMeta('outra', 1)).toEqual({ ok: false, erro: 'Meta desconhecida.' });
  });
});
```

E atualizar os `toEqual` existentes de `agruparDividas` para incluir `chave` (`'renegociação de pendências|B1'`, `'prest de emprest financiamento parc|B2'`); no teste de integração de `getTrilhaDados`, idem (`'renegociação de pendências|B1'`, `'parcelamento de fatura|B3'`).

Run → FAIL.

- [ ] **Step 2: implementar** em `src/lib/trilha.ts`:

```ts
export interface DividaAtiva { chave: string; nome: string; banco: string; valorParcela: number; restantes: number | null; fim: string | null }
export interface MarcasDivida { nao: ReadonlySet<string>; sim: ReadonlySet<string> }
const SEM_MARCAS: MarcasDivida = { nao: new Set(), sim: new Set() };

/** A chave de um grupo de dívida (parcelas do mesmo parcelamento): descrição sem números + banco. */
export function chaveDivida(descricao: string, banco: string): string {
  return `${nomeDivida(descricao)}|${banco}`;
}

export function agruparDividas(lancs: LancDivida[], hoje: string, marcas: MarcasDivida = SEM_MARCAS): DividaAtiva[] {
  // ... como hoje, trocando o filtro e a chave:
  //   const k = chaveDivida(l.descricao, l.banco);
  //   if (marcas.nao.has(k) || !(ehDivida(l.descricao, l.categoria) || marcas.sim.has(k))) continue;
  // e incluindo `chave: k` nos objetos devolvidos (nome = k.split('|')[0], banco = l.banco)
}

export interface MetasTrilha { mesesReserva: number; metaPatrimonio: number }
export const METAS_PADRAO: MetasTrilha = { mesesReserva: MESES_RESERVA, metaPatrimonio: META_PATRIMONIO };
// DadosTrilha: `metas?: MetasTrilha`; Trilha.reserva: `{ meta; aplicado; ritmo; meses }`
// em avaliarTrilha: const m = d.metas ?? METAS_PADRAO; usar m.mesesReserva e m.metaPatrimonio no lugar das constantes;
// texto da fase 4: `Aplicar ${Math.round(m.metaPatrimonio * 100)}% do que entra (${marcaDinheiro(receitaMedia * m.metaPatrimonio)}/mês).`

export type ChaveMeta = 'meses_reserva' | 'meta_patrimonio';
/** Valor da tela (meses ou %, aceita vírgula) → valor gravado (meses inteiros; patrimônio em fração). */
export function validarMeta(chave: unknown, valor: unknown): { ok: true; chave: ChaveMeta; valor: number } | { ok: false; erro: string } {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').trim().replace(',', '.'));
  const vazio = valor === null || valor === undefined || String(valor).trim() === '';
  if (chave === 'meses_reserva') {
    if (vazio || !Number.isInteger(n) || n < 1 || n > 24) return { ok: false, erro: 'Meses da reserva: de 1 a 24.' };
    return { ok: true, chave, valor: n };
  }
  if (chave === 'meta_patrimonio') {
    if (vazio || !Number.isFinite(n) || n < 1 || n > 50) return { ok: false, erro: 'Patrimônio: de 1% a 50%.' };
    return { ok: true, chave, valor: Math.round(n * 10) / 1000 };
  }
  return { ok: false, erro: 'Meta desconhecida.' };
}
```

- [ ] **Step 3:** `npx vitest run test/lib/trilha.test.ts` → PASS; `tsc`. **Step 4: commit** — `feat(trilha): marcacoes de divida e metas na regra (F4b)`.

---

### Task 2: Migração 007, dados e API

**Files:** Create `db/migrations/007_trilha_ajustes.sql`, `src/app/api/trilha/divida/route.ts`, `src/app/api/trilha/divida/[id]/route.ts`, `src/app/api/trilha/meta/route.ts`, `src/app/api/trilha/meta/[chave]/route.ts`; Modify `src/lib/queries.ts`, `test/integracao/previsao.test.ts` (beforeAll: aplicar 006 e 007), `test/integracao/categorias.test.ts` (beforeAll: aplicar 007); Test `test/integracao/categorias.test.ts`

**Interfaces:**
- Consumes: `chaveDivida`, `MarcasDivida`, `MetasTrilha`, `METAS_PADRAO`, `validarMeta`, `ChaveMeta` (Task 1)
- Produces:
  - `getTrilhaDados` lê marcas e metas (passa `marcas` a `agruparDividas` e `metas` em `DadosTrilha`)
  - `marcarDivida(p: { tipo: 'divida'; idTransacao: string } | { tipo: 'nao_divida'; chave: string; nome: string }): Promise<{ id: number } | { erro: string }>`
  - `apagarMarcacao(id: number): Promise<boolean>`; `salvarMeta(chave: ChaveMeta, valor: number): Promise<void>`; `apagarMeta(chave: ChaveMeta): Promise<boolean>`
  - `interface AjustesTrilha { marcacoes: { id: number; tipo: 'nao_divida' | 'divida'; nome: string; criadoEm: string }[]; metas: { chave: ChaveMeta; valor: number }[] }`; `listarAjustesTrilha(): Promise<AjustesTrilha>`; `getMetasTrilha(): Promise<MetasTrilha>`

- [ ] **Step 1: testes (falham primeiro)** — em `test/integracao/categorias.test.ts` (beforeAll também aplica `007_trilha_ajustes.sql`):

```ts
  it('trilha: "é dívida" pelo lançamento, "não é dívida" pela chave; o oposto substitui; apagar', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('tj1', '2041-01-05', 50, 'CREDIARIO LOJA Y 2/8', 'Shopping', 'Shopping', 'Crédito', 'B9', 'Ariane', 'despesa', 'Saída')`);
    const sim = await queries.marcarDivida({ tipo: 'divida', idTransacao: 'tj1' });
    expect(sim).toHaveProperty('id');
    const nao = await queries.marcarDivida({ tipo: 'nao_divida', chave: 'crediario loja y|B9', nome: 'crediario loja y' });
    const aj = await queries.listarAjustesTrilha();
    expect(aj.marcacoes.filter((m) => m.nome === 'crediario loja y').map((m) => m.tipo)).toEqual(['nao_divida']); // o oposto saiu
    expect('id' in nao && (await queries.apagarMarcacao(nao.id))).toBe(true);
    expect(await queries.apagarMarcacao(999999)).toBe(false);
    expect(await queries.marcarDivida({ tipo: 'divida', idTransacao: 'nao-existe' })).toEqual({ erro: 'Lançamento não encontrado.' });
  });

  it('trilha: metas gravadas e apagadas (volta ao padrão)', async () => {
    expect(await queries.getMetasTrilha()).toEqual({ mesesReserva: 6, metaPatrimonio: 0.1 });
    await queries.salvarMeta('meses_reserva', 3);
    await queries.salvarMeta('meta_patrimonio', 0.2);
    expect(await queries.getMetasTrilha()).toEqual({ mesesReserva: 3, metaPatrimonio: 0.2 });
    expect(await queries.apagarMeta('meses_reserva')).toBe(true);
    expect((await queries.getMetasTrilha()).mesesReserva).toBe(6);
    await queries.apagarMeta('meta_patrimonio');
  });
```

E em `test/integracao/previsao.test.ts` (beforeAll aplica 006 e 007): no teste de dados da trilha, depois do `getTrilhaDados`, marcar `nao_divida` da renegociação e conferir que some:

```ts
    await queries.marcarDivida({ tipo: 'nao_divida', chave: 'renegociação de pendências|B1', nome: 'renegociação de pendências' });
    expect((await queries.getTrilhaDados('2038-04-15')).dividas).toEqual([]);
    expect((await queries.getTrilhaDados('2038-04-15')).metas).toEqual({ mesesReserva: 6, metaPatrimonio: 0.1 });
```

> O `marcarDivida` precisa de `DB_WRITER_*` no `beforeAll` do `previsao.test.ts` (como em `contas.test.ts`); acrescentar.

Run → FAIL.

- [ ] **Step 2: migração** `db/migrations/007_trilha_ajustes.sql`:

```sql
-- Ajustes da trilha pelo painel (F4b): metas (reserva, patrimônio) e marcações "é / não é dívida".
BEGIN;
CREATE TABLE IF NOT EXISTS financas_trilha_config (
  chave text PRIMARY KEY CHECK (chave IN ('meses_reserva', 'meta_patrimonio')),
  valor numeric NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS financas_divida_marcacao (
  id serial PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('nao_divida', 'divida')),
  chave text NOT NULL,
  nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_trilha_config, financas_divida_marcacao TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_divida_marcacao_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_trilha_config, financas_divida_marcacao TO bot_readonly;
  END IF;
END $$;
COMMIT;
```

- [ ] **Step 3: queries** (`queries.ts`, seção TRILHA):

```ts
export async function getMetasTrilha(): Promise<MetasTrilha> {
  const rows = await q<any>(`SELECT chave, valor::float8 AS valor FROM financas_trilha_config`);
  const m = new Map(rows.map((r) => [r.chave, Number(r.valor)]));
  return { mesesReserva: m.get('meses_reserva') ?? METAS_PADRAO.mesesReserva, metaPatrimonio: m.get('meta_patrimonio') ?? METAS_PADRAO.metaPatrimonio };
}
async function getMarcasDivida(): Promise<MarcasDivida> {
  const rows = await q<any>(`SELECT tipo, chave FROM financas_divida_marcacao`);
  return { nao: new Set(rows.filter((r) => r.tipo === 'nao_divida').map((r) => r.chave)), sim: new Set(rows.filter((r) => r.tipo === 'divida').map((r) => r.chave)) };
}
export async function marcarDivida(p: { tipo: 'divida'; idTransacao: string } | { tipo: 'nao_divida'; chave: string; nome: string }): Promise<{ id: number } | { erro: string }> {
  let chave: string; let nome: string;
  if (p.tipo === 'divida') {
    const [l] = await q<any>(`SELECT descricao, COALESCE(banco,'—') AS banco FROM financas_lancamentos WHERE id_transacao = $1`, [p.idTransacao]);
    if (!l) return { erro: 'Lançamento não encontrado.' };
    chave = chaveDivida(l.descricao ?? '', l.banco); nome = chave.split('|')[0];
  } else {
    if (!p.chave || !p.chave.includes('|')) return { erro: 'Dívida inválida.' };
    chave = p.chave; nome = p.nome || chave.split('|')[0];
  }
  const oposto = p.tipo === 'divida' ? 'nao_divida' : 'divida';
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    await cli.query(`DELETE FROM financas_divida_marcacao WHERE tipo = $1 AND chave = $2`, [oposto, chave]);
    const { rows } = await cli.query(
      `INSERT INTO financas_divida_marcacao (tipo, chave, nome) VALUES ($1, $2, $3)
       ON CONFLICT (tipo, chave) DO UPDATE SET nome = EXCLUDED.nome, criado_em = now() RETURNING id`, [p.tipo, chave, nome]);
    await cli.query('COMMIT');
    return { id: Number(rows[0].id) };
  } catch (e) { await cli.query('ROLLBACK').catch(() => {}); throw e; } finally { cli.release(); }
}
export async function apagarMarcacao(id: number): Promise<boolean> {
  return (await qw(`DELETE FROM financas_divida_marcacao WHERE id = $1 RETURNING id`, [id])).length > 0;
}
export async function salvarMeta(chave: ChaveMeta, valor: number): Promise<void> {
  await qw(`INSERT INTO financas_trilha_config (chave, valor) VALUES ($1, $2)
            ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`, [chave, valor]);
}
export async function apagarMeta(chave: ChaveMeta): Promise<boolean> {
  return (await qw(`DELETE FROM financas_trilha_config WHERE chave = $1 RETURNING chave`, [chave])).length > 0;
}
export interface AjustesTrilha { marcacoes: { id: number; tipo: 'nao_divida' | 'divida'; nome: string; criadoEm: string }[]; metas: { chave: ChaveMeta; valor: number }[] }
export async function listarAjustesTrilha(): Promise<AjustesTrilha> {
  const [m, c] = await Promise.all([
    q<any>(`SELECT id, tipo, nome, to_char(criado_em,'YYYY-MM-DD') AS criado FROM financas_divida_marcacao ORDER BY criado_em DESC, id DESC`),
    q<any>(`SELECT chave, valor::float8 AS valor FROM financas_trilha_config ORDER BY chave`),
  ]);
  return { marcacoes: m.map((x) => ({ id: Number(x.id), tipo: x.tipo, nome: x.nome ?? '', criadoEm: x.criado })), metas: c.map((x) => ({ chave: x.chave, valor: Number(x.valor) })) };
}
```

Em `getTrilhaDados`: acrescentar `getMarcasDivida()` e `getMetasTrilha()` ao `Promise.all`; `dividas: agruparDividas(lancs, hoje, marcas)`; `metas` no objeto devolvido.

- [ ] **Step 4: rotas**
  - `api/trilha/divida/route.ts` `POST`: corpo `{ tipo: 'divida', idTransacao }` ou `{ tipo: 'nao_divida', chave, nome }` (tipos/strings validados) → `marcarDivida`; `{ erro }` → 400.
  - `api/trilha/divida/[id]/route.ts` `DELETE`: id inteiro > 0 (400) → `apagarMarcacao` (false → 404).
  - `api/trilha/meta/route.ts` `POST`: `{ chave, valor }` → `validarMeta` (400 com o erro) → `salvarMeta`.
  - `api/trilha/meta/[chave]/route.ts` `DELETE`: chave em `meses_reserva | meta_patrimonio` (400) → `apagarMeta`.

- [ ] **Step 5:** integração + unitários → PASS; `tsc`. **Step 6: commit** — `feat(trilha): metas e marcacoes de divida no banco (F4b)`.

---

### Task 3: Telas

**Files:** Create `src/app/components/AjustesTrilha.tsx` (clientes: `BotaoNaoDivida`, `AjustarMeta`, `ListaAjustesTrilha`); Modify `src/app/components/CartaoFase.tsx`, `src/app/trilha/page.tsx`, `src/app/components/FolhaCategoria.tsx`, `src/app/regras/page.tsx`; Test `test/lib/componentesTrilha.test.ts`, `test/lib/componentesCategorias.test.ts`

**Interfaces:** Consumes rotas e tipos das Tasks 1–2. Produces `BotaoNaoDivida({ chave, nome })`, `AjustarMeta({ chave: ChaveMeta; valorTela: number; padrao: boolean })` (valorTela em meses ou %), `ListaAjustesTrilha({ ajustes: AjustesTrilha })`; `CartaoFase` ganha prop `metasPadrao: { meses: boolean; patrimonio: boolean }`.

- [ ] **Step 1: testes (falham primeiro)**

Em `test/lib/componentesTrilha.test.ts`: as dívidas do fixture ganham `chave`; e:

```ts
  it('dívidas: cada uma com "não é dívida"; reserva e patrimônio com "ajustar meta" e o valor em uso', () => {
    const h1 = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, metasPadrao: { meses: true, patrimonio: true }, fase: trilha.fases[0], trilha,
      dividas: [{ chave: 'renegociação|B1', nome: 'renegociação', banco: 'B1', valorParcela: 10, restantes: 3, fim: '2027-03' }] }));
    expect(h1).toContain('não é dívida');
    const h3 = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, metasPadrao: { meses: false, patrimonio: true }, fase: trilha.fases[2], trilha }));
    expect(h3).toContain('ajustar meta');
    expect(h3).toContain(`${trilha.reserva.meses} × gasto travado`);
    const h4 = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, metasPadrao: { meses: true, patrimonio: true }, fase: trilha.fases[3], trilha }));
    expect(h4).toContain('ajustar meta');
    expect(h4).toContain('(padrão)');
  });
```

(o fixture `trilha.reserva` ganha `meses: 6`; `vazio` ganha `metasPadrao: { meses: true, patrimonio: true }`).

Em `test/lib/componentesCategorias.test.ts`: `expect(h).toContain('Isto é dívida (entra na trilha)')` no teste da folha com documento; e

```ts
describe('tela regras: seção trilha', () => {
  it('marcações e metas alteradas, com apagar', async () => {
    const { ListaAjustesTrilha } = await import('../../src/app/components/AjustesTrilha');
    const h = renderToStaticMarkup(createElement(ListaAjustesTrilha, { ajustes: { marcacoes: [{ id: 1, tipo: 'nao_divida', nome: 'crediario loja', criadoEm: '2026-10-11' }], metas: [{ chave: 'meses_reserva', valor: 3 }] } }));
    expect(h).toContain('Não é dívida');
    expect(h).toContain('crediario loja');
    expect(h).toContain('Reserva: 3 meses');
    expect((h.match(/Apagar/g) ?? []).length).toBe(2);
  });
});
```

Run → FAIL.

- [ ] **Step 2: `AjustesTrilha.tsx`** (`'use client'`, recarrega a página após gravar — padrão da `ListaRegras`):

```tsx
'use client';
import { useState } from 'react';
import type { AjustesTrilha } from '@/lib/queries';
import type { ChaveMeta } from '@/lib/trilha';

async function enviar(url: string, method: string, corpo?: unknown): Promise<string | null> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).catch(() => null);
  if (!r) return 'Sem conexão.';
  if (!r.ok) return ((await r.json().catch(() => ({}))) as any).erro ?? 'Não deu certo.';
  return null;
}

export function BotaoNaoDivida({ chave, nome }: { chave: string; nome: string }) {
  async function tirar() {
    if (!confirm(`Tirar ${nome} da trilha? Dá para desfazer na tela Regras.`)) return;
    const erro = await enviar('/api/trilha/divida', 'POST', { tipo: 'nao_divida', chave, nome });
    if (erro) alert(erro); else window.location.reload();
  }
  return <button type="button" onClick={tirar} className="min-h-[44px] px-2 text-[11px] text-muted underline">não é dívida</button>;
}

export function AjustarMeta({ chave, valorTela, padrao }: { chave: ChaveMeta; valorTela: number; padrao: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [v, setV] = useState(String(valorTela));
  const [erro, setErro] = useState<string | null>(null);
  const unidade = chave === 'meses_reserva' ? 'meses' : '%';
  async function salvar() {
    const e = await enviar('/api/trilha/meta', 'POST', { chave, valor: v });
    if (e) setErro(e); else window.location.reload();
  }
  if (!aberto) return (
    <button type="button" onClick={() => setAberto(true)} className="min-h-[44px] px-1 text-[11px] text-accent">
      {`ajustar meta${padrao ? ' (padrão)' : ''}`}
    </button>
  );
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} aria-label={`Meta em ${unidade}`}
        className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm" />
      <span className="text-xs text-muted">{unidade}</span>
      <button type="button" onClick={salvar} className="min-h-[44px] rounded-lg bg-accent px-3 text-xs text-base">Salvar</button>
      <button type="button" onClick={() => setAberto(false)} className="min-h-[44px] px-2 text-xs text-muted">Cancelar</button>
      {erro && <span className="w-full text-xs text-despesa">{erro}</span>}
    </div>
  );
}

const ROTULO_META = (c: ChaveMeta, v: number) => (c === 'meses_reserva' ? `Reserva: ${v} meses` : `Patrimônio: ${Math.round(v * 1000) / 10}% da renda`);

export function ListaAjustesTrilha({ ajustes }: { ajustes: AjustesTrilha }) {
  async function apagar(url: string) {
    const e = await enviar(url, 'DELETE');
    if (e) alert(e); else window.location.reload();
  }
  if (ajustes.marcacoes.length === 0 && ajustes.metas.length === 0) return <div className="card text-sm text-muted">Nenhum ajuste da trilha.</div>;
  return (
    <div className="card divide-y divide-border/60 p-0">
      {ajustes.metas.map((m) => (
        <div key={m.chave} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <span className="text-sm">{ROTULO_META(m.chave, m.valor)}</span>
          <button type="button" onClick={() => apagar(`/api/trilha/meta/${m.chave}`)} className="min-h-[44px] px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
      {ajustes.marcacoes.map((m) => (
        <div key={m.id} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm first-letter:uppercase">{m.nome}</div>
            <div className="text-[11px] text-muted">{`${m.tipo === 'nao_divida' ? 'Não é dívida' : 'É dívida'} · ${m.criadoEm}`}</div>
          </div>
          <button type="button" onClick={() => apagar(`/api/trilha/divida/${m.id}`)} className="min-h-[44px] px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `CartaoFase.tsx`** — prop `metasPadrao: { meses: boolean; patrimonio: boolean }`; na lista de dívidas, depois do valor, `<BotaoNaoDivida chave={d.chave} nome={d.nome} />`; na fase 3 trocar `6 × gasto travado` por `` `${trilha.reserva.meses} × gasto travado` `` (template) e acrescentar `<AjustarMeta chave="meses_reserva" valorTela={trilha.reserva.meses} padrao={metasPadrao.meses} />`; na fase 4, `<AjustarMeta chave="meta_patrimonio" valorTela={Math.round(trilha.patrimonio.meta * 1000) / 10} padrao={metasPadrao.patrimonio} />`.
- [ ] **Step 4: `trilha/page.tsx`**:

```tsx
  const [d, ajustes] = await Promise.all([getTrilhaDados(), listarAjustesTrilha()]);
  const alteradas = new Set(ajustes.metas.map((m) => m.chave));
  const metasPadrao = { meses: !alteradas.has('meses_reserva'), patrimonio: !alteradas.has('meta_patrimonio') };
  // ...<CartaoFase … metasPadrao={metasPadrao} />
```
- [ ] **Step 5: `FolhaCategoria.tsx`** — em `FormCategoria`, abaixo do Salvar, botão `Isto é dívida (entra na trilha)` (min-h 44px, texto pequeno) que faz `POST /api/trilha/divida { tipo: 'divida', idTransacao: lanc.id }` e mostra "Marcado como dívida." (ou o erro).
- [ ] **Step 6: `regras/page.tsx`** — depois da `ListaRegras`, `<h2 className="mb-2 mt-5 text-sm font-medium">Trilha</h2><ListaAjustesTrilha ajustes={await listarAjustesTrilha()} />`.
- [ ] **Step 7:** testes → PASS; `tsc`, suíte, `build`. **Step 8: prévia local** (cópia dos dados + migrações 006 e 007): "não é dívida" na renegociação (fase 1 continua por causa dos juros), apagar na tela Regras; ajustar meta da reserva para 3 e conferir a meta e a data; "Isto é dívida" pela folha num parcelamento comum e conferir na `/trilha`; apagar tudo. **Step 9: commit** — `feat(trilha): ajustes da trilha nas telas (F4b)`.

---

### Task 4: Verificação final e deploy

- [ ] Suíte com integração, `tsc`, `build`; varredura; revisão final independente.
- [ ] Produção: migração 007 (aditiva) → painel (`/root/finance-dash.bak-pre-f4b`) → rotas em 200 (`/trilha`, `/regras`, `/`); a trilha igual à de antes (sem ajustes); push e PR com base `feat/f4-categorias`.
