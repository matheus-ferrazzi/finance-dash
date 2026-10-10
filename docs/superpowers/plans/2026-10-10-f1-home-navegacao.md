# F1 — Home e navegação: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home que responde "como o mês vai fechar" (linha do mês + grade 2×2), onde cada número leva à tela já filtrada pela URL, com barra nova no celular e aviso de versão nova.

**Architecture:** Evolução do app Next.js 14 existente, sem biblioteca nova. Regras novas ficam em funções puras testadas (`src/lib/links.ts`, `src/lib/linhaDoMes.ts`, `src/lib/home.ts`, `categoriaNoFiltro` em `src/lib/grupos.ts`); páginas e componentes só montam e desenham. A home reaproveita as funções de previsão, contas, gastos e faturas que já estão no ar.

**Tech Stack:** Next.js 14 (App Router, Server Components), React 18, TypeScript, Tailwind, lucide-react, `pg`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-10-f1-home-navegacao-design.md`

## Global Constraints

- Nenhuma dependência nova no `package.json`.
- Repositório público: nenhum valor real em reais, CPF/CNPJ, id de conta ou nome de terceiro em código, teste, comentário ou mensagem de commit. Exemplos de teste são fictícios.
- Links nunca levam valor em reais nem dado pessoal — só filtro (`resp`, `mes`, `grupo`, `cartao`, `tipo`).
- Parâmetro com valor padrão é omitido do link (`resp=casal`, mês atual).
- Toda página continua `export const dynamic = 'force-dynamic'`.
- Mês sempre `AAAA-MM`; dia `AAAA-MM-DD`; fuso America/Sao_Paulo (`currentDateSP`, `currentMonthSP` de `src/lib/format.ts`).
- Texto mínimo 11px no celular; área de toque ≥ 40px.
- Commits: mensagem por arquivo (`git commit -F`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Testes: `npx vitest run` (unitário); integração com `TEST_DATABASE_URL` apontando para Postgres descartável (`docker run --rm -d --name pg-teste-c1 -e POSTGRES_PASSWORD=teste -p 127.0.0.1:55432:5432 postgres:16`, depois `CREATE DATABASE personal_hub_db`).

## Review Focus

1. **Mês passado escolhido na home** → linha toda cheia (sem tracejado), título "Fechou em" com o saldo do último dia; Ritmo mostra "—" com "mês fechado". (Task 3, Task 4)
2. **Hoje é o último dia do mês** → nenhum ponto futuro, sem divisão por zero; fechamento = saldo de hoje + receitas que ainda entram hoje − o que ainda sai. (Task 3)
3. **Receita prevista com dia típico já passado** (salário atrasado) → entra amanhã na linha, não some. (Task 3)
4. **Pessoa sem cartão, mês sem contas cadastradas, mês sem despesa** → bloco mostra "—" e uma linha curta do porquê; a grade não muda de forma. (Task 4)
5. **Filtro inválido na URL** (`grupo=xyz`, `cartao` que a pessoa não tem, `mes=2026-13`) → tela abre sem o filtro, sem erro. (Task 1, Task 2)

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/links.ts` (novo) | `linkPara`, `podeIrParaMesSeguinte`, `mesValido` |
| `src/lib/grupos.ts` | + `categoriaNoFiltro`, `GRUPOS_VALIDOS` |
| `src/lib/linhaDoMes.ts` (novo) | `serieDoMes` (pontos da linha do mês) |
| `src/lib/home.ts` (novo) | `topGrupos`, `cartaoDestaque`, `contasResumo` |
| `src/lib/queries.ts` | + `getMovimentosDiarios` |
| `src/lib/versao.ts` (novo) | `lerVersao`, `versaoMudou` |
| `src/app/api/versao/route.ts` (novo) | devolve a versão do build |
| `src/app/page.tsx` | home nova |
| `src/app/components/LinhaDoMes.tsx` (novo) | desenha a série em SVG |
| `src/app/components/BlocoHome.tsx` (novo) | um quadrado da grade |
| `src/app/components/Nav.tsx` | barra nova, folha "Mais", sidebar |
| `src/app/components/PeriodPicker.tsx` | atalhos só em Gastos; mês seguinte por tela |
| `src/app/components/VersaoAviso.tsx` (novo) | faixa "versão nova" |
| `src/app/layout.tsx` | tira o ⋯ do topo; inclui `VersaoAviso` |
| `src/app/gastos/page.tsx` | filtros `grupo` e `tipo` |
| `src/app/faturas/page.tsx`, `src/app/components/FaturaCard.tsx` | filtro `cartao` |
| `src/app/previsibilidade/page.tsx`, `PrevisibilidadeClient.tsx`, `ProjecaoPainel.tsx` | filtro `mes` (destaque) |

---

### Task 1: `linkPara` e regras de mês

**Files:**
- Create: `src/lib/links.ts`
- Test: `test/lib/links.test.ts`

**Interfaces:**
- Produces:
  - `type Tela = 'inicio' | 'previsao' | 'contas' | 'gastos' | 'faturas' | 'diagnostico' | 'assinaturas' | 'investimentos' | 'orcamento' | 'casa' | 'buscar'`
  - `interface Filtros { resp?: 'casal' | 'Matheus' | 'Ariane'; mes?: string; grupo?: string; cartao?: string; tipo?: 'livre' }`
  - `linkPara(tela: Tela, filtros?: Filtros, mesAtual?: string): string`
  - `podeIrParaMesSeguinte(path: string): boolean`
  - `mesValido(v: string | undefined): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/links.test.ts
import { describe, expect, it } from 'vitest';
import { linkPara, mesValido, podeIrParaMesSeguinte } from '../../src/lib/links';

describe('linkPara', () => {
  it('cada tela tem seu caminho', () => {
    expect(linkPara('inicio')).toBe('/');
    expect(linkPara('previsao')).toBe('/previsibilidade');
    expect(linkPara('contas')).toBe('/contas');
    expect(linkPara('buscar')).toBe('/buscar');
  });
  it('omite padrão: casal e mês atual', () => {
    expect(linkPara('contas', { resp: 'casal', mes: '2026-10' }, '2026-10')).toBe('/contas');
    expect(linkPara('contas', { resp: 'Ariane', mes: '2026-09' }, '2026-10')).toBe('/contas?resp=Ariane&mes=2026-09');
  });
  it('codifica acento e espaço', () => {
    expect(linkPara('gastos', { grupo: 'Comer fora' })).toBe('/gastos?grupo=Comer+fora');
    expect(linkPara('gastos', { grupo: 'Dívida e seguro' })).toBe('/gastos?grupo=D%C3%ADvida+e+seguro');
  });
  it('ordem fixa dos parâmetros e só os conhecidos', () => {
    expect(linkPara('faturas', { cartao: 'Nubank', resp: 'Matheus', valor: 10 } as any)).toBe('/faturas?resp=Matheus&cartao=Nubank');
  });
  it('mês inválido é ignorado', () => {
    expect(linkPara('contas', { mes: '2026-13' }, '2026-10')).toBe('/contas');
  });
});

describe('mês', () => {
  it('mesValido aceita AAAA-MM com mês 01..12', () => {
    expect(mesValido('2026-09')).toBe('2026-09');
    expect(mesValido('2026-13')).toBeNull();
    expect(mesValido('09/2026')).toBeNull();
    expect(mesValido(undefined)).toBeNull();
  });
  it('mês seguinte só em Contas e Previsão', () => {
    expect(podeIrParaMesSeguinte('/contas')).toBe(true);
    expect(podeIrParaMesSeguinte('/previsibilidade')).toBe(true);
    expect(podeIrParaMesSeguinte('/')).toBe(false);
    expect(podeIrParaMesSeguinte('/gastos')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/links.test.ts`
