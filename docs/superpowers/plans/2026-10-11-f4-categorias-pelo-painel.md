# F4 — Categorias pelo painel: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a categoria de um lançamento pelo painel (só este · pela pessoa/empresa · pelo texto), com prévia, gravando a categoria efetiva no lançamento; o worker preserva a correção; tela "Regras" para ver e desfazer.

**Architecture:** Uma função pura de precedência (`src/lib/categoriaPainel.ts`, imports relativos para servir ao worker) decide categoria + classe; a migração 006 cria `categoria_banco` e `financas_categoria_painel`; o painel grava e recalcula numa transação (`writerPool`); o worker carrega as regras e aplica antes de gravar; a folha "Mudar categoria" abre de Gastos e Buscar.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, `pg`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-11-f4-categorias-pelo-painel-design.md`

## Global Constraints

- Nenhuma dependência nova.
- Repositório público: nenhum valor real, CPF/CNPJ, nome de terceiro ou id de conta em código, teste, comentário ou commit.
- **O documento (CPF/CNPJ) nunca vai para o cliente**: nem em resposta de API, nem em props, nem em URL. A tela mostra o nome da contraparte.
- Dinheiro na tela com a classe `money`.
- Precedência: só este lançamento > pessoa/empresa (doc) > texto (mais longo; empate → id maior) > `categoria_banco`.
- Chave de texto: sem acento, maiúscula, espaços normalizados, ≥ 3 caracteres.
- `src/lib/categoriaPainel.ts` só com imports relativos (o worker o empacota sem o alias `@`).
- Escrita do painel pelo `writerPool`; testes de integração com `TEST_DATABASE_URL` (Postgres descartável em 127.0.0.1:55432, banco `personal_hub_db`).
- Commits via `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Regra por texto com `%` ou `_` no texto digitado** → casa literalmente (escape no `LIKE`), não vira curinga. (Task 3)
2. **Corrigir de novo a mesma chave para outra categoria** → substitui a regra (não duplica) e os lançamentos vão para a nova. (Task 3)
3. **Apagar uma regra quando outra regra (mais fraca) também alcança o lançamento** → ele vai para a outra regra, não para o banco. (Task 3)
4. **Lançamento que a regra tira de despesa (ex.: vira Investimentos)** → classe muda para `aporte` e ele sai de Gastos. (Task 1, Task 3)
5. **Folha aberta num lançamento sem documento** → só duas opções (sem "Todos de …"). (Task 4)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/categoriaPainel.ts` (novo) | tipos, `normalizarTexto`, `sugerirTexto`, `categoriaEfetiva`, `recalcular` |
| `db/migrations/006_categorias_painel.sql` (novo) | `categoria_banco`, `financas_categoria_painel`, permissões |
| `src/worker/{tipos,linha,repositorio,tarefas}.ts`, `test/worker/fakes.ts` | `categoria_banco`; regras do painel na ingestão |
| `src/lib/queries.ts` | `getLancamentoParaCorrigir`, `previaRegra`, `salvarRegra`, `apagarRegra`, `listarRegras` |
| `src/lib/validation.ts` | `validarRegra` |
| `src/lib/format.ts` | exporta `CATEGORIAS_CONHECIDAS` |
| `src/app/api/lancamentos/[id]/route.ts`, `src/app/api/categorias/route.ts`, `.../previa/route.ts`, `.../[id]/route.ts` (novos) | API |
| `src/app/components/FolhaCategoria.tsx`, `BotaoCorrigir.tsx`, `ListaRegras.tsx` (novos) | UI |
| `src/app/components/CategoryAccordion.tsx`, `src/app/buscar/page.tsx` | abrir a folha |
| `src/app/regras/page.tsx` (novo), `Nav.tsx`, `links.ts` | tela Regras |

---

### Task 1: Precedência

**Files:** Create `src/lib/categoriaPainel.ts`; Test `test/lib/categoriaPainel.test.ts`

**Interfaces — Produces:**
- `type TipoRegra = 'lancamento' | 'doc' | 'texto'`; `type Origem = TipoRegra | 'banco'`
- `interface RegraPainel { id: number; tipo: TipoRegra; chave: string; categoria: string }`
- `interface LancParaRegra { id: string; descricao: string; contraparteDoc: string | null; categoriaBanco: string; saida: boolean; forma: string; responsavel: string }`
- `normalizarTexto(s: string): string`; `sugerirTexto(descricao: string): string`
- `categoriaEfetiva(l: Pick<LancParaRegra, 'id' | 'descricao' | 'contraparteDoc' | 'categoriaBanco'>, regras: readonly RegraPainel[]): { categoria: string; origem: Origem }`
- `recalcular(l: LancParaRegra, regras: readonly RegraPainel[]): { categoria: string; classe: string; origem: Origem }`

- [ ] **Step 1: teste (falha primeiro)** — `test/lib/categoriaPainel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoriaEfetiva, normalizarTexto, recalcular, sugerirTexto, type RegraPainel } from '../../src/lib/categoriaPainel';

const l = { id: 't1', descricao: 'PIX Padaria Pão Doce 12/03', contraparteDoc: '11122233344', categoriaBanco: 'Shopping', saida: true, forma: 'Débito', responsavel: 'Ariane' };
const R = (id: number, tipo: RegraPainel['tipo'], chave: string, categoria: string): RegraPainel => ({ id, tipo, chave, categoria });

describe('texto da regra', () => {
  it('normaliza acento, caixa e espaços; a sugestão tira números, * e /', () => {
    expect(normalizarTexto('  Pão   doce ')).toBe('PAO DOCE');
    expect(sugerirTexto('IFD*Restaurante 123/45')).toBe('IFD RESTAURANTE');
  });
});

