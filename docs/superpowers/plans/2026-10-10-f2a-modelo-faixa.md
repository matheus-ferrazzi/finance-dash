# F2a — Débito com tendência e faixa de incerteza: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Previsão dos próximos meses com o débito estimado pela regra que menos erra no passado, uma faixa "8 em 10" calibrada nos erros reais, e as três decisões prontas (sai do vermelho, cabe a compra, sobra por mês).

**Architecture:** Regras novas em funções puras (`src/lib/debito.ts`, `src/lib/faixa.ts`, `src/lib/decisoes.ts`); o banco entra por consultas novas em `src/lib/queries.ts` (`getDebitoMensal`, `getRealizado`, `getCalibracao`). O teste contra o passado (`scripts/backtest.ts`) é ampliado para 12 meses × 3 horizontes × 4 regras e decide a regra. A tela atual de Previsão, a home e `/api/previsao` só passam a mostrar os números novos.

**Tech Stack:** Next.js 14, TypeScript, `pg`, Vitest 3, esbuild (scripts).

**Spec:** `docs/superpowers/specs/2026-10-10-f2a-modelo-faixa-design.md`

## Global Constraints

- Nenhuma dependência nova.
- Repositório público: nenhum valor real em reais, CPF/CNPJ ou nome de terceiro em código, teste, comentário ou commit. Resultados do teste contra o passado vão para o vault, nunca para o repo.
- Critério do estimador (verbatim da spec): "fica o candidato com o menor erro absoluto médio do saldo do mês no horizonte 1, desde que nenhuma medida (componente × horizonte 1, 2, 3) fique pior que a do estimador atual".
- Faixa: percentis 10 e 90 do erro do saldo do mês no horizonte 1; mês k à frente: `saldoProjetado_k + p·√k`; mês em andamento: `fechaCom + p·(diasRestantes/diasNoMes)`.
- Calibração com menos de 6 meses → sem faixa; decisões usam só o provável.
- Cobertura aceita: entre 70% e 90%.
- Testes: `npx vitest run`; integração com `TEST_DATABASE_URL` (Postgres descartável em 127.0.0.1:55432, banco `personal_hub_db`).
- Commits via `git commit -F`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisão de plano (registrada no ledger na execução)

A spec manda validar a cobertura da faixa nos meses avaliados. Calibrar e medir a cobertura nos **mesmos** meses dá ~80% por construção e não prova nada. A validação usa **calibração fora da amostra**: para cada mês M avaliado, a faixa é calibrada só com os meses anteriores a M (mínimo 6) e se verifica se o real de M cai nela, nos horizontes 1, 2 e 3. Custo se errado: nenhum — é estritamente mais exigente que a leitura literal.

## Review Focus

1. **Histórico com mês sem nenhum débito** (conta nova, mês vazio) → o mês conta como 0 na média, não some e não desloca a janela. (Task 1, Task 2)
2. **Projeção que nunca sai do vermelho no horizonte** → "não sai em 24 meses", sem erro; e projeção que sai e volta a entrar não conta como saída. (Task 6)
3. **Compra num cenário que já estava negativo** → não acusa "fura" por um mês que já estava negativo sem a compra; informa o mês mais negativo. (Task 6)
4. **Calibração indisponível** (menos de 6 meses, erro de consulta) → tela, home e API seguem funcionando sem faixa e dizem o motivo. (Task 5, Task 7)
5. **Último dia do mês** → faixa do mês em andamento com largura 0 (nada mais a errar), sem divisão por zero. (Task 4)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/debito.ts` (novo) | `RegraDebito`, `REGRA_DEBITO`, `estimarDebito` |
| `src/lib/faixa.ts` (novo) | `percentil`, `calibrar`, `faixaMes`, `faixaMesCorrente` |
| `src/lib/decisoes.ts` (novo) | `saiDoVermelho`, `compraCabe`, `sobraPorMes` |
| `src/lib/backtest.ts` | + `resumirErros`, `cobertura` |
| `src/lib/queries.ts` | + `getDebitoMensal`, `getRealizado`, `getCalibracao`; `getProjecaoBase` usa `estimarDebito`; `getPrevisaoResumo` com faixa |
| `scripts/backtest.ts` | 12 meses × 3 horizontes × 4 regras + cobertura fora da amostra |
| `src/app/previsibilidade/page.tsx`, `PrevisibilidadeClient.tsx`, `ProjecaoPainel.tsx`, `SimuladorCompra.tsx` | linha "sai do vermelho", coluna "pior caso", veredito do simulador |
| `src/app/page.tsx`, `src/app/components/LinhaDoMes.tsx` | "entre X e Y" na home |

---

### Task 1: Estimador do débito (puro)

**Files:**
- Create: `src/lib/debito.ts`
- Test: `test/lib/debito.test.ts`

**Interfaces:**
- Produces:
  - `type RegraDebito = 'confiaveis' | 'media3' | 'ponderada6' | 'mediana3'`
  - `interface MesDebito { mes: string; livre: number; fixo: number }` (mes `AAAA-MM`, meses fechados em ordem crescente)
  - `estimarDebito(meses: MesDebito[], regra: RegraDebito, confiaveis?: string[]): { livre: number; fixo: number }`
  - `const REGRA_DEBITO: RegraDebito` (começa `'confiaveis'`; a Task 3 decide)

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/debito.test.ts
import { describe, expect, it } from 'vitest';
import { estimarDebito, type MesDebito } from '../../src/lib/debito';

const m = (mes: string, livre: number, fixo = 0): MesDebito => ({ mes, livre, fixo });
const seis = [m('2026-04', 600, 60), m('2026-05', 500, 50), m('2026-06', 400, 40), m('2026-07', 300, 30), m('2026-08', 200, 20), m('2026-09', 100, 10)];

describe('estimarDebito', () => {
  it('media3: média dos 3 últimos meses', () => {
    expect(estimarDebito(seis, 'media3')).toEqual({ livre: 200, fixo: 20 });
  });
  it('mediana3: mediana dos 3 últimos', () => {
    expect(estimarDebito([...seis.slice(0, 5), m('2026-09', 900, 90)], 'mediana3')).toEqual({ livre: 300, fixo: 30 });
  });
  it('ponderada6: peso cai pela metade a cada mês para trás', () => {
    // pesos 1, 1/2, 1/4, 1/8, 1/16, 1/32 do mais recente ao mais antigo
    const w = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
    const esperado = [100, 200, 300, 400, 500, 600].reduce((s, v, i) => s + v * w[i], 0) / w.reduce((a, b) => a + b, 0);
    expect(estimarDebito(seis, 'ponderada6').livre).toBeCloseTo(esperado, 6);
  });
  it('confiaveis: média só dos meses da lista', () => {
    expect(estimarDebito(seis, 'confiaveis', ['2026-04', '2026-09'])).toEqual({ livre: 350, fixo: 35 });
  });
  it('mês sem débito conta como 0; menos meses que a janela usa os que houver; nenhum mês dá 0', () => {
    expect(estimarDebito([m('2026-08', 0), m('2026-09', 300)], 'media3')).toEqual({ livre: 150, fixo: 0 });
    expect(estimarDebito([], 'ponderada6')).toEqual({ livre: 0, fixo: 0 });
    expect(estimarDebito(seis, 'confiaveis', [])).toEqual({ livre: 0, fixo: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/debito.test.ts`