Expected: FAIL — "Failed to load url ../../src/lib/links".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/links.ts
// Links do painel: a mesma função serve o site e o bot (projeto D). Link só leva filtro, nunca valor.
import { currentMonthSP } from './format';

export type Tela = 'inicio' | 'previsao' | 'contas' | 'gastos' | 'faturas' | 'diagnostico' | 'assinaturas'
  | 'investimentos' | 'orcamento' | 'casa' | 'buscar';

export interface Filtros {
  resp?: 'casal' | 'Matheus' | 'Ariane'; mes?: string; grupo?: string; cartao?: string; tipo?: 'livre';
}

const CAMINHO: Record<Tela, string> = {
  inicio: '/', previsao: '/previsibilidade', contas: '/contas', gastos: '/gastos', faturas: '/faturas',
  diagnostico: '/diagnostico', assinaturas: '/assinaturas', investimentos: '/investimentos',
  orcamento: '/orcamento', casa: '/casa', buscar: '/buscar',
};

export function mesValido(v: string | undefined): string | null {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export function linkPara(tela: Tela, f: Filtros = {}, mesAtual: string = currentMonthSP()): string {
  const p = new URLSearchParams();
  if (f.resp && f.resp !== 'casal') p.set('resp', f.resp);
  const mes = mesValido(f.mes);
  if (mes && mes !== mesAtual) p.set('mes', mes);
  if (f.grupo) p.set('grupo', f.grupo);
  if (f.cartao) p.set('cartao', f.cartao);
  if (f.tipo === 'livre') p.set('tipo', 'livre');
  const qs = p.toString();
  return CAMINHO[tela] + (qs ? `?${qs}` : '');
}

/** Planejar o mês que vem só faz sentido onde há o que planejar. */
export function podeIrParaMesSeguinte(path: string): boolean {
  return path === '/contas' || path === '/previsibilidade';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/links.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/links.ts test/lib/links.test.ts
git commit -F .git/MSG.txt   # "feat(links): linkPara e regras de mes (F1)"
```

---

### Task 2: Telas de destino entendem os filtros

**Files:**
- Modify: `src/lib/grupos.ts` (fim do arquivo)
- Modify: `src/app/gastos/page.tsx`
- Modify: `src/app/faturas/page.tsx`, `src/app/components/FaturaCard.tsx`
- Modify: `src/app/previsibilidade/page.tsx`, `src/app/components/PrevisibilidadeClient.tsx`, `src/app/components/ProjecaoPainel.tsx`
- Test: `test/lib/grupos.test.ts`

**Interfaces:**
- Consumes: `linkPara`, `mesValido` (Task 1)
- Produces:
  - `GRUPOS_VALIDOS: string[]` (nomes de `GRUPOS_GASTO` + `'Resto'`)
  - `categoriaNoFiltro(cat: string, f: { grupo?: string | null; tipo?: string | null }): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// acrescentar em test/lib/grupos.test.ts
import { categoriaNoFiltro } from '../../src/lib/grupos';

describe('categoriaNoFiltro', () => {
  it('grupo: só categorias do grupo; Resto = sem grupo', () => {
    expect(categoriaNoFiltro('Groceries', { grupo: 'Mercado' })).toBe(true);
    expect(categoriaNoFiltro('Eating out', { grupo: 'Mercado' })).toBe(false);
    expect(categoriaNoFiltro('Transfer - PIX', { grupo: 'Resto' })).toBe(true);
    expect(categoriaNoFiltro('Groceries', { grupo: 'Resto' })).toBe(false);
  });
  it('tipo=livre tira Casa e Dívida e seguro', () => {
    expect(categoriaNoFiltro('Housing', { tipo: 'livre' })).toBe(false);
    expect(categoriaNoFiltro('Consortium', { tipo: 'livre' })).toBe(false);
    expect(categoriaNoFiltro('Groceries', { tipo: 'livre' })).toBe(true);
  });
  it('filtro desconhecido é ignorado', () => {
    expect(categoriaNoFiltro('Groceries', { grupo: 'xyz' })).toBe(true);
    expect(categoriaNoFiltro('Housing', { tipo: 'outro' })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/grupos.test.ts`
Expected: FAIL — "categoriaNoFiltro is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// fim de src/lib/grupos.ts
export const GRUPOS_VALIDOS: string[] = [...GRUPOS_GASTO.map((g) => g.nome), 'Resto'];

/** Filtro de Gastos vindo da URL (?grupo= / ?tipo=livre). Valor desconhecido não filtra. */
export function categoriaNoFiltro(cat: string, f: { grupo?: string | null; tipo?: string | null }): boolean {
  const g = grupoDaCategoria(cat);
  if (f.grupo && GRUPOS_VALIDOS.includes(f.grupo)) {
    if (f.grupo === 'Resto' ? g !== null : g?.nome !== f.grupo) return false;
  }
  if (f.tipo === 'livre' && g && (g.nome === 'Casa' || g.nome === 'Dívida e seguro')) return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/grupos.test.ts`
Expected: PASS.

- [ ] **Step 5: Gastos usa os filtros**

Em `src/app/gastos/page.tsx`:
- `searchParams` ganha `grupo?: string; tipo?: string`.
- Logo depois de buscar `despesas`: `const filtradas = despesas.filter((d) => categoriaNoFiltro(d.categoria, { grupo: searchParams.grupo, tipo: searchParams.tipo }));` e usar `filtradas` no lugar de `despesas` no mapa de categorias e nos totais.
- `const filtroAtivo = (searchParams.grupo && GRUPOS_VALIDOS.includes(searchParams.grupo)) ? searchParams.grupo : searchParams.tipo === 'livre' ? 'Gasto livre (sem casa e dívidas)' : null;`
- Abaixo do `PageTitle`, se `filtroAtivo`:

```tsx
<div className="mb-3 flex items-center gap-2">
  <span className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">{filtroAtivo}</span>
  <Link href={linkPara('gastos', { resp, mes: searchParams.mes })} className="text-xs text-muted hover:text-text" aria-label="Limpar filtro">× limpar</Link>
</div>
```

(importar `Link` de `next/link`, `linkPara` de `@/lib/links`, `categoriaNoFiltro, GRUPOS_VALIDOS` de `@/lib/grupos`; `resp` já existe como `Resp`.)

- [ ] **Step 6: Faturas abre o cartão pedido**

Em `src/app/components/FaturaCard.tsx`: assinatura `FaturaCard({ f, abertoInicial = false }: { f: FaturaView; abertoInicial?: boolean })` e `useState(abertoInicial)`.

Em `src/app/faturas/page.tsx`: `searchParams: { resp?: string; cartao?: string }`; depois de montar `views`:

```ts
const pedido = searchParams.cartao;
const ordenadas = pedido && views.some((v) => v.banco === pedido)
  ? [...views.filter((v) => v.banco === pedido), ...views.filter((v) => v.banco !== pedido)]
  : views;
```

e renderizar `ordenadas.map((v) => <FaturaCard key={v.id} f={v} abertoInicial={v.banco === pedido} />)`.

- [ ] **Step 7: Previsão destaca o mês pedido**

- `src/app/previsibilidade/page.tsx`: `searchParams: { resp?: string; mes?: string }`; passar `mesFoco={mesValido(searchParams.mes)}` ao `PrevisibilidadeClient`.
- `PrevisibilidadeClient`: prop `mesFoco?: string | null`; horizonte inicial `Math.max(6, projecao.findIndex((m) => m.mes === mesFoco) + 1)`; repassar `mesFoco` ao `ProjecaoPainel`.
- `ProjecaoPainel`: prop `mesFoco?: string | null`; na `<tr key={m.mes}>` acrescentar `className={m.mes === mesFoco ? 'bg-accent/10' : undefined}`.

- [ ] **Step 8: Verificar e commitar**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: sem erro de tipo; todos os testes passam.

```bash
git add src/lib/grupos.ts test/lib/grupos.test.ts src/app/gastos/page.tsx src/app/faturas/page.tsx src/app/components/FaturaCard.tsx src/app/previsibilidade/page.tsx src/app/components/PrevisibilidadeClient.tsx src/app/components/ProjecaoPainel.tsx
git commit -F .git/MSG.txt   # "feat(filtros): Gastos por grupo/livre, Faturas por cartao, Previsao por mes (F1)"
```

---

### Task 3: Série da linha do mês

**Files:**
- Create: `src/lib/linhaDoMes.ts`
- Modify: `src/lib/queries.ts` (+ `getMovimentosDiarios`, perto de `getContasDoMes`)
- Test: `test/lib/linhaDoMes.test.ts`, `test/integracao/movimentos.test.ts`

**Interfaces:**
- Produces:
  - `interface PontoLinha { dia: number; saldo: number; futuro: boolean }`
  - `interface SerieMes { pontos: PontoLinha[]; fechamento: number; passado: boolean }`
  - `serieDoMes(e: { mes: string; hoje: string; saldoHoje: number; movimentos: Record<string, number>; receitas: { dia: number; valor: number }[]; aindaSai: number }): SerieMes`
  - `getMovimentosDiarios(resp: Resp, desde: string, hoje?: string): Promise<Record<string, number>>` — líquido por dia (entrada +, saída −), débito, `desde ≤ data ≤ hoje`.

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/linhaDoMes.test.ts
import { describe, expect, it } from 'vitest';
import { serieDoMes } from '../../src/lib/linhaDoMes';

const base = { mes: '2026-10', hoje: '2026-10-10', saldoHoje: 1000, movimentos: {}, receitas: [], aindaSai: 0 };

describe('serieDoMes', () => {
  it('passado: desfaz os movimentos depois de cada dia até chegar no saldo de hoje', () => {
    const s = serieDoMes({ ...base, movimentos: { '2026-10-05': -300, '2026-10-08': 500 } });
    const at = (d: number) => s.pontos.find((p) => p.dia === d)!.saldo;
    expect(at(10)).toBe(1000);
    expect(at(8)).toBe(1000);
    expect(at(7)).toBe(500);
    expect(at(4)).toBe(800);
    expect(at(1)).toBe(800);
  });

  it('futuro: receita sobe no seu dia, o que sai desce por igual; último ponto = fechamento', () => {
    const s = serieDoMes({ ...base, receitas: [{ dia: 20, valor: 2100 }], aindaSai: 2100 });
    expect(s.pontos.filter((p) => p.futuro)).toHaveLength(21);
    expect(s.pontos.at(-1)!.dia).toBe(31);
    expect(s.fechamento).toBeCloseTo(1000);
    expect(s.pontos.at(-1)!.saldo).toBeCloseTo(s.fechamento);
    expect(s.pontos.find((p) => p.dia === 20)!.saldo - s.pontos.find((p) => p.dia === 19)!.saldo).toBeCloseTo(2000);
  });

  it('receita com dia já passado (atrasada) entra amanhã', () => {
    const s = serieDoMes({ ...base, receitas: [{ dia: 5, valor: 300 }] });
    expect(s.pontos.find((p) => p.dia === 11)!.saldo).toBe(1300);
    expect(s.fechamento).toBe(1300);
  });

  it('hoje é o último dia: sem futuro, sem divisão por zero', () => {
    const s = serieDoMes({ ...base, hoje: '2026-10-31', receitas: [{ dia: 31, valor: 50 }], aindaSai: 20 });
    expect(s.pontos.some((p) => p.futuro)).toBe(false);
    expect(s.fechamento).toBe(1030);
  });

  it('mês passado: tudo passado; fechamento = saldo no último dia daquele mês', () => {
    const s = serieDoMes({ ...base, mes: '2026-09', movimentos: { '2026-09-30': -100, '2026-10-02': 400 } });
    expect(s.passado).toBe(true);
    expect(s.pontos).toHaveLength(30);
    expect(s.pontos.some((p) => p.futuro)).toBe(false);
    expect(s.fechamento).toBe(600);
    expect(s.pontos.find((p) => p.dia === 29)!.saldo).toBe(700);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/linhaDoMes.test.ts`
Expected: FAIL — "Failed to load url ../../src/lib/linhaDoMes".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/linhaDoMes.ts
// Saldo em conta do dia 1 ao fim do mês: passado reconstruído do saldo de hoje, futuro pela previsão.
// Por construção o último ponto do mês corrente é o "fecha com" da previsão.
export interface PontoLinha { dia: number; saldo: number; futuro: boolean }
export interface SerieMes { pontos: PontoLinha[]; fechamento: number; passado: boolean }

function diasNoMes(mes: string): number {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
}
const dataDe = (mes: string, dia: number) => `${mes}-${String(dia).padStart(2, '0')}`;

export function serieDoMes(e: {
  mes: string; hoje: string; saldoHoje: number; movimentos: Record<string, number>;
  receitas: { dia: number; valor: number }[]; aindaSai: number;
}): SerieMes {
  const D = diasNoMes(e.mes);
  const mesHoje = e.hoje.slice(0, 7);
  const passado = e.mes < mesHoje;
  const ultimoPassado = passado ? D : Number(e.hoje.slice(8, 10));
  // saldo no fim do dia d = saldo de hoje − movimentos depois de d (até hoje)
  const depoisDe = (data: string) => Object.entries(e.movimentos)
    .filter(([d]) => d > data && d <= e.hoje).reduce((s, [, v]) => s + v, 0);
  const pontos: PontoLinha[] = [];
  for (let d = 1; d <= ultimoPassado; d++) pontos.push({ dia: d, saldo: e.saldoHoje - depoisDe(dataDe(e.mes, d)), futuro: false });
  if (passado) return { pontos, fechamento: pontos.at(-1)!.saldo, passado };

  const hojeDia = ultimoPassado;
  const restantes = D - hojeDia;
  const entradaNoDia = (d: number) => e.receitas.reduce((s, r) => s + (Math.max(r.dia, hojeDia + 1) === d ? r.valor : 0), 0);
  if (restantes === 0) {
    const fechamento = e.saldoHoje + e.receitas.reduce((s, r) => s + r.valor, 0) - e.aindaSai;
    return { pontos, fechamento, passado };
  }
  let saldo = e.saldoHoje;
  for (let d = hojeDia + 1; d <= D; d++) {
    saldo += entradaNoDia(d) - e.aindaSai / restantes;
    pontos.push({ dia: d, saldo, futuro: true });
  }
  return { pontos, fechamento: saldo, passado };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/linhaDoMes.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Teste de integração dos movimentos diários**

```ts
// test/integracao/movimentos.test.ts
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getMovimentosDiarios (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento) VALUES
      ('a', '2026-10-02', 100, 'x', 'Débito', 'B', 'Ariane', 'receita', 'Entrada'),
      ('b', '2026-10-02', 30, 'x', 'Débito', 'B', 'Ariane', 'despesa', 'Saída'),
      ('c', '2026-10-03', 50, 'x', 'Crédito', 'B', 'Ariane', 'despesa', 'Saída'),
      ('d', '2026-10-04', 20, 'x', 'Débito', 'B', 'Matheus', 'despesa', 'Saída'),
      ('e', '2026-10-20', 999, 'x', 'Débito', 'B', 'Ariane', 'despesa', 'Saída')`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => { await pool?.end(); (await import('../../src/lib/db')).pool.end(); });

  it('líquido por dia, só débito, da pessoa, até hoje (agendado não entra)', async () => {
    expect(await queries.getMovimentosDiarios('Ariane', '2026-10-01', '2026-10-10')).toEqual({ '2026-10-02': 70 });
    expect(await queries.getMovimentosDiarios('casal', '2026-10-01', '2026-10-10')).toEqual({ '2026-10-02': 70, '2026-10-04': -20 });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run (com o Postgres descartável no ar): `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run test/integracao/movimentos.test.ts`
Expected: FAIL — "getMovimentosDiarios is not a function".

- [ ] **Step 7: Implementar `getMovimentosDiarios`**

```ts
// src/lib/queries.ts, antes de getBusca
/** Movimento líquido da conta por dia (entrada +, saída −), só débito, de `desde` até `hoje`. */
export async function getMovimentosDiarios(resp: Resp, desde: string, hoje: string = currentDateSP()): Promise<Record<string, number>> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT to_char(data_lancamento,'YYYY-MM-DD') AS dia,
            SUM(CASE WHEN tipo_movimento='Entrada' THEN valor ELSE -valor END)::float8 AS liquido
     FROM financas_lancamentos
     WHERE forma_pagamento='Débito' AND data_lancamento >= $1::date AND data_lancamento <= $2::date${r.sql}
     GROUP BY 1`,
    [desde, hoje, ...r.p],
  );
  return Object.fromEntries(rows.filter((x) => Number(x.liquido) !== 0).map((x) => [x.dia, Math.round(Number(x.liquido) * 100) / 100]));
}
```

- [ ] **Step 8: Run to verify it passes**

Run: o mesmo comando do Step 6.
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/linhaDoMes.ts src/lib/queries.ts test/lib/linhaDoMes.test.ts test/integracao/movimentos.test.ts
git commit -F .git/MSG.txt   # "feat(home): serie da linha do mes e movimentos diarios (F1)"
```

---

### Task 4: Resumo dos blocos

**Files:**
- Create: `src/lib/home.ts`
- Test: `test/lib/home.test.ts`

**Interfaces:**
- Consumes: `GrupoGasto` (`src/lib/grupos.ts`), `Fatura` (`src/lib/queries.ts`), `ItemConta` (`src/lib/contas.ts`)
- Produces:
  - `topGrupos(grupos: GrupoGasto[], n = 3): { nome: string; total: number; pct: number }[]` — `pct` sobre o total de todos os grupos
  - `cartaoDestaque(faturas: Fatura[]): { banco: string; usoPct: number; totalAberto: number } | null` — maior `(limite − disponível)/limite`; `totalAberto` = soma de `valor`; `null` sem cartão
  - `contasResumo(itens: ItemConta[]): { pagas: number; total: number; falta: number } | null` — `null` sem itens

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/home.test.ts
import { describe, expect, it } from 'vitest';
import { cartaoDestaque, contasResumo, topGrupos } from '../../src/lib/home';

describe('blocos da home', () => {
  it('topGrupos: 3 maiores com % sobre o total', () => {
    const g = [['A', 50], ['B', 30], ['C', 15], ['D', 5]].map(([nome, total]) => ({ nome, emoji: '', total, travado: false, pctRenda: 0 })) as any;
    expect(topGrupos(g)).toEqual([{ nome: 'A', total: 50, pct: 50 }, { nome: 'B', total: 30, pct: 30 }, { nome: 'C', total: 15, pct: 15 }]);
    expect(topGrupos([])).toEqual([]);
  });

  it('cartaoDestaque: maior uso do limite; soma das faturas; null sem cartão', () => {
    const f = (banco: string, valor: number, limite: number, disponivel: number) =>
      ({ id: banco, banco, responsavel: 'Ariane', valor, limite, disponivel, vencimento: null, fechamento: null });
    expect(cartaoDestaque([f('X', 100, 1000, 900), f('Y', 50, 200, 40)])).toEqual({ banco: 'Y', usoPct: 80, totalAberto: 150 });
    expect(cartaoDestaque([f('Z', 10, 0, 0)])).toEqual({ banco: 'Z', usoPct: 0, totalAberto: 10 });
    expect(cartaoDestaque([])).toBeNull();
  });

  it('contasResumo: pagas pelo banco, total e quanto falta; null sem contas', () => {
    const i = (status: string, previsto: number, pago: number | null) => ({ status, previsto, pago }) as any;
    expect(contasResumo([i('pago', 100, 100), i('a_confirmar', 50, null), i('falta', 30, null)])).toEqual({ pagas: 1, total: 3, falta: 80 });
    expect(contasResumo([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/home.test.ts`
Expected: FAIL — "Failed to load url ../../src/lib/home".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/home.ts
// O que cada quadrado da home mostra. "—" na tela quando a função devolve null/vazio.
import type { GrupoGasto } from './grupos';
import type { Fatura } from './queries';
import type { ItemConta } from './contas';

export function topGrupos(grupos: GrupoGasto[], n = 3): { nome: string; total: number; pct: number }[] {
  const soma = grupos.reduce((s, g) => s + g.total, 0);
  return [...grupos].sort((a, b) => b.total - a.total).slice(0, n)
    .map((g) => ({ nome: g.nome, total: g.total, pct: soma > 0 ? Math.round((g.total / soma) * 100) : 0 }));
}

export function cartaoDestaque(faturas: Fatura[]): { banco: string; usoPct: number; totalAberto: number } | null {
  if (faturas.length === 0) return null;
  const uso = (f: Fatura) => (f.limite > 0 ? Math.round(((f.limite - f.disponivel) / f.limite) * 100) : 0);
  const top = [...faturas].sort((a, b) => uso(b) - uso(a))[0];
  return { banco: top.banco, usoPct: uso(top), totalAberto: faturas.reduce((s, f) => s + f.valor, 0) };
}

export function contasResumo(itens: ItemConta[]): { pagas: number; total: number; falta: number } | null {
  if (itens.length === 0) return null;
  const falta = itens.filter((i) => i.status !== 'pago').reduce((s, i) => s + i.previsto, 0);
  return { pagas: itens.filter((i) => i.status === 'pago').length, total: itens.length, falta: Math.round(falta * 100) / 100 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/home.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/home.ts test/lib/home.test.ts
git commit -F .git/MSG.txt   # "feat(home): resumo dos blocos (F1)"
```

---

### Task 5: Home nova

**Files:**
- Create: `src/app/components/LinhaDoMes.tsx`, `src/app/components/BlocoHome.tsx`
- Modify: `src/app/page.tsx` (substitui o conteúdo)

**Interfaces:**
- Consumes: `linkPara`, `mesValido` (Task 1); `serieDoMes` (Task 3); `getMovimentosDiarios` (Task 3); `topGrupos`, `cartaoDestaque`, `contasResumo` (Task 4); `getProjecaoBase`, `computeProjecao`, `computeRitmo`, `getContasDoMes`, `getDespesas`, `getFaturas`, `resolvePeriodo` (já existem); `agruparGastos` (já existe).
- Produces: `LinhaDoMes({ serie, titulo, href })`, `BlocoHome({ titulo, valor, detalhe, tom, href, children? })`

- [ ] **Step 1: `BlocoHome`**

```tsx
// src/app/components/BlocoHome.tsx
import Link from 'next/link';

/**
 * Um quadrado da grade da home: título, número, linha de apoio. Com `href`, o quadrado inteiro é o
 * link; sem `href`, os links ficam nos filhos (ex.: um por grupo — link dentro de link não vale no HTML).
 */
export function BlocoHome({ titulo, valor, detalhe, tom = 'neutro', href, children }: {
  titulo: string; valor: string; detalhe?: string; tom?: 'neutro' | 'bom' | 'atencao' | 'ruim'; href?: string; children?: React.ReactNode;
}) {
  const cor = { neutro: 'text-muted', bom: 'text-accent', atencao: 'text-warn', ruim: 'text-despesa' }[tom];
  const classe = 'card flex min-h-[96px] flex-col justify-between p-3.5';
  const corpo = (
    <>
      <div className="text-[11px] text-muted">{titulo}</div>
      <div className="mt-1.5 text-lg font-semibold tnum money">{valor}</div>
      {children}
      {detalhe && <div className={`mt-1 text-[11px] ${cor}`}>{detalhe}</div>}
    </>
  );
  return href
    ? <Link href={href} className={`${classe} transition-colors hover:bg-surface-2/40`}>{corpo}</Link>
    : <div className={classe}>{corpo}</div>;
}
```

- [ ] **Step 2: `LinhaDoMes`**

```tsx
// src/app/components/LinhaDoMes.tsx
import Link from 'next/link';
import { brl } from '@/lib/format';
import type { SerieMes } from '@/lib/linhaDoMes';

const W = 320, H = 110, PAD = 8;

/** Saldo do mês: passado cheio, futuro tracejado, linha do zero, fechamento em destaque. */
export function LinhaDoMes({ serie, titulo, href }: { serie: SerieMes; titulo: string; href: string }) {
  const ps = serie.pontos;
  const dias = ps.length ? ps.at(-1)!.dia : 1;
  const vals = [...ps.map((p) => p.saldo), 0];
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const x = (dia: number) => PAD + ((dia - 1) / Math.max(1, dias - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / amp) * (H - 2 * PAD);
  const linha = (pts: typeof ps) => pts.map((p) => `${x(p.dia).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const passado = ps.filter((p) => !p.futuro);
  const futuro = ps.filter((p) => p.futuro);
  const hoje = passado.at(-1);
  const cor = serie.fechamento >= 0 ? 'text-accent' : 'text-despesa';

  return (
    <Link href={href} className="card mb-3 block p-3.5 transition-colors hover:bg-surface-2/40">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{titulo}</span>
        <span className={`text-xl font-semibold tnum money ${cor}`}>{brl(serie.fechamento)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${titulo} ${brl(serie.fechamento)}`}>
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="3 3" />
        <polyline points={linha(passado)} fill="none" className="stroke-accent" strokeWidth={2.5} />
        {futuro.length > 0 && hoje && (
          <polyline points={linha([hoje, ...futuro])} fill="none" className="stroke-muted" strokeWidth={2} strokeDasharray="5 4" />
        )}
        {hoje && !serie.passado && <circle cx={x(hoje.dia)} cy={y(hoje.saldo)} r={4} className="fill-accent" />}
        {ps.length > 0 && <circle cx={x(ps.at(-1)!.dia)} cy={y(serie.fechamento)} r={4} className={serie.fechamento >= 0 ? 'fill-accent' : 'fill-despesa'} />}
      </svg>
      {hoje && !serie.passado && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>hoje {brl(hoje.saldo)}</span><span>dia {dias}</span>
        </div>
      )}
    </Link>
  );
}
```

- [ ] **Step 3: `page.tsx`**

```tsx
// src/app/page.tsx
import { getContasDoMes, getDespesas, getFaturas, getMovimentosDiarios, getProjecaoBase, computeProjecao, computeRitmo, resolvePeriodo, Resp } from '@/lib/queries';
import { brl, currentDateSP, currentMonthSP } from '@/lib/format';
import { agruparGastos } from '@/lib/grupos';
import { linkPara, mesValido } from '@/lib/links';
import { serieDoMes } from '@/lib/linhaDoMes';
import { cartaoDestaque, contasResumo, topGrupos } from '@/lib/home';
import Link from 'next/link';
import { LinhaDoMes } from './components/LinhaDoMes';
import { BlocoHome } from './components/BlocoHome';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}
const CORES = ['bg-[#7c8cff]', 'bg-accent', 'bg-warn'];

export default async function Home({ searchParams }: { searchParams: { resp?: string; mes?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const atual = currentMonthSP();
  const pedido = mesValido(searchParams.mes);
  const mes = pedido && pedido <= atual ? pedido : atual; // na home não existe mês seguinte
  const corrente = mes === atual;
  const hoje = currentDateSP();

  const [base, contas, despesas, faturas, movimentos] = await Promise.all([
    getProjecaoBase(resp), getContasDoMes(resp, mes), getDespesas(resp, resolvePeriodo(undefined, mes)),
    getFaturas(resp), getMovimentosDiarios(resp, `${mes}-01`, hoje),
  ]);
  const mesProj = computeProjecao(base, 1)[0];
  const ritmo = corrente && mesProj ? computeRitmo(base, mesProj) : null;
  const aindaEntra = corrente ? base.mesCorrente.receitasAReceber.reduce((s, r) => s + r.valor, 0) : 0;
  const serie = serieDoMes({
    mes, hoje, saldoHoje: base.saldoContasAtual, movimentos,
    receitas: corrente ? base.mesCorrente.receitasAReceber.map((r) => ({ dia: r.diaTipico, valor: r.valor })) : [],
    aindaSai: corrente && ritmo ? base.saldoContasAtual + aindaEntra - ritmo.fechaCom : 0,
  });

  const porCat = new Map<string, number>();
  for (const d of despesas) porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + d.valor);
  const grupos = topGrupos(agruparGastos(porCat, 0));
  const cartao = cartaoDestaque(faturas);
  const cr = contasResumo(contas.itens);
  const f = { resp, mes };

  return (
    <div>
      <LinhaDoMes serie={serie} titulo={corrente ? 'Fecha o mês em' : 'Fechou em'} href={linkPara('previsao', f, atual)} />
      <div className="grid grid-cols-2 gap-3">
        <BlocoHome titulo="Ritmo do dia" href={linkPara('gastos', { ...f, tipo: 'livre' }, atual)}
          valor={ritmo ? `${brl(ritmo.ritmoSeguroDia)}/dia` : '—'}
          detalhe={ritmo ? `gastando ${brl(ritmo.ritmoAtualDia)}/dia` : 'mês fechado'}
          tom={ritmo ? (ritmo.ritmoAtualDia > ritmo.ritmoSeguroDia ? 'atencao' : 'bom') : 'neutro'} />
        <BlocoHome titulo="Contas do mês" href={linkPara('contas', f, atual)}
          valor={cr ? `${cr.pagas}/${cr.total}` : '—'}
          detalhe={cr ? (cr.falta > 0 ? `falta ${brl(cr.falta)}` : 'tudo pago') : 'nenhuma conta cadastrada'}
          tom={cr ? (cr.falta > 0 ? 'atencao' : 'bom') : 'neutro'} />
        {/* sem href no bloco: cada grupo é o seu link (a spec pede um destino por pedaço) */}
        <BlocoHome titulo="Para onde vai" valor={grupos[0] ? grupos[0].nome : '—'}
          detalhe={grupos.length ? undefined : 'sem gasto no mês'}>
          {grupos.length > 0 && (
            <>
              <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-3">
                {grupos.map((g, i) => <div key={g.nome} className={CORES[i]} style={{ width: `${g.pct}%` }} />)}
              </div>
              <div className="mt-1 flex flex-col">
                {grupos.map((g, i) => (
                  <Link key={g.nome} href={linkPara('gastos', { ...f, grupo: g.nome }, atual)}
                    className="flex min-h-[28px] items-center gap-1.5 text-[11px] text-muted hover:text-text">
                    <span className={`h-2 w-2 rounded-full ${CORES[i]}`} />{g.nome} {g.pct}%
                  </Link>
                ))}
              </div>
            </>
          )}
        </BlocoHome>
        <BlocoHome titulo="Cartões" href={linkPara('faturas', { resp, cartao: cartao?.banco }, atual)}
          valor={cartao ? brl(cartao.totalAberto) : '—'}
          detalhe={cartao ? `${cartao.banco} ${cartao.usoPct}% do limite` : 'sem cartão'}
          tom={cartao && cartao.usoPct >= 80 ? 'ruim' : 'neutro'} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verificar tipos, testes e build**

Run: `npx tsc --noEmit -p . && npx vitest run && npm run build`
Expected: sem erro; todos os testes passam; `✓ Compiled successfully` com a rota `/`.

- [ ] **Step 5: Teste de consistência do fechamento (integração)**

Em `test/integracao/previsao.test.ts`, acrescentar:

```ts
it('fechamento da linha do mês = fechaCom da previsão', async () => {
  const { serieDoMes } = await import('../../src/lib/linhaDoMes');
  const hoje = '2026-08-15';
  const b = await queries.getProjecaoBase('casal', hoje);
  const m0 = queries.computeProjecao(b, 1, hoje)[0];
  const r = queries.computeRitmo(b, m0, hoje);
  const entra = b.mesCorrente.receitasAReceber.reduce((s, x) => s + x.valor, 0);
  const s = serieDoMes({ mes: '2026-08', hoje, saldoHoje: b.saldoContasAtual, movimentos: {},
    receitas: b.mesCorrente.receitasAReceber.map((x) => ({ dia: x.diaTipico, valor: x.valor })),
    aindaSai: b.saldoContasAtual + entra - r.fechaCom });
  expect(s.fechamento).toBeCloseTo(r.fechaCom, 2);
});
```

Run: `TEST_DATABASE_URL=... npx vitest run test/integracao/previsao.test.ts` → PASS.

- [ ] **Step 6: Verificação visual (prévia local)**

Banco local com dados reais copiados (só na máquina; nunca no repositório): `pg-preview-g` em 127.0.0.1:55433, carregado com `base.sql`, migrações 001, 003, 004, 005 e o seed local. Subir com a configuração `painel-preview-g` (`preview_start`), abrir `/` em 375×812 e no computador. Conferir: linha do mês com hoje marcado e fechamento colorido; os 4 quadrados sem pular de tamanho; cada toque abre a tela certa já filtrada (Gastos com o grupo, Faturas com o cartão aberto, Contas da pessoa, Previsão com o mês destacado); `?mes=` de um mês passado mostra "Fechou em" e Ritmo "mês fechado".

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/components/LinhaDoMes.tsx src/app/components/BlocoHome.tsx test/integracao/previsao.test.ts
git commit -F .git/MSG.txt   # "feat(home): home nova com linha do mes e grade 2x2 (F1)"
```

---

### Task 6: Navegação nova

**Files:**
- Modify: `src/app/components/Nav.tsx`, `src/app/components/PeriodPicker.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: `podeIrParaMesSeguinte` (Task 1)
- Produces: `MobileNav` (barra com "Mais"), `NavLinks` (sidebar com separador); `MoreMenu` deixa de ser usado no topo.

- [ ] **Step 1: Listas**

Em `Nav.tsx`, trocar `LINKS` e `EXTRA` (importar `ClipboardCheck, Receipt, Telescope, LayoutDashboard, CreditCard, Stethoscope, Repeat, TrendingUp, Target, Home, Search, MoreHorizontal` de `lucide-react`):

```ts
const LINKS = [
  { href: '/', label: 'Início', short: 'Início', icon: LayoutDashboard },
  { href: '/contas', label: 'Contas do mês', short: 'Contas', icon: ClipboardCheck },
  { href: '/gastos', label: 'Gastos', short: 'Gastos', icon: Receipt },
  { href: '/previsibilidade', label: 'Previsão', short: 'Previsão', icon: Telescope },
];
const EXTRA = [
  { href: '/faturas', label: 'Faturas', short: 'Faturas', icon: CreditCard },
  { href: '/diagnostico', label: 'Diagnóstico', short: 'Diagnóst.', icon: Stethoscope },
  { href: '/assinaturas', label: 'Assinaturas', short: 'Assin.', icon: Repeat },
  { href: '/investimentos', label: 'Investimentos', short: 'Invest.', icon: TrendingUp },
  { href: '/orcamento', label: 'Orçamento', short: 'Orçam.', icon: Target },
  { href: '/casa', label: 'Casa', short: 'Casa', icon: Home },
  { href: '/buscar', label: 'Buscar', short: 'Buscar', icon: Search },
];
```

- [ ] **Step 2: Sidebar com separador**

Em `NavLinks`, renderizar `LINKS`, depois `<div className="my-2 border-t border-border" />`, depois `EXTRA` (mesmo markup de link de hoje).

- [ ] **Step 3: Barra do celular com "Mais"**

Substituir `MobileNav` por:

```tsx
export function MobileNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const [mais, setMais] = useState(false);
  const noMais = EXTRA.some((e) => e.href === path);
  const item = 'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <>
      {mais && (
        <>
          <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMais(false)} aria-hidden />
          <div className="md:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-border bg-surface-2 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="grid grid-cols-4 gap-2">
              {EXTRA.map(({ href, short, icon: Icon }) => (
                <Link key={href} href={href + (qs ? `?${qs}` : '')} onClick={() => setMais(false)}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${path === href ? 'bg-surface-3 text-accent' : 'text-muted'}`}>
                  <Icon size={20} />{short}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {LINKS.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href + (qs ? `?${qs}` : '')} className={`${item} ${path === href ? 'text-accent' : 'text-muted'}`}>
            <Icon size={20} />{short}
          </Link>
        ))}
        <button onClick={() => setMais(!mais)} className={`${item} ${mais || noMais ? 'text-accent' : 'text-muted'}`} aria-expanded={mais}>
          <MoreHorizontal size={20} />Mais
        </button>
      </nav>
    </>
  );
}
```

- [ ] **Step 4: Topo**

Em `layout.tsx`: remover `MoreMenu` do import e do header (o bloco `<Suspense fallback={<div className="h-9 w-9" />}><MoreMenu /></Suspense>`).

- [ ] **Step 5: Seletor de mês**

Em `PeriodPicker.tsx`: importar `podeIrParaMesSeguinte` de `@/lib/links`; trocar a linha de `podeAvancar` por

```ts
const podeAvancar = shift(mes, 1) <= (podeIrParaMesSeguinte(path) ? shift(atual, 1) : atual);
```

e renderizar o grupo de atalhos (`PRESETS.map`) só quando `path === '/gastos'`; fora de Gastos, `kind` é sempre `'mes'` (`const kind = path === '/gastos' && (p === '7d' || p === '15d' || p === '30d') ? p : 'mes';`).

- [ ] **Step 6: Verificar e commitar**

Run: `npx tsc --noEmit -p . && npx vitest run && npm run build` → sem erro.
Prévia local em 375px: barra com 5 itens; "Mais" abre a folha com 7 telas e fecha ao tocar fora; topo sem ⋯; atalhos 7/15/30 só em Gastos; seta de mês seguinte só em Contas e Previsão.

```bash
git add src/app/components/Nav.tsx src/app/components/PeriodPicker.tsx src/app/layout.tsx
git commit -F .git/MSG.txt   # "feat(nav): barra Inicio/Contas/Gastos/Previsao/Mais (F1)"
```

---

### Task 7: Aviso de versão nova

**Files:**
- Create: `src/lib/versao.ts`, `src/app/api/versao/route.ts`, `src/app/components/VersaoAviso.tsx`
- Modify: `src/app/layout.tsx`
- Test: `test/lib/versao.test.ts`

**Interfaces:**
- Produces: `lerVersao(): string` (conteúdo de `.next/BUILD_ID`, ou `'desconhecida'`), `versaoMudou(carregada: string, servidor: string | null): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/versao.test.ts
import { describe, expect, it } from 'vitest';
import { versaoMudou } from '../../src/lib/versao';

describe('versaoMudou', () => {
  it('avisa só quando as duas versões são conhecidas e diferentes', () => {
    expect(versaoMudou('abc', 'def')).toBe(true);
    expect(versaoMudou('abc', 'abc')).toBe(false);
    expect(versaoMudou('abc', null)).toBe(false);
    expect(versaoMudou('desconhecida', 'def')).toBe(false);
    expect(versaoMudou('abc', 'desconhecida')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/versao.test.ts`
Expected: FAIL — "Failed to load url ../../src/lib/versao".

- [ ] **Step 3: Implementação**

```ts
// src/lib/versao.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Identificador do build em produção (o Next grava em .next/BUILD_ID). */
export function lerVersao(): string {
  try { return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() || 'desconhecida'; } catch { return 'desconhecida'; }
}

export function versaoMudou(carregada: string, servidor: string | null): boolean {
  return !!servidor && carregada !== 'desconhecida' && servidor !== 'desconhecida' && carregada !== servidor;
}
```

```ts
// src/app/api/versao/route.ts
import { NextResponse } from 'next/server';
import { lerVersao } from '@/lib/versao';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ versao: lerVersao() }, { headers: { 'Cache-Control': 'no-store' } });
}
```

```tsx
// src/app/components/VersaoAviso.tsx
'use client';

import { useEffect, useState } from 'react';
import { versaoMudou } from '@/lib/versao';

/** Faixa "versão nova": confere ao voltar para a aba e a cada 30 min; nunca recarrega sozinho. */
export function VersaoAviso({ carregada }: { carregada: string }) {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    const conferir = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' });
        const { versao } = await r.json();
        if (versaoMudou(carregada, versao)) setNova(true);
      } catch { /* sem rede: tenta de novo na próxima */ }
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(conferir, 30 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', aoVoltar); clearInterval(t); };
  }, [carregada]);
  if (!nova) return null;
  return (
    <button onClick={() => location.reload()}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+60px)] z-30 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-card md:bottom-4 md:left-auto md:right-4 md:w-auto">
      Versão nova do painel — toque para atualizar
    </button>
  );
}
```

Em `layout.tsx`: `import { lerVersao } from '@/lib/versao';` e `import { VersaoAviso } from './components/VersaoAviso';`; antes de `</body>`: `<VersaoAviso carregada={lerVersao()} />`.

Observação: `versao.ts` importa `node:fs`; o componente cliente só usa `versaoMudou`. Se o bundler do cliente reclamar do `node:fs`, mover `versaoMudou` para `src/lib/versaoMudou.ts` (sem import de `fs`) e importar de lá no componente e no teste.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/versao.test.ts && npm run build`
Expected: PASS; build ok com a rota `/api/versao`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/versao.ts src/app/api/versao/route.ts src/app/components/VersaoAviso.tsx src/app/layout.tsx test/lib/versao.test.ts
git commit -F .git/MSG.txt   # "feat(versao): aviso de versao nova do painel (F1)"
```

---

### Task 8: Verificação final e deploy

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa com integração**

Run: `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run && npx tsc --noEmit -p . && npm run build`
Expected: todos os testes passam; build ok.

- [ ] **Step 2: Varredura do que vai para o repositório público**

Run: `git log feat/b2-classificacao..HEAD --format=%B | grep -n -E 'R\$ ?[0-9]|[0-9]\.[0-9]{3},[0-9]{2}'` e `git diff feat/b2-classificacao..HEAD | grep -n -E '^\+.*(R\$ ?[0-9]|[0-9]{11}|[0-9]{14})'`
Expected: nenhuma linha.

- [ ] **Step 3: Deploy do painel**

Procedimento de sempre: pacote sem `node_modules`, `.next`, `dist`, `.git`, `.superpowers`, `db/*.local.sql`, `package-lock.json`; cópia em `/root/finance-dash.bak-pre-f1`; `docker build -t finance-dash:1 .`; `docker compose up -d --force-recreate finance-dashboard` em `/root/n8n-docker`.

- [ ] **Step 4: Conferência em produção**

Todas as rotas (`/`, `/contas?resp=Ariane`, `/gastos?grupo=Mercado`, `/gastos?tipo=livre`, `/faturas?cartao=Nubank`, `/previsibilidade?mes=2026-11`, `/api/previsao`, `/api/versao`) em 200 pela rede interna; o fechamento mostrado na home (`/`) igual ao `fechaCom` de `/api/previsao`.

- [ ] **Step 5: Push e PR**

`git push -u origin feat/f1-home`; PR com base `feat/b2-classificacao`, descrição sem valores reais.