describe('precedência', () => {
  it('só este > pessoa > texto > banco', () => {
    const todas = [R(1, 'texto', 'PADARIA', 'Groceries'), R(2, 'doc', '11122233344', 'Eating out'), R(3, 'lancamento', 't1', 'Gifts')];
    expect(categoriaEfetiva(l, todas)).toEqual({ categoria: 'Gifts', origem: 'lancamento' });
    expect(categoriaEfetiva(l, todas.slice(0, 2))).toEqual({ categoria: 'Eating out', origem: 'doc' });
    expect(categoriaEfetiva(l, todas.slice(0, 1))).toEqual({ categoria: 'Groceries', origem: 'texto' });
    expect(categoriaEfetiva(l, [])).toEqual({ categoria: 'Shopping', origem: 'banco' });
  });
  it('texto: o mais longo ganha; empate, a regra mais nova (id maior); acento não importa', () => {
    expect(categoriaEfetiva(l, [R(1, 'texto', 'PADARIA', 'Groceries'), R(2, 'texto', 'PADARIA PAO', 'Eating out')]).categoria).toBe('Eating out');
    expect(categoriaEfetiva(l, [R(5, 'texto', 'PADARIA', 'Groceries'), R(9, 'texto', 'PAO DOCE', 'Eating out')]).categoria).toBe('Eating out');
  });
  it('a regra do painel manda mesmo com categoria do banco não vaga; documento vazio não casa', () => {
    expect(categoriaEfetiva({ ...l, categoriaBanco: 'Groceries' }, [R(1, 'texto', 'PADARIA', 'Pets')]).categoria).toBe('Pets');
    expect(categoriaEfetiva({ ...l, contraparteDoc: null }, [R(1, 'doc', '', 'Pets')]).origem).toBe('banco');
  });
});

describe('classe recalculada', () => {
  it('virar Investimentos muda a classe para aplicação; voltar para o banco devolve despesa', () => {
    expect(recalcular(l, [R(1, 'lancamento', 't1', 'Investments')])).toEqual({ categoria: 'Investments', classe: 'aporte', origem: 'lancamento' });
    expect(recalcular(l, []).classe).toBe('despesa');
  });
});
```

Run `npx vitest run test/lib/categoriaPainel.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 2: implementar** — `src/lib/categoriaPainel.ts`:

```ts
// Categoria pelo painel (F4): uma função só decide a categoria efetiva — usada pelo painel e pelo worker.
// Só imports relativos: o worker empacota este arquivo sem o alias "@".
import { classificar } from '../worker/classificar';

export type TipoRegra = 'lancamento' | 'doc' | 'texto';
export type Origem = TipoRegra | 'banco';
export interface RegraPainel { id: number; tipo: TipoRegra; chave: string; categoria: string }
export interface LancParaRegra {
  id: string; descricao: string; contraparteDoc: string | null; categoriaBanco: string;
  saida: boolean; forma: string; responsavel: string;
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Texto sugerido para a regra: a descrição sem números, "*" e "/". */
export function sugerirTexto(descricao: string): string {
  return normalizarTexto(descricao.replace(/[0-9*/]/g, ' '));
}

/** Só este lançamento > pessoa/empresa > texto (mais longo; empate, mais nova) > banco. Regra do painel manda sempre. */
export function categoriaEfetiva(
  l: Pick<LancParaRegra, 'id' | 'descricao' | 'contraparteDoc' | 'categoriaBanco'>, regras: readonly RegraPainel[],
): { categoria: string; origem: Origem } {
  const so = regras.find((r) => r.tipo === 'lancamento' && r.chave === l.id);
  if (so) return { categoria: so.categoria, origem: 'lancamento' };
  const doc = l.contraparteDoc ? regras.filter((r) => r.tipo === 'doc' && r.chave === l.contraparteDoc).sort((a, b) => b.id - a.id)[0] : undefined;
  if (doc) return { categoria: doc.categoria, origem: 'doc' };
  const d = normalizarTexto(l.descricao);
  const texto = regras
    .filter((r) => r.tipo === 'texto' && r.chave.length > 0 && d.includes(r.chave))
    .sort((a, b) => b.chave.length - a.chave.length || b.id - a.id)[0];
  if (texto) return { categoria: texto.categoria, origem: 'texto' };
  return { categoria: l.categoriaBanco, origem: 'banco' };
}

/** Categoria efetiva e a classe que ela implica (o mesmo classificar do worker). */
export function recalcular(l: LancParaRegra, regras: readonly RegraPainel[]): { categoria: string; classe: string; origem: Origem } {
  const e = categoriaEfetiva(l, regras);
  return { ...e, classe: classificar(e.categoria, l.descricao, l.saida, l.forma, l.responsavel) };
}
```

> Escrever o `[̀-ͯ]` com o escape literal (no F3 o ambiente gravou os caracteres; conferir com `grep -c 'u0300' src/lib/categoriaPainel.ts` = 1).

- [ ] **Step 3:** PASS. **Step 4: commit** — `feat(categorias): precedencia da categoria pelo painel (F4)`.

---

### Task 2: Migração e worker

**Files:** Create `db/migrations/006_categorias_painel.sql`, `test/integracao/categorias.test.ts`; Modify `src/worker/tipos.ts`, `src/worker/linha.ts`, `src/worker/repositorio.ts`, `src/worker/tarefas.ts`, `test/worker/fakes.ts`, `test/worker/linha.test.ts`

**Interfaces:**
- Consumes: `RegraPainel`, `recalcular` (Task 1)
- Produces: coluna `categoria_banco`; tabela `financas_categoria_painel (id, tipo, chave, categoria, nome, afetados, criado_em, UNIQUE (tipo, chave))`; `Lancamento.categoria_banco: string`; `Repo.regrasPainel(): Promise<RegraPainel[]>`; `montarLinha(t, conta, docsCasal, regras: readonly RegraPainel[] = [])`

- [ ] **Step 1: testes (falham primeiro)**

Em `test/worker/linha.test.ts` (mesmo padrão de `tx()`/`conta` do arquivo):

```ts
  it('regra do painel: grava a categoria efetiva e a classe dela; categoria_banco guarda a do banco', () => {
    const l = montarLinha(tx({ category: 'Shopping', description: 'LOJA DO BICHO' }), conta, new Set(), [{ id: 1, tipo: 'texto', chave: 'BICHO', categoria: 'Investments' }]);
    expect(l.categoria_banco).toBe('Shopping');
    expect(l.categoria).toBe('Investments');
    expect(l.classe).toBe('aporte');
  });
  it('sem regra do painel: categoria = categoria_banco (nada muda na ingestão)', () => {
    const l = montarLinha(tx({ category: 'Shopping', description: 'LOJA X' }), conta, new Set());
    expect(l.categoria).toBe('Shopping');
    expect(l.categoria_banco).toBe('Shopping');
  });
```