Expected: FAIL — "Failed to load url ../../src/lib/debito".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/debito.ts
// Quanto sai no débito num mês futuro. A regra é escolhida pelo teste contra o passado (F2a):
// o gasto vem caindo e a média dos "meses confiáveis" não acompanha.
export type RegraDebito = 'confiaveis' | 'media3' | 'ponderada6' | 'mediana3';
export interface MesDebito { mes: string; livre: number; fixo: number }

/** Regra em uso. Decidida pelo teste contra o passado (scripts/backtest.ts); resultado no vault. */
export const REGRA_DEBITO: RegraDebito = 'confiaveis';

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function estimarDebito(meses: MesDebito[], regra: RegraDebito, confiaveis: string[] = []): { livre: number; fixo: number } {
  const ord = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const aplica = (f: (xs: number[]) => number, ms: MesDebito[]) => ({ livre: r2(f(ms.map((x) => x.livre))), fixo: r2(f(ms.map((x) => x.fixo))) });
  if (regra === 'confiaveis') return aplica(media, ord.filter((x) => confiaveis.includes(x.mes)));
  if (regra === 'media3') return aplica(media, ord.slice(-3));
  if (regra === 'mediana3') return aplica(mediana, ord.slice(-3));
  // ponderada6: o mais recente pesa 1, o anterior 1/2, …
  const ult = ord.slice(-6).reverse();
  const pesos = ult.map((_, i) => 0.5 ** i);
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!soma) return { livre: 0, fixo: 0 };
  return {
    livre: r2(ult.reduce((s, x, i) => s + x.livre * pesos[i], 0) / soma),
    fixo: r2(ult.reduce((s, x, i) => s + x.fixo * pesos[i], 0) / soma),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/debito.test.ts` → PASS (5 testes). Atenção: `toBeCloseTo` cobre o arredondamento a 2 casas da ponderada; se falhar só pela 3ª casa, comparar com `toBeCloseTo(esperado, 1)` e registrar no ledger.

- [ ] **Step 5: Commit** — `feat(debito): estimador do debito por regra (F2a)` com `src/lib/debito.ts` e o teste.

---

### Task 2: Débito mensal do banco e `getProjecaoBase` pela regra

**Files:**
- Modify: `src/lib/queries.ts` (bloco `varRows` de `getProjecaoBase`, ~linhas 726–760; assinatura de `getProjecaoBase`)
- Test: `test/integracao/previsao.test.ts`

**Interfaces:**
- Consumes: `estimarDebito`, `RegraDebito`, `REGRA_DEBITO`, `MesDebito` (Task 1)
- Produces:
  - `getDebitoMensal(resp: Resp, hoje: string, n = 6): Promise<MesDebito[]>` — os `n` meses fechados antes do mês de `hoje`, **todos presentes** (mês sem lançamento = 0), livre × travado (`FIXO_DEBITO_CATS`), fora casa (`CASA_CATS`), sem espelho (`SEM_ESPELHO`), só `classe='despesa'` e `forma_pagamento='Débito'`.
  - `getProjecaoBase(resp, hoje = currentDateSP(), opcoes: { regraDebito?: RegraDebito } = {})` — `despesaVariavelMediaMensal`/`despesaFixaDebitoMedia` vêm de `estimarDebito(await getDebitoMensal(resp, hoje), opcoes.regraDebito ?? REGRA_DEBITO, mesesConfiaveis.map((d) => d.slice(0, 7)))`.

- [ ] **Step 1: Write the failing test** (acrescentar em `test/integracao/previsao.test.ts`, usando a pessoa `Ariane` e o ano 2029 para não colidir com dados de outros testes)

```ts
it('débito mensal: 6 meses fechados, mês vazio = 0, livre × travado, sem espelho; a regra muda a média', async () => {
  await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
    ('dm-1', '2029-04-10', 600, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-04-10'),
    ('dm-2', '2029-06-10', 300, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-06-10'),
    ('dm-3', '2029-06-11', 50, 'seguro', 'Insurance', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-06-11'),
    ('dm-4', '2029-07-10', 900, 'MORA CARTAO DE CREDITO', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-07-10'),
    ('dm-5', '2029-08-10', 100, 'mercado', 'Groceries', 'Crédito', 'X', 'Ariane', 'despesa', 'Saída', '2029-08-10'),
    ('dm-6', '2029-09-10', 150, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-09-10')`);
  const meses = await queries.getDebitoMensal('Ariane', '2029-10-15');
  expect(meses).toEqual([
    { mes: '2029-04', livre: 600, fixo: 0 }, { mes: '2029-05', livre: 0, fixo: 0 }, { mes: '2029-06', livre: 300, fixo: 50 },
    { mes: '2029-07', livre: 0, fixo: 0 }, { mes: '2029-08', livre: 0, fixo: 0 }, { mes: '2029-09', livre: 150, fixo: 0 },
  ]);
  const b = await queries.getProjecaoBase('Ariane', '2029-10-15', { regraDebito: 'media3' });
  expect(b.despesaVariavelMediaMensal).toBe(50); // (0 + 0 + 150) / 3
});
```

- [ ] **Step 2: Run to verify it fails** — `TEST_DATABASE_URL=… npx vitest run test/integracao/previsao.test.ts` → FAIL "getDebitoMensal is not a function".

- [ ] **Step 3: Implement**

Em `src/lib/queries.ts`, importar `estimarDebito, REGRA_DEBITO, type MesDebito, type RegraDebito` de `./debito` e acrescentar, antes de `getProjecaoBase`:

```ts
/** Débito dos `n` meses fechados antes do mês de `hoje`: livre × travado, fora casa e espelhos; mês vazio = 0. */
export async function getDebitoMensal(resp: Resp, hoje: string, n = 6): Promise<MesDebito[]> {
  const r = rf(resp, 5);
  const rows = await q<any>(
    `WITH ms AS (
       SELECT to_char(generate_series(date_trunc('month', $1::date) - ($2::int || ' months')::interval,
                                      date_trunc('month', $1::date) - interval '1 month', interval '1 month'), 'YYYY-MM') AS mes)
     SELECT ms.mes,
            COALESCE(SUM(l.valor) FILTER (WHERE NOT (l.categoria = ANY($4::text[]))), 0)::float8 AS livre,
            COALESCE(SUM(l.valor) FILTER (WHERE l.categoria = ANY($4::text[])), 0)::float8 AS fixo
     FROM ms LEFT JOIN financas_lancamentos l
       ON to_char(l.data_lancamento, 'YYYY-MM') = ms.mes
      AND l.classe = 'despesa' AND l.forma_pagamento = 'Débito'
      AND NOT (l.categoria = ANY($3::text[]))
      AND ${SEM_ESPELHO}${r.sql}
     GROUP BY ms.mes ORDER BY ms.mes`,
    [hoje, n, CASA_CATS, FIXO_DEBITO_CATS, ...r.p],
  );
  return rows.map((x) => ({ mes: x.mes, livre: Math.round(Number(x.livre) * 100) / 100, fixo: Math.round(Number(x.fixo) * 100) / 100 }));
}
```

> `SEM_ESPELHO` e o filtro de pessoa (`rf`) usam `descricao` e `responsavel` sem prefixo; dentro do `ON` do `LEFT JOIN` isso não é ambíguo (só `financas_lancamentos` tem essas colunas), e o filtro no `ON` mantém os meses vazios com 0.

Em `getProjecaoBase`: assinatura `(resp: Resp, hoje: string = currentDateSP(), opcoes: { regraDebito?: RegraDebito } = {})`; trocar o uso de `varRows[0]?.media` / `media_fixo` por:

```ts
const debito = estimarDebito(await getDebitoMensal(resp, hoje), opcoes.regraDebito ?? REGRA_DEBITO, meses.map((d) => d.slice(0, 7)));
// …
despesaVariavelMediaMensal: debito.livre,
despesaFixaDebitoMedia: debito.fixo,
```

e remover a consulta `varRows` que ficou sem uso.

**Equivalência:** com `REGRA_DEBITO = 'confiaveis'` o número muda só se a média antiga ignorava mês sem lançamento (AVG sobre grupos). Rodar o backtest atual (`scripts/backtest.ts`, versão de antes da Task 3) na VPS antes e depois desta task: as linhas devem ser iguais; se diferirem, explicar no ledger (mês confiável sem débito).

- [ ] **Step 4: Run** — integração e suíte: `TEST_DATABASE_URL=… npx vitest run` → PASS.
- [ ] **Step 5: Commit** — `feat(previsao): debito mensal do banco e estimador por regra (F2a)`.

---

### Task 3: Teste contra o passado ampliado e escolha da regra

**Files:**
- Modify: `src/lib/backtest.ts`, `src/lib/queries.ts` (+ `getRealizado`), `scripts/backtest.ts`, `src/lib/debito.ts` (`REGRA_DEBITO`)
- Test: `test/lib/backtest.test.ts`

**Interfaces:**
- Produces:
  - `getRealizado(mes: string): Promise<Componentes>` (move a função `realizado` do script para `queries.ts`, sem mudar a SQL)
  - `interface LinhaErro { regra: string; horizonte: number; mes: string; erros: Componentes }`
  - `resumirErros(linhas: LinhaErro[]): { regra: string; horizonte: number; comp: keyof Componentes; mae: number; vies: number }[]`
  - `escolherRegra(resumo, atual = 'confiaveis'): { regra: string; motivo: string }` — aplica o critério da spec

- [ ] **Step 1: Write the failing test**

```ts
// acrescentar em test/lib/backtest.test.ts
import { escolherRegra, resumirErros } from '../../src/lib/backtest';

describe('resumo e escolha da regra', () => {
  const e = (receita: number, debito: number, saldo: number) => ({ receita, debito, casa: 0, fatura: 0, saldo });
  const linhas = [
    { regra: 'confiaveis', horizonte: 1, mes: '2026-08', erros: e(0, 100, -100) },
    { regra: 'confiaveis', horizonte: 1, mes: '2026-09', erros: e(0, 300, -300) },
    { regra: 'media3', horizonte: 1, mes: '2026-08', erros: e(0, 50, -50) },
    { regra: 'media3', horizonte: 1, mes: '2026-09', erros: e(0, -50, 50) },
  ];
  it('erro absoluto médio e viés por regra × horizonte × componente', () => {
    const r = resumirErros(linhas);
    expect(r.find((x) => x.regra === 'confiaveis' && x.comp === 'saldo')).toMatchObject({ mae: 200, vies: -200 });
    expect(r.find((x) => x.regra === 'media3' && x.comp === 'saldo')).toMatchObject({ mae: 50, vies: 0 });
  });
  it('escolhe a de menor erro no saldo h1 se nenhuma medida piorar; senão fica a atual', () => {
    expect(escolherRegra(resumirErros(linhas)).regra).toBe('media3');
    const piora = [...linhas, { regra: 'media3', horizonte: 2, mes: '2026-09', erros: e(999, 0, 0) },
      { regra: 'confiaveis', horizonte: 2, mes: '2026-09', erros: e(0, 0, 0) }];
    expect(escolherRegra(resumirErros(piora)).regra).toBe('confiaveis');
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/lib/backtest.test.ts` → FAIL "resumirErros is not a function".

- [ ] **Step 3: Implement** em `src/lib/backtest.ts`:

```ts
export interface LinhaErro { regra: string; horizonte: number; mes: string; erros: Componentes }
const COMPS: (keyof Componentes)[] = ['receita', 'debito', 'casa', 'fatura', 'saldo'];
const r2 = (x: number) => Math.round(x * 100) / 100;

export function resumirErros(linhas: LinhaErro[]) {
  const grupos = new Map<string, LinhaErro[]>();
  for (const l of linhas) grupos.set(`${l.regra}|${l.horizonte}`, [...(grupos.get(`${l.regra}|${l.horizonte}`) ?? []), l]);
  return [...grupos.entries()].flatMap(([k, ls]) => {
    const [regra, h] = k.split('|');
    return COMPS.map((comp) => ({
      regra, horizonte: Number(h), comp,
      mae: r2(ls.reduce((s, l) => s + Math.abs(l.erros[comp]), 0) / ls.length),
      vies: r2(ls.reduce((s, l) => s + l.erros[comp], 0) / ls.length),
    }));
  });
}

/** Critério da spec: menor erro do saldo no horizonte 1, sem piorar nenhuma medida da regra atual. */
export function escolherRegra(resumo: ReturnType<typeof resumirErros>, atual = 'confiaveis'): { regra: string; motivo: string } {
  const de = (regra: string) => resumo.filter((x) => x.regra === regra);
  const base = de(atual);
  const mae = (regra: string) => de(regra).find((x) => x.horizonte === 1 && x.comp === 'saldo')?.mae ?? Infinity;
  const candidatas = [...new Set(resumo.map((x) => x.regra))].filter((r) => r !== atual)
    .filter((r) => base.every((b) => (de(r).find((x) => x.horizonte === b.horizonte && x.comp === b.comp)?.mae ?? Infinity) <= b.mae))
    .sort((a, b) => mae(a) - mae(b));
  if (!candidatas.length) return { regra: atual, motivo: 'nenhuma candidata sem piorar alguma medida' };
  return { regra: candidatas[0], motivo: `saldo h1 ${mae(atual)} -> ${mae(candidatas[0])}` };
}
```

Mover `realizado()` de `scripts/backtest.ts` para `queries.ts` como `export async function getRealizado(mes: string): Promise<Componentes>` (mesma SQL; `import type { Componentes } from './backtest'`).

- [ ] **Step 4: Reescrever `scripts/backtest.ts`**

```ts
// Teste contra o passado, na VPS: 12 meses fechados × horizontes 1-3 × regras do débito.
//   docker cp dist/backtest.js finance-dashboard:/tmp/backtest.js && docker exec finance-dashboard node /tmp/backtest.js
// Imprime só agregados (erro médio e viés), nunca lançamentos. Resultado vai para o vault.
import { componentesPrevistos, escolherRegra, resumirErros, type LinhaErro } from '../src/lib/backtest';
import { pool } from '../src/lib/db';
import { currentDateSP } from '../src/lib/format';
import { addMonths, diasNoMes } from '../src/lib/previsao';
import { computeProjecao, getProjecaoBase, getRealizado } from '../src/lib/queries';
import type { RegraDebito } from '../src/lib/debito';

const REGRAS: RegraDebito[] = ['confiaveis', 'media3', 'ponderada6', 'mediana3'];
const vespera = (mes: string) => { const a = addMonths(mes, -1); return `${a}-${String(diasNoMes(a)).padStart(2, '0')}`; };

async function main() {
  const atual = currentDateSP().slice(0, 7);
  const meses = Array.from({ length: 12 }, (_, i) => addMonths(atual, -(12 - i)));
  const real = new Map(await Promise.all(meses.map(async (m) => [m, await getRealizado(m)] as const)));
  const linhas: LinhaErro[] = [];
  for (const regra of REGRAS) for (const h of [1, 2, 3]) for (const mes of meses) {
    const hoje = vespera(addMonths(mes, -(h - 1)));
    const proj = computeProjecao(await getProjecaoBase('casal', hoje, { regraDebito: regra }), h, hoje);
    const p = componentesPrevistos(proj[h]);
    const r = real.get(mes)!;
    linhas.push({ regra, horizonte: h, mes, erros: { receita: p.receita - r.receita, debito: p.debito - r.debito, casa: p.casa - r.casa, fatura: p.fatura - r.fatura, saldo: p.saldo - r.saldo } });
  }
  const resumo = resumirErros(linhas);
  console.log('regra       h  componente   erro_medio   vies');
  for (const x of resumo) console.log(`${x.regra.padEnd(11)} ${x.horizonte}  ${x.comp.padEnd(10)} ${String(Math.round(x.mae)).padStart(10)} ${String(Math.round(x.vies)).padStart(7)}`);
  const esc = escolherRegra(resumo);
  console.log(`\nescolhida: ${esc.regra} (${esc.motivo})`);
  console.log(JSON.stringify({ errosSaldoH1: linhas.filter((l) => l.regra === esc.regra && l.horizonte === 1).map((l) => ({ mes: l.mes, e: Math.round(l.erros.saldo) })) }));
  await pool.end();
}
main();
```

O `JSON` final (erros do saldo por mês, horizonte 1, regra escolhida) alimenta a Task 4 (cobertura fora da amostra) — é dado agregado de previsão, impresso só no terminal da VPS, nunca commitado.

- [ ] **Step 5: Rodar na VPS e decidir**

```bash
npm run build:worker   # gera dist/backtest.js
scp dist/backtest.js vps-financas:/tmp/ && ssh vps-financas 'docker cp /tmp/backtest.js finance-dashboard:/tmp/backtest.js && docker exec finance-dashboard node /tmp/backtest.js'
```

Expected: tabela com 4 regras × 3 horizontes × 5 componentes e a linha `escolhida: …`.
Atualizar `REGRA_DEBITO` em `src/lib/debito.ts` para a escolhida (se for `confiaveis`, não muda). Copiar a tabela para o vault (`Projetos/Finanças - Roadmap 2026-10.md`, item F2a). Registrar no ledger: `Task 3: Ruling: regra = X — <motivo impresso> — custo se errado: previsão dos próximos meses com o erro da tabela`.

- [ ] **Step 6: Commit** — `feat(backtest): 12 meses x 3 horizontes x regras do debito; regra escolhida (F2a)` (mensagem sem números em reais).

---

### Task 4: Faixa (pura)

**Files:**
- Create: `src/lib/faixa.ts`
- Test: `test/lib/faixa.test.ts`

**Interfaces:**
- Produces:
  - `interface Calibracao { p10: number; p90: number; n: number; calculadaEm: string }`
  - `percentil(xs: number[], p: number): number` (interpolação linear, p em 0..100)
  - `calibrar(erros: number[], calculadaEm: string): Calibracao | null` — `null` com menos de 6; erros são `previsto − real`, então o pior caso usa **`-p90`** (previsão otimista demais) e o melhor caso **`-p10`**
  - `faixaMes(saldoProjetado: number, k: number, c: Calibracao | null): { piorCaso: number; melhorCaso: number }`
  - `faixaMesCorrente(fechaCom: number, diasRestantes: number, diasNoMes: number, c: Calibracao | null): { piorCaso: number; melhorCaso: number }`

> Sinal: com erro = previsto − real, um erro positivo (p90) significa que a previsão estava **acima** do real; o pior caso para o saldo é `projetado − p90·√k`, o melhor é `projetado − p10·√k`. A spec escreve `+p10`/`+p90` pensando em erro = real − previsto; o resultado é o mesmo.

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/faixa.test.ts
import { describe, expect, it } from 'vitest';
import { calibrar, faixaMes, faixaMesCorrente, percentil } from '../../src/lib/faixa';

describe('faixa', () => {
  it('percentil com interpolação linear', () => {
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10)).toBeCloseTo(2);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 90)).toBeCloseTo(10);
  });
  it('calibrar: menos de 6 erros = sem faixa', () => {
    expect(calibrar([1, 2, 3, 4, 5], '2026-10-10')).toBeNull();
    expect(calibrar([0, 0, 0, 0, 0, 100, -100], '2026-10-10')).toMatchObject({ n: 7 });
  });
  it('mês k: pior caso = projetado − p90·√k; melhor = projetado − p10·√k', () => {
    const c = { p10: -200, p90: 300, n: 12, calculadaEm: 'x' };
    expect(faixaMes(1000, 1, c)).toEqual({ piorCaso: 700, melhorCaso: 1200 });
    expect(faixaMes(1000, 4, c)).toEqual({ piorCaso: 400, melhorCaso: 1400 });
    expect(faixaMes(1000, 4, null)).toEqual({ piorCaso: 1000, melhorCaso: 1000 });
  });
  it('mês em andamento: proporcional aos dias que faltam; último dia = largura 0', () => {
    const c = { p10: -200, p90: 300, n: 12, calculadaEm: 'x' };
    expect(faixaMesCorrente(1000, 15, 30, c)).toEqual({ piorCaso: 850, melhorCaso: 1100 });
    expect(faixaMesCorrente(1000, 0, 31, c)).toEqual({ piorCaso: 1000, melhorCaso: 1000 });
  });
});
```

- [ ] **Step 2: Run** → FAIL "Failed to load url ../../src/lib/faixa".

- [ ] **Step 3: Implement**

```ts
// src/lib/faixa.ts
// Faixa "8 em 10" da previsão (F2a): percentis 10 e 90 do erro do saldo do mês (previsto − real)
// no teste contra o passado. Mês k à frente abre por √k (o erro de cada mês arrasta os seguintes).
export interface Calibracao { p10: number; p90: number; n: number; calculadaEm: string }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (p / 100) * (s.length - 1), i = Math.floor(pos), f = pos - i;
  return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i];
}

export function calibrar(erros: number[], calculadaEm: string): Calibracao | null {
  if (erros.length < 6) return null;
  return { p10: r2(percentil(erros, 10)), p90: r2(percentil(erros, 90)), n: erros.length, calculadaEm };
}

export function faixaMes(saldoProjetado: number, k: number, c: Calibracao | null) {
  if (!c) return { piorCaso: saldoProjetado, melhorCaso: saldoProjetado };
  const f = Math.sqrt(Math.max(1, k));
  return { piorCaso: r2(saldoProjetado - c.p90 * f), melhorCaso: r2(saldoProjetado - c.p10 * f) };
}

export function faixaMesCorrente(fechaCom: number, diasRestantes: number, diasNoMes: number, c: Calibracao | null) {
  if (!c || diasNoMes <= 0) return { piorCaso: fechaCom, melhorCaso: fechaCom };
  const f = Math.max(0, diasRestantes) / diasNoMes;
  return { piorCaso: r2(fechaCom - c.p90 * f), melhorCaso: r2(fechaCom - c.p10 * f) };
}
```

- [ ] **Step 4: Run** → PASS (4 testes).

- [ ] **Step 5: Cobertura fora da amostra (validação da spec)** — acrescentar ao fim de `main()` em `scripts/backtest.ts`:

```ts
// cobertura fora da amostra: para cada mês M, calibra só com os meses anteriores (mín. 6) da regra escolhida
const { calibrar: cal, faixaMes: fx } = await import('../src/lib/faixa');
let dentro = 0, total = 0;
for (const h of [1, 2, 3]) for (const [i, mes] of meses.entries()) {
  const anteriores = linhas.filter((l) => l.regra === esc.regra && l.horizonte === 1 && meses.indexOf(l.mes) < i).map((l) => l.erros.saldo);
  const c = cal(anteriores, mes);
  if (!c) continue;
  const l = linhas.find((x) => x.regra === esc.regra && x.horizonte === h && x.mes === mes)!;
  const r = real.get(mes)!.saldo, previsto = r + l.erros.saldo;
  const f = fx(previsto, h, c);
  total++; if (r >= f.piorCaso && r <= f.melhorCaso) dentro++;
}
console.log(`cobertura fora da amostra: ${dentro}/${total} = ${total ? Math.round((100 * dentro) / total) : 0}% (aceite: 70% a 90%)`);
```

Rodar na VPS (mesmo comando da Task 3). Expected: cobertura entre 70% e 90%. Fora disso: **parar e registrar** (ledger + vault) — a forma da faixa (√k, percentis) está errada para estes dados e a decisão volta para o Matheus antes de seguir.

- [ ] **Step 6: Commit** — `feat(faixa): faixa 8 em 10 calibrada no passado e cobertura fora da amostra (F2a)`.

---

### Task 5: Calibração no painel (`getCalibracao`)

**Files:**
- Modify: `src/lib/queries.ts`
- Test: `test/integracao/calibracao.test.ts` (novo)

**Interfaces:**
- Consumes: `getProjecaoBase` com regra (Task 2), `getRealizado` (Task 3), `componentesPrevistos` (backtest.ts), `calibrar` (Task 4), `REGRA_DEBITO`
- Produces: `getCalibracao(hoje = currentDateSP()): Promise<Calibracao | null>` — erros do saldo no horizonte 1 dos 12 meses fechados (casal, `REGRA_DEBITO`); cache em memória por 24 h (chave = data de `hoje`); qualquer erro de consulta devolve `null` e registra `console.error` (sem lançar).

- [ ] **Step 1: Write the failing test**

```ts
// test/integracao/calibracao.test.ts
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getCalibracao (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => { await pool?.end(); await (await import('../../src/lib/db')).pool.end(); });

  it('sem histórico suficiente: null (a tela segue sem faixa)', async () => {
    expect(await queries.getCalibracao('2030-06-15')).toBeNull();
  });

  it('com 12 meses de histórico: p10 ≤ p90 e n = 12; segunda chamada no mesmo dia vem do cache', async () => {
    const vals: string[] = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(Date.UTC(2031, i, 5)).toISOString().slice(0, 10);
      vals.push(`('cr-${i}', '${d}', ${3000 + (i % 3) * 100}, 'salario', 'Salary', 'Débito', 'X', 'Matheus', 'receita', 'Entrada', '${d}')`);
      vals.push(`('cd-${i}', '${d}', ${1000 + (i % 4) * 150}, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '${d}')`);
    }
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES ${vals.join(',')}`);
    const c = await queries.getCalibracao('2032-06-15');
    expect(c).not.toBeNull();
    expect(c!.n).toBe(12);
    expect(c!.p10).toBeLessThanOrEqual(c!.p90);
    expect(await queries.getCalibracao('2032-06-15')).toBe(c); // mesmo objeto: cache
  });
});
```

- [ ] **Step 2: Run** → FAIL "getCalibracao is not a function".

- [ ] **Step 3: Implement** (em `src/lib/queries.ts`; importar `calibrar, type Calibracao` de `./faixa` e `componentesPrevistos` de `./backtest`)

```ts
const cacheCalib = new Map<string, Calibracao | null>();

/** Faixa da previsão: erros do saldo (h1, casal, regra em uso) nos 12 meses fechados. Cache de 1 dia. */
export async function getCalibracao(hoje: string = currentDateSP()): Promise<Calibracao | null> {
  if (cacheCalib.has(hoje)) return cacheCalib.get(hoje)!;
  let c: Calibracao | null = null;
  try {
    const atual = hoje.slice(0, 7);
    const erros: number[] = [];
    for (let i = 12; i >= 1; i--) {
      const mes = addMonths(atual, -i);
      const ant = addMonths(mes, -1);
      const vesp = `${ant}-${String(diasNoMes(ant)).padStart(2, '0')}`;
      const proj = computeProjecao(await getProjecaoBase('casal', vesp, { regraDebito: REGRA_DEBITO }), 1, vesp);
      const real = await getRealizado(mes);
      if (real.receita === 0 && real.debito === 0) continue; // mês sem dado não calibra
      erros.push(componentesPrevistos(proj[1]).saldo - real.saldo);
    }
    c = calibrar(erros, hoje);
  } catch (e) {
    console.error('calibração da faixa falhou', e);
  }
  cacheCalib.clear();
  cacheCalib.set(hoje, c);
  return c;
}
```

(`addMonths`, `diasNoMes` já vêm de `./previsao`.)

- [ ] **Step 4: Run** → PASS. Se o segundo teste ficar lento (> 20 s), registrar o tempo no ledger: é o custo da primeira chamada em produção.
- [ ] **Step 5: Commit** — `feat(previsao): calibracao da faixa com cache diario (F2a)`.

---

### Task 6: Decisões prontas (puras)

**Files:**
- Create: `src/lib/decisoes.ts`
- Test: `test/lib/decisoes.test.ts`

**Interfaces:**
- Consumes: `ProjecaoMes` (`src/lib/previsao.ts`), `Calibracao`, `faixaMes` (Task 4)
- Produces:
  - `saiDoVermelho(projecao: ProjecaoMes[], c: Calibracao | null): { provavel: string | null; piorCaso: string | null }`
  - `compraCabe(projecao: ProjecaoMes[], c: Calibracao | null, valorParcela: number, parcelas: number): { cabe: boolean; mesQueFura: string | null; maisNegativo: string | null }`
  - `sobraPorMes(projecao: ProjecaoMes[], c: Calibracao | null): { mes: string; provavel: number; piorCaso: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/decisoes.test.ts
import { describe, expect, it } from 'vitest';
import { compraCabe, saiDoVermelho, sobraPorMes } from '../../src/lib/decisoes';

const proj = (saldos: number[]) => saldos.map((s, i) => ({ mes: `2027-${String(i + 1).padStart(2, '0')}`, saldoProjetado: s, saldo: i ? s - saldos[i - 1] : s }) as any);
const c = { p10: -100, p90: 100, n: 12, calculadaEm: 'x' };

describe('saiDoVermelho', () => {
  it('primeiro mês que fica ≥ 0 e continua; pior caso mais tarde', () => {
    expect(saiDoVermelho(proj([-500, -200, 50, 300, 600]), c)).toEqual({ provavel: '2027-03', piorCaso: '2027-04' });
  });
  it('sai e volta a entrar não conta; nunca sai = null', () => {
    expect(saiDoVermelho(proj([-100, 50, -20, 80, 90]), null).provavel).toBe('2027-04');
    expect(saiDoVermelho(proj([-500, -400, -300]), c)).toEqual({ provavel: null, piorCaso: null });
  });
  it('já está positivo desde o mês 0', () => {
    expect(saiDoVermelho(proj([100, 200]), null).provavel).toBe('2027-01');
  });
});

describe('compraCabe', () => {
  it('cabe quando nenhum mês fica negativo pelo pior caso', () => {
    expect(compraCabe(proj([500, 2000, 4000]), c, 100, 2)).toMatchObject({ cabe: true, mesQueFura: null });
  });
  it('fura no primeiro mês que estava ≥ 0 e passa a < 0', () => {
    expect(compraCabe(proj([500, 300, 900]), c, 300, 3)).toMatchObject({ cabe: false, mesQueFura: '2027-02' });
  });
  it('mês já negativo sem a compra não é culpa da compra; informa o mais negativo', () => {
    const r = compraCabe(proj([500, -800, -300, 2000]), c, 50, 1);
    expect(r).toMatchObject({ cabe: true, mesQueFura: null, maisNegativo: '2027-02' });
  });
});

describe('sobraPorMes', () => {
  it('sobra provável e pior caso de cada mês futuro (sem o mês 0)', () => {
    expect(sobraPorMes(proj([0, 300, 500]), c)).toEqual([
      { mes: '2027-02', provavel: 300, piorCaso: 200 }, { mes: '2027-03', provavel: 200, piorCaso: 100 },
    ]);
  });
});
```

- [ ] **Step 2: Run** → FAIL "Failed to load url ../../src/lib/decisoes".

- [ ] **Step 3: Implement**

```ts
// src/lib/decisoes.ts
// As três decisões do F2a sobre a projeção: quando sai do vermelho, se cabe uma compra, quanto sobra por mês.
// "Pior caso" = limite de baixo da faixa 8 em 10; sem calibração, pior caso = provável.
import type { ProjecaoMes } from './previsao';
import { faixaMes, type Calibracao } from './faixa';

const baixo = (p: ProjecaoMes[], c: Calibracao | null) => p.map((m, k) => (k === 0 ? m.saldoProjetado : faixaMes(m.saldoProjetado, k, c).piorCaso));

function primeiroQueFica(saldos: number[], meses: string[]): string | null {
  for (let i = 0; i < saldos.length; i++) if (saldos.slice(i).every((s) => s >= 0)) return meses[i];
  return null;
}

export function saiDoVermelho(projecao: ProjecaoMes[], c: Calibracao | null) {
  const meses = projecao.map((m) => m.mes);
  return {
    provavel: primeiroQueFica(projecao.map((m) => m.saldoProjetado), meses),
    piorCaso: primeiroQueFica(baixo(projecao, c), meses),
  };
}

export function compraCabe(projecao: ProjecaoMes[], c: Calibracao | null, valorParcela: number, parcelas: number) {
  const sem = baixo(projecao, c);
  const com = sem.map((s, i) => s - valorParcela * Math.min(i + 1, Math.max(1, parcelas)));
  const fura = com.findIndex((s, i) => s < 0 && sem[i] >= 0);
  let maisNeg: number | null = null;
  com.forEach((s, i) => { if (s < 0 && (maisNeg === null || s < com[maisNeg])) maisNeg = i; });
  return {
    cabe: fura === -1,
    mesQueFura: fura === -1 ? null : projecao[fura].mes,
    maisNegativo: maisNeg === null ? null : projecao[maisNeg].mes,
  };
}

export function sobraPorMes(projecao: ProjecaoMes[], c: Calibracao | null) {
  return projecao.slice(1).map((m) => ({
    mes: m.mes, provavel: m.saldo,
    piorCaso: c ? Math.round((m.saldo - c.p90) * 100) / 100 : m.saldo,
  }));
}
```

- [ ] **Step 4: Run** → PASS (7 testes).
- [ ] **Step 5: Commit** — `feat(decisoes): sai do vermelho, cabe a compra, sobra por mes (F2a)`.

---

### Task 7: Mostrar no painel e na API

**Files:**
- Modify: `src/lib/queries.ts` (`PrevisaoResumo`, `getPrevisaoResumo`), `src/app/previsibilidade/page.tsx`, `src/app/components/PrevisibilidadeClient.tsx`, `src/app/components/ProjecaoPainel.tsx`, `src/app/components/SimuladorCompra.tsx`, `src/app/page.tsx`, `src/app/components/LinhaDoMes.tsx`
- Test: `test/lib/decisoes.test.ts` (texto do veredito), checagem visual

**Interfaces:**
- Consumes: `getCalibracao` (Task 5), `faixaMes`, `faixaMesCorrente` (Task 4), `saiDoVermelho`, `compraCabe` (Task 6)
- Produces:
  - `PrevisaoResumo` + `faixa: { piorCaso: number; melhorCaso: number; n: number } | null`, `saiDoVermelho: { provavel: string | null; piorCaso: string | null }`, `proximosMeses[].piorCaso: number`
  - `textoVeredito(r: ReturnType<typeof compraCabe>, mesLabel: (m: string) => string): string` em `src/lib/decisoes.ts`

- [ ] **Step 1: Teste do texto do veredito (falha primeiro)**

```ts
// acrescentar em test/lib/decisoes.test.ts
import { textoVeredito } from '../../src/lib/decisoes';
it('texto do veredito do simulador', () => {
  const ml = (m: string) => m;
  expect(textoVeredito({ cabe: true, mesQueFura: null, maisNegativo: null }, ml)).toBe('Cabe: nenhum mês vai para o vermelho por causa dela, nem pelo pior caso.');
  expect(textoVeredito({ cabe: false, mesQueFura: '2027-02', maisNegativo: '2027-02' }, ml)).toBe('Não cabe: pelo pior caso, 2027-02 vai para o vermelho por causa dela.');
  expect(textoVeredito({ cabe: true, mesQueFura: null, maisNegativo: '2027-03' }, ml)).toBe('Cabe, mas 2027-03 já estava no vermelho sem ela.');
});
```

Run → FAIL; implementar em `src/lib/decisoes.ts`:

```ts
export function textoVeredito(r: { cabe: boolean; mesQueFura: string | null; maisNegativo: string | null }, mesLabel: (m: string) => string): string {
  if (!r.cabe && r.mesQueFura) return `Não cabe: pelo pior caso, ${mesLabel(r.mesQueFura)} vai para o vermelho por causa dela.`;
  if (r.maisNegativo) return `Cabe, mas ${mesLabel(r.maisNegativo)} já estava no vermelho sem ela.`;
  return 'Cabe: nenhum mês vai para o vermelho por causa dela, nem pelo pior caso.';
}
```

Run → PASS.

- [ ] **Step 2: API** — em `getPrevisaoResumo`: `const calib = await getCalibracao();` projeção com horizonte 24 (`computeProjecao(base, 24)`), e no retorno:

```ts
faixa: calib ? { ...faixaMesCorrente(atual.saldoProjetado, ritmo.diasRestantes, diasNoMes(atual.mes), calib), n: calib.n } : null,
saiDoVermelho: saiDoVermelho(proj, calib),
proximosMeses: proj.slice(1, 7).map((m, i) => ({ mesLabel: m.mesLabel, saldo: m.saldo, saldoProjetado: m.saldoProjetado, piorCaso: faixaMes(m.saldoProjetado, i + 1, calib).piorCaso })),
```

(acrescentar os campos na interface `PrevisaoResumo`; `proximosMeses` continua com 6 itens, como hoje.)

- [ ] **Step 3: Tela de Previsão**
  - `previsibilidade/page.tsx`: buscar `getCalibracao()` junto e passar `calib` ao `PrevisibilidadeClient`.
  - `PrevisibilidadeClient`: abaixo do bloco "Fechamento de …", uma linha:
    ```tsx
    <p className="mt-2 text-sm text-muted">
      {sai.provavel ? <>Sai do vermelho em <b className="text-text">{mesLabel(sai.provavel)}</b></> : <>Não sai do vermelho em {projecao.length} meses</>}
      {calib && sai.piorCaso !== sai.provavel && <> (pelo pior caso, {sai.piorCaso ? mesLabel(sai.piorCaso) : `não sai em ${projecao.length} meses`})</>}
      {!calib && <> · sem faixa: histórico curto para calibrar</>}
    </p>
    ```
    com `const sai = saiDoVermelho(projecao, calib);`.
  - `ProjecaoPainel`: prop `calib: Calibracao | null`; nova coluna "pior caso" depois de "saldo projetado", com `faixaMes(m.saldoProjetado, indice, calib).piorCaso` (índice = posição em `projecao`; a linha do mês em andamento usa `faixaMesCorrente` não é necessária na tabela — mostrar "—" nela).
  - `SimuladorCompra`: receber `calib`; abaixo do resultado atual, `textoVeredito(compraCabe(projecao, calib, valorParcela, n), mesLabel)`.

- [ ] **Step 4: Home** — em `page.tsx`, quando o mês é o corrente: `const calib = await getCalibracao();` e `const fx = calib ? faixaMesCorrente(serie.fechamento, ritmo?.diasRestantes ?? 0, diasNoMes(mes), calib) : null;`; passar `faixa={fx}` ao `LinhaDoMes`, que mostra abaixo do valor: `<div className="text-right text-[11px] text-muted">entre <span className="money">{brl(fx.piorCaso)}</span> e <span className="money">{brl(fx.melhorCaso)}</span></div>` quando `faixa` vier.

- [ ] **Step 5: Verificar** — `npx tsc --noEmit -p . && npx vitest run && npm run build` → ok. Prévia local (cópia dos dados reais só na máquina): Previsão mostra a linha "sai do vermelho", a coluna "pior caso" e o veredito do simulador; home mostra "entre X e Y"; `/api/previsao` traz `faixa`, `saiDoVermelho`, `proximosMeses[].piorCaso`. Com calibração nula (forçar via banco local vazio): nada quebra e aparece "sem faixa".

- [ ] **Step 6: Commit** — `feat(previsao): faixa, sai do vermelho e veredito do simulador na tela e na API (F2a)`.

---

### Task 8: Verificação final e deploy

- [ ] **Step 1:** suíte completa com integração, `tsc`, `build`.
- [ ] **Step 2:** varredura do que vai para o repo público (mesmos comandos do F1: nenhum `R$ <número>`, nenhum número de 11/14 dígitos no diff e nas mensagens).
- [ ] **Step 3:** backtest final na VPS (tabela + escolhida + cobertura) e cópia para o vault.
- [ ] **Step 4:** deploy do painel (cópia em `/root/finance-dash.bak-pre-f2a`), rotas em 200, `/api/previsao` com `faixa` e `saiDoVermelho`, fechamento da home igual ao `fechaCom`; medir o tempo da primeira chamada de `/api/previsao` depois do deploy (calibração fria).
- [ ] **Step 5:** push e PR com base `feat/f1-home`, descrição sem valores.