`test/integracao/categorias.test.ts` (o `beforeAll` como em `contas.test.ts`, mas carregando `base.sql`, `001_c1_ingestao.sql` e `006_categorias_painel.sql`):

```ts
  it('migração 006: preenche categoria_banco com a categoria atual e é idempotente', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('m1', '2040-01-05', 10, 'X', 'Groceries', 'Débito', 'B', 'Ariane', 'despesa', 'Saída')`);
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    const { rows } = await pool.query(`SELECT categoria_banco FROM financas_lancamentos WHERE id_transacao = 'm1'`);
    expect(rows[0].categoria_banco).toBe('Groceries');
  });
```

Run worker + integração → FAIL (`categoria_banco` indefinido / arquivo de migração inexistente).

- [ ] **Step 2: migração** — `db/migrations/006_categorias_painel.sql`:

```sql
-- Categorias pelo painel (F4): categoria_banco guarda o que veio do banco; categoria passa a ser a efetiva.
-- O que o painel faz fica em financas_categoria_painel (regras antigas por SQL continuam na financas_regras_categoria).
BEGIN;
ALTER TABLE financas_lancamentos ADD COLUMN IF NOT EXISTS categoria_banco text;
UPDATE financas_lancamentos SET categoria_banco = categoria WHERE categoria_banco IS NULL;

CREATE TABLE IF NOT EXISTS financas_categoria_painel (
  id        serial PRIMARY KEY,
  tipo      text NOT NULL CHECK (tipo IN ('lancamento', 'doc', 'texto')),
  chave     text NOT NULL,
  categoria text NOT NULL,
  nome      text,
  afetados  int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_categoria_painel TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_categoria_painel_id_seq TO dash_writer;
    GRANT UPDATE (categoria, classe) ON financas_lancamentos TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT ON financas_categoria_painel TO pluggy_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_categoria_painel TO bot_readonly;
  END IF;
END $$;
COMMIT;
```

> `dash_writer` precisa também de `SELECT` em `financas_lancamentos` (conferir em produção com `\dp`; se faltar, acrescentar ao bloco).

- [ ] **Step 3: worker**
  - `tipos.ts`: em `Lancamento`, depois de `categoria: string;`, `categoria_banco: string;`.
  - `repositorio.ts`: em `COLUNAS_LINHA`, acrescentar `, categoria_banco text` ao fim; na interface `Repo`, `regrasPainel(): Promise<RegraPainel[]>;` e em `PgRepo`:

```ts
  async regrasPainel(): Promise<RegraPainel[]> {
    const r = await this.pool.query(`SELECT id, tipo, chave, categoria FROM financas_categoria_painel`);
    return r.rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, chave: x.chave, categoria: x.categoria }));
  }
```

  (import `type RegraPainel` de `'../lib/categoriaPainel'`.)
  - `linha.ts`: assinatura `montarLinha(t, conta, docsCasal, regras: readonly RegraPainel[] = [])`; trocar o cálculo de `classe`/`categoria`:

```ts
  const categoriaBanco = catCorr || 'Outros';
  const efetiva = recalcular({
    id: t.id, descricao: t.description ?? '', contraparteDoc: soDigitos(contra?.documentNumber?.value),
    categoriaBanco, saida, forma: conta.forma, responsavel: conta.responsavel,
  }, regras);
  // ...no objeto:
    classe: efetiva.classe,
    categoria: efetiva.categoria,
    categoria_banco: categoriaBanco,
```

  (`classificar(catCorr, …)` e `classificar(catCorr || 'Outros', …)` dão a mesma classe: `classificar` usa `cat || 'Outros'`.)
  - `tarefas.ts`, em `transacoes`, antes do `for`: `const regras = await ctx.repo.regrasPainel();` e `montarLinha(t, c, docs, regras)`.
  - `test/worker/fakes.ts`: no repo falso, `async regrasPainel() { return []; }` (ou um campo `regras` configurável).
  - Procurar outros construtores de `Lancamento` (`grep -rn "transferencia_casal:" src test`) e incluir `categoria_banco`.

- [ ] **Step 4:** `npx vitest run test/worker` + integração → PASS; `npm run build:worker` ok. **Step 5: commit** — `feat(categorias): categoria_banco e regras do painel na ingestao (F4)`.

---

### Task 3: Escrita pelo painel

**Files:** Modify `src/lib/queries.ts`, `src/lib/validation.ts`, `src/lib/format.ts`; Create `src/app/api/lancamentos/[id]/route.ts`, `src/app/api/categorias/route.ts`, `src/app/api/categorias/previa/route.ts`, `src/app/api/categorias/[id]/route.ts`; Test `test/integracao/categorias.test.ts`, `test/lib/validation.test.ts` (ou o arquivo de validação existente)

**Interfaces:**
- Consumes: `RegraPainel`, `recalcular`, `categoriaEfetiva`, `normalizarTexto`, `sugerirTexto` (Task 1); tabela e coluna (Task 2)
- Produces:
  - `CATEGORIAS_CONHECIDAS: string[]` (format.ts = `Object.keys(CAT_PT)`)
  - `interface PedidoRegra { tipo: TipoRegra; idTransacao: string; texto?: string; categoria: string }`
  - `validarRegra(body): { ok: true; data: PedidoRegra } | { ok: false; erro: string }`
  - `interface LancCorrigir { id: string; data: string; valor: number; descricao: string; categoria: string; origem: Origem; temDoc: boolean; nomeContraparte: string | null; sugestaoTexto: string; maisUsadas: string[] }`
  - `getLancamentoParaCorrigir(id: string): Promise<LancCorrigir | null>`
  - `previaRegra(p: PedidoRegra): Promise<{ afetados: number; porCategoria: Record<string, number> } | { erro: string }>`
  - `salvarRegra(p: PedidoRegra): Promise<{ id: number; afetados: number } | { erro: string }>`
  - `apagarRegra(id: number): Promise<{ afetados: number } | null>`
  - `interface RegraListada { id: number; tipo: TipoRegra; nome: string; categoria: string; afetados: number; criadoEm: string }`; `listarRegras(): Promise<RegraListada[]>` — **sem `chave`** (a do tipo `doc` é documento)

- [ ] **Step 1: testes (falham primeiro)** — em `test/integracao/categorias.test.ts`, depois de inserir lançamentos sintéticos (`categoria_banco` preenchido), com `DB_WRITER_USER/PASSWORD` = usuário do teste:

```ts
  const ins = (id: string, desc: string, cat: string, doc: string | null, nome: string | null = null) => pool.query(
    `INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, forma_pagamento, banco, responsavel, classe, tipo_movimento, contraparte_doc, contraparte_nome)
     VALUES ($1, '2040-02-05', 10, $2, $3, $3, 'Débito', 'B', 'Ariane', 'despesa', 'Saída', $4, $5)`, [id, desc, cat, doc, nome]);

  it('regra por texto: prévia = gravação; muda categoria e classe; não expõe documento', async () => {
    await ins('c1', 'LOJA DO BICHO 1', 'Shopping', '99988877766', 'Loja do Bicho Ltda');
    await ins('c2', 'Loja do Bicho 2', 'Groceries', null);
    await ins('c3', 'OUTRA LOJA', 'Shopping', null);
    const pedido = { tipo: 'texto' as const, idTransacao: 'c1', texto: 'loja do bicho', categoria: 'Pets' };
    expect(await queries.previaRegra(pedido)).toEqual({ afetados: 2, porCategoria: { Shopping: 1, Groceries: 1 } });
    expect(await queries.salvarRegra(pedido)).toMatchObject({ afetados: 2 });
    const { rows } = await pool.query(`SELECT id_transacao, categoria, categoria_banco FROM financas_lancamentos WHERE id_transacao IN ('c1','c2','c3') ORDER BY 1`);
    expect(rows.map((r) => r.categoria)).toEqual(['Pets', 'Pets', 'Shopping']);
    expect(rows[0].categoria_banco).toBe('Shopping');
    const lc = await queries.getLancamentoParaCorrigir('c1');
    expect(lc).toMatchObject({ categoria: 'Pets', origem: 'texto', temDoc: true, nomeContraparte: 'Loja do Bicho Ltda' });
    expect(JSON.stringify(lc)).not.toContain('99988877766');
    expect(JSON.stringify(await queries.listarRegras())).not.toContain('99988877766');
  });

  it('virar Investimentos tira de despesa (classe aporte); corrigir de novo a mesma chave substitui', async () => {
    await ins('c4', 'APLICA X', 'Shopping', null);
    await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c4', categoria: 'Investments' });
    expect((await pool.query(`SELECT classe FROM financas_lancamentos WHERE id_transacao='c4'`)).rows[0].classe).toBe('aporte');
    await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c4', categoria: 'Groceries' });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM financas_categoria_painel WHERE tipo='lancamento' AND chave='c4'`);
    expect(rows[0].n).toBe(1);
    expect((await pool.query(`SELECT categoria, classe FROM financas_lancamentos WHERE id_transacao='c4'`)).rows[0]).toEqual({ categoria: 'Groceries', classe: 'despesa' });
  });

  it('regra por pessoa: usa o documento do lançamento; sem documento é erro', async () => {
    await ins('c5', 'PIX FULANO', 'Transfers', '12345678901', 'Fulano');
    await ins('c6', 'PIX FULANO DE TAL', 'Transfers', '12345678901', 'Fulano');
    expect(await queries.salvarRegra({ tipo: 'doc', idTransacao: 'c5', categoria: 'Gifts' })).toMatchObject({ afetados: 2 });
    expect(await queries.salvarRegra({ tipo: 'doc', idTransacao: 'c3', categoria: 'Gifts' })).toEqual({ erro: 'Este lançamento não tem CPF/CNPJ da contraparte.' });
  });

  it('apagar: volta ao banco, ou a outra regra que ainda valha', async () => {
    await ins('c7', 'MERCADINHO BOM', 'Shopping', null);
    const fraca = await queries.salvarRegra({ tipo: 'texto', idTransacao: 'c7', texto: 'mercadinho', categoria: 'Groceries' });
    const forte = await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c7', categoria: 'Gifts' });
    expect('id' in forte && (await queries.apagarRegra(forte.id))).toEqual({ afetados: 1 });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='c7'`)).rows[0].categoria).toBe('Groceries');
    expect('id' in fraca && (await queries.apagarRegra(fraca.id))).toEqual({ afetados: 1 });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='c7'`)).rows[0].categoria).toBe('Shopping');
  });

  it('texto com % e _ casa literalmente', async () => {
    await ins('c8', 'PAGTO 100% SAUDE', 'Shopping', null);
    await ins('c9', 'PAGTO 1000 SAUDE', 'Shopping', null);
    expect(await queries.previaRegra({ tipo: 'texto', idTransacao: 'c8', texto: '100% saude', categoria: 'Health' })).toMatchObject({ afetados: 1 });
  });
```

E unitário de `validarRegra`: tipo inválido → erro; categoria fora da lista → "Categoria desconhecida."; texto com menos de 3 caracteres (depois de normalizar) → "O texto precisa de pelo menos 3 letras."; ok normaliza o texto.

Run → FAIL (funções inexistentes).

- [ ] **Step 2: implementar**
  - `format.ts`: `export const CATEGORIAS_CONHECIDAS = Object.keys(CAT_PT);`
  - `validation.ts`:

```ts
import { CATEGORIAS_CONHECIDAS } from './format';
import { normalizarTexto, type TipoRegra } from './categoriaPainel';

export interface PedidoRegra { tipo: TipoRegra; idTransacao: string; texto?: string; categoria: string }
export function validarRegra(b: any): { ok: true; data: PedidoRegra } | { ok: false; erro: string } {
  if (!b || !['lancamento', 'doc', 'texto'].includes(b.tipo)) return { ok: false, erro: 'Tipo de regra inválido.' };
  if (typeof b.idTransacao !== 'string' || !b.idTransacao) return { ok: false, erro: 'Lançamento não informado.' };
  if (!CATEGORIAS_CONHECIDAS.includes(b.categoria)) return { ok: false, erro: 'Categoria desconhecida.' };
  if (b.tipo === 'texto') {
    const t = normalizarTexto(String(b.texto ?? ''));
    if (t.replace(/\s/g, '').length < 3) return { ok: false, erro: 'O texto precisa de pelo menos 3 letras.' };
    return { ok: true, data: { tipo: 'texto', idTransacao: b.idTransacao, texto: t, categoria: b.categoria } };
  }
  return { ok: true, data: { tipo: b.tipo, idTransacao: b.idTransacao, categoria: b.categoria } };
}
```

  - `queries.ts` (imports: `categoriaEfetiva, normalizarTexto, recalcular, sugerirTexto, type Origem, type RegraPainel, type TipoRegra` de `./categoriaPainel`; `type PedidoRegra` de `./validation`):

```ts
// ==================== CATEGORIAS PELO PAINEL (F4) ====================
const ACENTOS = ['ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'AAAAAEEEEIIIIOOOOOUUUUC'];
const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
type Cli = { query: (t: string, p?: any[]) => Promise<{ rows: any[] }> };

async function regrasDoPainel(c: Cli): Promise<RegraPainel[]> {
  const { rows } = await c.query(`SELECT id, tipo, chave, categoria FROM financas_categoria_painel`);
  return rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, chave: x.chave, categoria: x.categoria }));
}

/** Lançamentos que uma regra alcança (a mesma seleção na prévia, na gravação e ao apagar). */
async function alcance(c: Cli, tipo: TipoRegra, chave: string) {
  const onde = tipo === 'lancamento' ? 'id_transacao = $1'
    : tipo === 'doc' ? 'contraparte_doc = $1'
    : `translate(upper(descricao), '${ACENTOS[0]}', '${ACENTOS[1]}') LIKE '%' || $1 || '%' ESCAPE '\\'`;
  const { rows } = await c.query(
    `SELECT id_transacao, descricao, categoria, classe, COALESCE(categoria_banco, categoria) AS categoria_banco,
            contraparte_doc, tipo_movimento, forma_pagamento, responsavel
     FROM financas_lancamentos WHERE ${onde}`,
    [tipo === 'texto' ? escLike(chave) : chave],
  );
  return rows;
}
const paraRegra = (r: any) => ({
  id: r.id_transacao, descricao: r.descricao ?? '', contraparteDoc: r.contraparte_doc, categoriaBanco: r.categoria_banco,
  saida: r.tipo_movimento === 'Saída', forma: r.forma_pagamento, responsavel: r.responsavel,
});

/** Do pedido da tela à regra: a chave da regra por pessoa vem do lançamento, nunca do cliente. */
async function resolver(c: Cli, p: PedidoRegra): Promise<{ tipo: TipoRegra; chave: string; nome: string } | { erro: string }> {
  const { rows } = await c.query(`SELECT descricao, contraparte_doc, contraparte_nome FROM financas_lancamentos WHERE id_transacao = $1`, [p.idTransacao]);
  if (!rows[0]) return { erro: 'Lançamento não encontrado.' };
  if (p.tipo === 'lancamento') return { tipo: 'lancamento', chave: p.idTransacao, nome: rows[0].descricao ?? '' };
  if (p.tipo === 'doc') {
    if (!rows[0].contraparte_doc) return { erro: 'Este lançamento não tem CPF/CNPJ da contraparte.' };
    return { tipo: 'doc', chave: rows[0].contraparte_doc, nome: rows[0].contraparte_nome ?? rows[0].descricao ?? '' };
  }
  // normaliza aqui também: a chave tem que casar com normalizarTexto da descrição, venha o pedido de onde vier
  const chave = normalizarTexto(p.texto ?? '');
  if (chave.replace(/\s/g, '').length < 3) return { erro: 'O texto precisa de pelo menos 3 letras.' };
  return { tipo: 'texto', chave, nome: chave };
}

/** O que muda se `regras` passarem a valer, para os lançamentos que (tipo, chave) alcança. */
async function planejar(c: Cli, tipo: TipoRegra, chave: string, regras: RegraPainel[]) {
  const linhas = await alcance(c, tipo, chave);
  return linhas
    .map((r) => ({ r, novo: recalcular(paraRegra(r), regras) }))
    .filter(({ r, novo }) => novo.categoria !== r.categoria || novo.classe !== r.classe);
}

export async function previaRegra(p: PedidoRegra) {
  const alvo = await resolver(writerPool, p);
  if ('erro' in alvo) return alvo;
  const atuais = (await regrasDoPainel(writerPool)).filter((r) => !(r.tipo === alvo.tipo && r.chave === alvo.chave));
  const muda = await planejar(writerPool, alvo.tipo, alvo.chave, [...atuais, { id: Number.MAX_SAFE_INTEGER, tipo: alvo.tipo, chave: alvo.chave, categoria: p.categoria }]);
  const porCategoria: Record<string, number> = {};
  for (const { r } of muda) porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + 1;
  return { afetados: muda.length, porCategoria };
}

export async function salvarRegra(p: PedidoRegra) {
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    const alvo = await resolver(cli, p);
    if ('erro' in alvo) { await cli.query('ROLLBACK'); return alvo; }
    const { rows } = await cli.query(
      `INSERT INTO financas_categoria_painel (tipo, chave, categoria, nome) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tipo, chave) DO UPDATE SET categoria = EXCLUDED.categoria, nome = EXCLUDED.nome, criado_em = now()
       RETURNING id`,
      [alvo.tipo, alvo.chave, p.categoria, alvo.nome],
    );
    const id = Number(rows[0].id);
    const muda = await planejar(cli, alvo.tipo, alvo.chave, await regrasDoPainel(cli));
    for (const { r, novo } of muda) {
      await cli.query(`UPDATE financas_lancamentos SET categoria = $2, classe = $3 WHERE id_transacao = $1`, [r.id_transacao, novo.categoria, novo.classe]);
    }
    await cli.query(`UPDATE financas_categoria_painel SET afetados = $2 WHERE id = $1`, [id, muda.length]);
    await cli.query('COMMIT');
    return { id, afetados: muda.length };
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}

export async function apagarRegra(id: number) {
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    const { rows } = await cli.query(`DELETE FROM financas_categoria_painel WHERE id = $1 RETURNING tipo, chave`, [id]);
    if (!rows[0]) { await cli.query('ROLLBACK'); return null; }
    const muda = await planejar(cli, rows[0].tipo, rows[0].chave, await regrasDoPainel(cli));
    for (const { r, novo } of muda) {
      await cli.query(`UPDATE financas_lancamentos SET categoria = $2, classe = $3 WHERE id_transacao = $1`, [r.id_transacao, novo.categoria, novo.classe]);
    }
    await cli.query('COMMIT');
    return { afetados: muda.length };
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}

export interface RegraListada { id: number; tipo: TipoRegra; nome: string; categoria: string; afetados: number; criadoEm: string }
export async function listarRegras(): Promise<RegraListada[]> {
  const rows = await q<any>(`SELECT id, tipo, nome, categoria, afetados, to_char(criado_em, 'YYYY-MM-DD') AS criado FROM financas_categoria_painel ORDER BY criado_em DESC, id DESC`);
  return rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, nome: x.nome ?? '', categoria: x.categoria, afetados: Number(x.afetados), criadoEm: x.criado }));
}

export interface LancCorrigir {
  id: string; data: string; valor: number; descricao: string; categoria: string; origem: Origem;
  temDoc: boolean; nomeContraparte: string | null; sugestaoTexto: string; maisUsadas: string[];
}
export async function getLancamentoParaCorrigir(id: string): Promise<LancCorrigir | null> {
  const [rows, regras, usadas] = await Promise.all([
    q<any>(`SELECT id_transacao, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor::float8 AS valor, descricao, categoria,
                   COALESCE(categoria_banco, categoria) AS categoria_banco, contraparte_doc, contraparte_nome
            FROM financas_lancamentos WHERE id_transacao = $1`, [id]),
    regrasDoPainel({ query: (t, p) => q<any>(t, p).then((rows) => ({ rows })) }),
    q<any>(`SELECT categoria FROM financas_lancamentos WHERE classe = 'despesa' AND data_lancamento >= now() - interval '3 months'
            GROUP BY 1 ORDER BY count(*) DESC LIMIT 6`),
  ]);
  const r = rows[0];
  if (!r) return null;
  const e = categoriaEfetiva({ id: r.id_transacao, descricao: r.descricao ?? '', contraparteDoc: r.contraparte_doc, categoriaBanco: r.categoria_banco }, regras);
  return {
    id: r.id_transacao, data: r.data, valor: Number(r.valor), descricao: r.descricao ?? '', categoria: r.categoria, origem: e.origem,
    temDoc: !!r.contraparte_doc, nomeContraparte: r.contraparte_doc ? (r.contraparte_nome ?? null) : null,
    sugestaoTexto: sugerirTexto(r.descricao ?? ''), maisUsadas: usadas.map((x) => x.categoria),
  };
}
```

  - Rotas (padrão de `api/compromissos`):
    - `api/lancamentos/[id]/route.ts`: `GET` → `getLancamentoParaCorrigir(params.id)`; 404 `{ erro: 'Lançamento não encontrado.' }` se null.
    - `api/categorias/previa/route.ts`: `POST` → `validarRegra` → `previaRegra`; `{ erro }` vira 400.
    - `api/categorias/route.ts`: `POST` → `validarRegra` → `salvarRegra`; `{ erro }` vira 400.
    - `api/categorias/[id]/route.ts`: `DELETE` → `apagarRegra(Number(params.id))`; null → 404.
  - O `beforeAll` do teste define `DB_WRITER_USER/DB_WRITER_PASSWORD` (como `contas.test.ts`).

- [ ] **Step 3:** integração + unitários → PASS; `tsc`. **Step 4: commit** — `feat(categorias): prévia, gravação e exclusão de regras pelo painel (F4)`.

---

### Task 4: Telas

**Files:** Create `src/app/components/FolhaCategoria.tsx`, `src/app/components/BotaoCorrigir.tsx`, `src/app/components/ListaRegras.tsx`, `src/app/regras/page.tsx`; Modify `src/app/components/CategoryAccordion.tsx`, `src/app/buscar/page.tsx`, `src/app/components/Nav.tsx`, `src/lib/links.ts`, `test/lib/links.test.ts`; Test `test/lib/componentesCategorias.test.ts`

**Interfaces:** Consumes `LancCorrigir`, `RegraListada`, rotas da Task 3, `GRUPOS_GASTO` (grupos.ts), `traduzCategoria`, `CATEGORIAS_CONHECIDAS`.
Produces: `FormCategoria({ lanc, onSalvo })` (apresentação, testável), `FolhaCategoria({ id, onFechar })` (busca o lançamento e mostra o form), `BotaoCorrigir({ id, children })`, `ListaRegras({ regras })`; rota `/regras`.

- [ ] **Step 1: testes (falham primeiro)** — `test/lib/componentesCategorias.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormCategoria } from '../../src/app/components/FolhaCategoria';
import { ListaRegras } from '../../src/app/components/ListaRegras';

const lanc = { id: 't1', data: '2026-10-05', valor: 42, descricao: 'PIX LOJA DO BICHO', categoria: 'Shopping', origem: 'banco' as const, temDoc: true, nomeContraparte: 'Loja do Bicho Ltda', sugestaoTexto: 'PIX LOJA DO BICHO', maisUsadas: ['Groceries'] };

describe('folha mudar categoria', () => {
  it('com documento: três opções, a de pessoa mostra o nome; valor com money; origem dita', () => {
    const h = renderToStaticMarkup(createElement(FormCategoria, { lanc, onSalvo: () => {} }));
    expect(h).toContain('Só este lançamento');
    expect(h).toContain('Todos de Loja do Bicho Ltda');
    expect(h).toContain('Todos com o texto');
    expect(h).toContain('money');
    expect(h).toContain('do banco');
  });
  it('sem documento: só duas opções', () => {
    const h = renderToStaticMarkup(createElement(FormCategoria, { lanc: { ...lanc, temDoc: false, nomeContraparte: null }, onSalvo: () => {} }));
    expect(h).not.toContain('Todos de');
    expect(h).toContain('Todos com o texto');
  });
});

describe('tela regras', () => {
  it('lista tipo, nome, categoria em português e quantos; botão apagar', () => {
    const h = renderToStaticMarkup(createElement(ListaRegras, { regras: [{ id: 1, tipo: 'texto', nome: 'LOJA DO BICHO', categoria: 'Pets', afetados: 3, criadoEm: '2026-10-11' }] }));
    expect(h).toContain('LOJA DO BICHO');
    expect(h).toContain('3 lançamentos');
    expect(h).toContain('Apagar');
  });
  it('sem regras: mensagem', () => {
    expect(renderToStaticMarkup(createElement(ListaRegras, { regras: [] }))).toContain('Nenhuma regra criada pelo painel');
  });
});
```

E em `test/lib/links.test.ts`: `expect(linkPara('regras')).toBe('/regras');` e `expect(temSeletorDeMes('/regras')).toBe(false);`.

Run → FAIL.

- [ ] **Step 2: links e nav** — `links.ts`: `'regras'` em `Tela`, `regras: '/regras'` em `CAMINHO`, `temSeletorDeMes` falso para `'/regras'`. `Nav.tsx`: importar `Tags` de `lucide-react`; em `EXTRA`, depois de Buscar, `{ href: '/regras', label: 'Regras de categoria', short: 'Regras', icon: Tags }`.

- [ ] **Step 3: `FolhaCategoria.tsx`** (`'use client'`):

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { brl, dataBR, traduzCategoria, CATEGORIAS_CONHECIDAS } from '@/lib/format';
import { GRUPOS_GASTO } from '@/lib/grupos';
import type { LancCorrigir } from '@/lib/queries';

const ORIGEM = { banco: 'do banco', doc: 'regra por pessoa', texto: 'regra por texto', lancamento: 'corrigido à mão' } as const;
type Tipo = 'lancamento' | 'doc' | 'texto';

/** O formulário (apresentação + chamadas); a folha só busca o lançamento e o envolve. */
export function FormCategoria({ lanc, onSalvo }: { lanc: LancCorrigir; onSalvo: (r: { id: number; afetados: number; categoria: string }) => void }) {
  const [categoria, setCategoria] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<Tipo>('lancamento');
  const [texto, setTexto] = useState(lanc.sugestaoTexto);
  const [previa, setPrevia] = useState<{ afetados: number; porCategoria: Record<string, number> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const opcoes = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const nos = (c: string) => !b || traduzCategoria(c).toLowerCase().includes(b);
    const agrupadas = new Set(GRUPOS_GASTO.flatMap((g) => g.cats));
    return [
      { nome: 'Mais usadas', cats: lanc.maisUsadas.filter(nos) },
      ...GRUPOS_GASTO.map((g) => ({ nome: `${g.emoji} ${g.nome}`, cats: g.cats.filter(nos) })),
      { nome: 'Outras', cats: CATEGORIAS_CONHECIDAS.filter((c) => !agrupadas.has(c)).filter(nos) },
    ].filter((g) => g.cats.length > 0);
  }, [busca, lanc.maisUsadas]);

  const pedido = { tipo, idTransacao: lanc.id, texto: tipo === 'texto' ? texto : undefined, categoria };
  useEffect(() => {
    if (!categoria) { setPrevia(null); return; }
    const ctl = new AbortController();
    fetch('/api/categorias/previa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido), signal: ctl.signal })
      .then(async (r) => { const j = await r.json(); if (!r.ok) { setErro(j.erro); setPrevia(null); } else { setErro(null); setPrevia(j); } })
      .catch(() => {});
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, tipo, texto]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch('/api/categorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedido) });
      const j = await r.json();
      if (!r.ok) { setErro(j.erro ?? 'Erro ao salvar.'); return; }
      onSalvo({ id: j.id, afetados: j.afetados, categoria });
    } finally {
      setSalvando(false);
    }
  }

  const op = (t: Tipo, rotulo: string) => (
    <label key={t} className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${tipo === t ? 'border-accent' : 'border-border'}`}>
      <input type="radio" name="alcance" checked={tipo === t} onChange={() => setTipo(t)} /> {rotulo}
    </label>
  );

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm">{lanc.descricao || '—'}</div>
        <div className="text-xs text-muted">{dataBR(lanc.data)} · <span className="tnum money">{brl(lanc.valor)}</span></div>
        <div className="mt-1 text-xs text-faint">{`Agora: ${traduzCategoria(lanc.categoria)} (${ORIGEM[lanc.origem]})`}</div>
      </div>

      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria"
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50" />
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {opcoes.map((g) => (
          <div key={g.nome}>
            <div className="text-[11px] text-muted">{g.nome}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {g.cats.map((c) => (
                <button key={`${g.nome}-${c}`} type="button" onClick={() => setCategoria(c)}
                  className={`min-h-[36px] rounded-lg px-2.5 text-xs ${categoria === c ? 'bg-accent text-base' : 'bg-surface-2 text-muted'}`}>
                  {traduzCategoria(c)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        {op('lancamento', 'Só este lançamento')}
        {lanc.temDoc && lanc.nomeContraparte && op('doc', `Todos de ${lanc.nomeContraparte}`)}
        {op('texto', 'Todos com o texto')}
        {tipo === 'texto' && (
          <input value={texto} onChange={(e) => setTexto(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50" />
        )}
      </div>

      {previa && categoria && (
        <p className="text-xs text-muted">
          {`Muda ${previa.afetados} lançamento${previa.afetados === 1 ? '' : 's'}`}
          {previa.afetados > 0 && ` (${Object.entries(previa.porCategoria).map(([c, n]) => `${n} de ${traduzCategoria(c)}`).join(', ')})`}
          {` → ${traduzCategoria(categoria)}`}
        </p>
      )}
      {erro && <p className="text-xs text-despesa">{erro}</p>}

      <button type="button" disabled={!categoria || salvando || !!erro} onClick={salvar}
        className="min-h-[44px] w-full rounded-lg bg-accent text-sm font-medium text-base disabled:opacity-50">
        {salvando ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}

/** Folha que sobe do rodapé no celular (janela no computador): busca o lançamento e mostra o formulário. */
export function FolhaCategoria({ id, onFechar }: { id: string; onFechar: () => void }) {
  const router = useRouter();
  const [lanc, setLanc] = useState<LancCorrigir | null>(null);
  const [feito, setFeito] = useState<{ id: number; afetados: number; categoria: string } | null>(null);
  useEffect(() => { fetch(`/api/lancamentos/${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then(setLanc); }, [id]);

  async function desfazer() {
    if (!feito) return;
    await fetch(`/api/categorias/${feito.id}`, { method: 'DELETE' });
    router.refresh();
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onFechar}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 md:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <b className="text-sm">Mudar categoria</b>
          <button onClick={onFechar} aria-label="Fechar" className="grid h-11 w-11 place-items-center text-faint"><X size={18} /></button>
        </div>
        {feito ? (
          <div className="space-y-3 text-sm">
            <p>{`Feito: ${feito.afetados} lançamento${feito.afetados === 1 ? '' : 's'} agora em ${traduzCategoria(feito.categoria)}.`}</p>
            <div className="flex gap-2">
              <button onClick={desfazer} className="min-h-[44px] flex-1 rounded-lg bg-surface-2 text-sm">Desfazer</button>
              <button onClick={onFechar} className="min-h-[44px] flex-1 rounded-lg bg-accent text-sm text-base">Ok</button>
            </div>
          </div>
        ) : lanc ? (
          <FormCategoria lanc={lanc} onSalvo={(r) => { setFeito(r); router.refresh(); }} />
        ) : (
          <p className="text-sm text-muted">Carregando…</p>
        )}
      </div>
    </div>
  );
}
```

> "Desfazer" apaga a regra recém-criada; se ela **substituiu** uma regra da mesma chave, desfazer volta ao banco/outra regra (não restaura a categoria antiga da regra substituída). Registrar no ledger como limitação conhecida.

- [ ] **Step 4: `BotaoCorrigir.tsx`**:

```tsx
'use client';
import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { FolhaCategoria } from './FolhaCategoria';

/** Envolve uma linha de lançamento: tocar abre a folha "Mudar categoria". */
export function BotaoCorrigir({ id, children }: { id: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center gap-2 text-left" aria-label="Mudar categoria">
        <span className="min-w-0 flex-1">{children}</span>
        <Pencil size={13} className="shrink-0 text-faint" />
      </button>
      {aberto && <FolhaCategoria id={id} onFechar={() => setAberto(false)} />}
    </>
  );
}
```

  - `CategoryAccordion.tsx`: cada item (`g.items.map`) passa a ser `<BotaoCorrigir id={it.id}>{conteúdo atual da linha}</BotaoCorrigir>` (a `div` da linha vira o filho; manter `px-3.5 py-2.5`, altura ≥ 44px).
  - `buscar/page.tsx`: cada linha de `res.map` envolvida em `<BotaoCorrigir id={l.id}>…</BotaoCorrigir>`.

- [ ] **Step 5: `ListaRegras.tsx`** (`'use client'`) e `regras/page.tsx`:

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { traduzCategoria } from '@/lib/format';
import type { RegraListada } from '@/lib/queries';

const TIPO = { lancamento: 'Só um lançamento', doc: 'Pessoa/empresa', texto: 'Texto' } as const;

export function ListaRegras({ regras }: { regras: RegraListada[] }) {
  const router = useRouter();
  async function apagar(r: RegraListada) {
    if (!confirm(`Apagar? ${r.afetados} lançamento(s) voltam para a categoria do banco (ou de outra regra).`)) return;
    await fetch(`/api/categorias/${r.id}`, { method: 'DELETE' });
    router.refresh();
  }
  if (regras.length === 0) return <div className="card text-sm text-muted">Nenhuma regra criada pelo painel ainda. Toque num lançamento em Gastos ou Buscar para corrigir.</div>;
  return (
    <div className="card divide-y divide-border/60 p-0">
      {regras.map((r) => (
        <div key={r.id} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm">{r.nome}</div>
            <div className="text-[11px] text-muted">{`${TIPO[r.tipo]} → ${traduzCategoria(r.categoria)} · ${r.afetados} lançamentos · ${r.criadoEm}`}</div>
          </div>
          <button onClick={() => apagar(r)} className="min-h-[44px] shrink-0 px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
    </div>
  );
}
```

```tsx
// src/app/regras/page.tsx
import { listarRegras } from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { ListaRegras } from '../components/ListaRegras';

export const dynamic = 'force-dynamic';

export default async function Regras() {
  return (
    <div>
      <PageTitle title="Regras de categoria" subtitle="O que foi corrigido pelo painel. Apagar devolve os lançamentos para a categoria do banco." />
      <ListaRegras regras={await listarRegras()} />
    </div>
  );
}
```

- [ ] **Step 6:** testes do Step 1 → PASS; `tsc`, suíte, `build`. **Step 7: prévia local** (cópia dos dados com a migração 006 aplicada): no celular — Gastos → abrir categoria → tocar lançamento → folha; escolher categoria; prévia; salvar; desfazer; Buscar → mesmo; `/regras` lista e apaga; lançamento sem documento mostra duas opções; conferir no HTML da folha que nenhum documento aparece. **Step 8: commit** — `feat(categorias): folha mudar categoria e tela de regras (F4)`.

---

### Task 5: Verificação final e deploy

- [ ] Suíte com integração, `tsc`, `build`, `build:worker`; varredura de valores/documentos no diff e nas mensagens; revisão final independente.
- [ ] Produção, nesta ordem (confirmar permissões com `\dp financas_lancamentos` antes):
  1. backup: `pg_dump -t financas_lancamentos` para `/root/n8n-docker/backups/f4_lancamentos_antes_<data>.sql.gz` (fora das janelas 16h–16h40 e 22h–22h40);
  2. migração 006 numa cópia (banco descartável com o dump) → contagem `categoria_banco = categoria` em 100%;
  3. migração 006 em produção; mesma contagem;
  4. worker: `docker tag finance-worker:1 finance-worker:pre-f4`, build `--target worker`, `docker exec finance-worker node worker.js transacoes --dry-run` → 0 alterados; `compose up -d --force-recreate finance-worker`;
  5. painel: `/root/finance-dash.bak-pre-f4`, build, recreate; rotas em 200 (`/`, `/gastos`, `/buscar?q=pix`, `/regras`, `/api/lancamentos/<id real>` sem documento na resposta).
- [ ] Push e PR com base `feat/f3-trilha`.
