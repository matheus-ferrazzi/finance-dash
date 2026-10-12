# E1 — Bot de perguntas no grupo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No grupo do WhatsApp, quem começa a mensagem com "bot" (ou menciona o bot) recebe uma resposta com os números do painel — consultar, entender e simular — sem número inventado e sem morrer calado.

**Architecture:** Evolution manda `MESSAGES_UPSERT` por webhook a um servidor HTTP no worker (rede interna). O worker filtra (grupo, membro, chamado, não é o próprio bot), põe na fila e chama o Groq com 8 ferramentas fixas; cada ferramenta lê uma rota `/api/bot/*` do painel (mesmas funções das telas). A resposta passa pela trava de número e vai ao grupo; tudo é registrado em `financas_bot_conversas`.

**Tech Stack:** Next.js 14 (rotas), TypeScript, `pg`, Vitest 3, Node `http` (worker), Groq (API compatível com OpenAI, `chat/completions` com `tools`), Evolution API v2.3.7.

**Spec:** `docs/superpowers/specs/2026-10-11-e1-bot-perguntas-design.md`

## Global Constraints

- Branch `feat/e1-bot` (base `feat/d2-visuais`, PR #16).
- Só leitura: nenhuma ferramenta escreve. Só no grupo `WA_GRUPO`. Só quando chamado (prefixo "bot" ou menção ao bot).
- O modelo não faz número: toda soma/diferença/%/data vem da ferramenta; trava de R$ com fallback para o texto montado.
- Só Groq: `GROQ_MODELOS` (lista, padrão `openai/gpt-oss-120b`), próximo modelo em erro de modelo; 20 s por chamada; até 4 rodadas de ferramenta.
- Filtro antes de qualquer log/gravação/Groq: token → grupo → membro → não é o próprio bot → chamado. Mensagem descartada não é logada.
- Registro: nunca telefone/JID no banco ou no log; nunca mensagem de fora do filtro; 90 dias.
- Segredos só em `/root/n8n-docker/.env.worker-bot` (600), gerado por script que o Matheus roda; Claude não vê valores. Sem porta publicada.
- Períodos: `hoje | esta_semana | semana_passada | este_mes | mes_passado | AAAA-MM`, resolvidos em SP; semana = segunda a domingo. Pessoa: `casal | Matheus | Ariane` (`eu` = quem perguntou).
- Textos: português, tom contido, um emoji por linha no começo, até ~8 linhas, link do painel no fim.
- Testes de integração: `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db`, um arquivo por vez. Commits via `git commit -F`, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Sem número, JID, chave ou valor real no repo. Arquivos com LF (`.gitattributes`); editar com as ferramentas de edição, não com Python em modo texto.

## Review Focus

1. **Mensagem de outra conversa do Matheus** (webhook no número pessoal) → nem log, nem banco, nem Groq. (Task 4)
2. **Matheus pergunta pelo próprio celular no número pessoal** (`fromMe = true`, sem `participant`) → é pergunta do Matheus, não resposta do bot. (Task 4)
3. **Resposta do modelo com valor arredondado ("R$ 54" para 53,63)** → aceita; com valor somado/inventado → texto montado. (Task 5)
4. **Groq sem o modelo da lista (descontinuado)** → próximo modelo na mesma pergunta; todos fora → mensagem de falha e erro registrado. (Task 5)
5. **Duas perguntas em sequência rápida** → respostas na ordem, sem misturar contexto. (Task 6)

---

### Task 1: Períodos e consultas do bot (painel, puro + SQL)

**Files:**
- Create: `src/lib/periodos.ts`, `src/lib/bot.ts`
- Modify: `src/lib/queries.ts` (`getGastoPorCategoriaEntre` ganha `resp`; nova `getMaioresGastos`)
- Test: `test/lib/periodos.test.ts`, `test/lib/bot.test.ts`, `test/integracao/bot.test.ts`

**Interfaces:**
- Produces: `resolverPeriodo(nome: string, hoje: string): { inicio: string; fimExcl: string; label: string } | null`; `PERIODOS: string[]`; `lerPessoa(v: string | null): Resp | null`; `montarGasto(porCat: ReadonlyMap<string, number>, grupo: string | null): { total: number; itens: { nome: string; valor: number }[] }`; `montarComparar(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): { totalA: number; totalB: number; diferenca: number; pct: number | null; grupos: { nome: string; a: number; b: number; diferenca: number }[] }`; `getGastoPorCategoriaEntre(inicio, fimExcl, resp: Resp = 'casal')`; `getMaioresGastos(resp: Resp, inicio: string, fimExcl: string, grupo: string | null, limite = 10): Promise<{ data: string; valor: number; descricao: string; pessoa: string; categoria: string }[]>`.

- [ ] **Step 1: Testes de período** — criar `test/lib/periodos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerPessoa, resolverPeriodo } from '../../src/lib/periodos';

describe('resolverPeriodo (SP)', () => {
  it('hoje, esta semana (segunda até hoje), semana passada (seg a dom)', () => {
    expect(resolverPeriodo('hoje', '2026-10-15')).toEqual({ inicio: '2026-10-15', fimExcl: '2026-10-16', label: 'hoje' });
    expect(resolverPeriodo('esta_semana', '2026-10-15')).toEqual({ inicio: '2026-10-12', fimExcl: '2026-10-16', label: 'esta semana (12/10 a 15/10)' });
    expect(resolverPeriodo('esta_semana', '2026-10-12')).toEqual({ inicio: '2026-10-12', fimExcl: '2026-10-13', label: 'esta semana (12/10 a 12/10)' });
    expect(resolverPeriodo('semana_passada', '2026-10-12')).toEqual({ inicio: '2026-10-05', fimExcl: '2026-10-12', label: 'semana passada (05/10 a 11/10)' });
  });
  it('este mês até hoje; mês passado inteiro, com virada de ano', () => {
    expect(resolverPeriodo('este_mes', '2026-10-11')).toEqual({ inicio: '2026-10-01', fimExcl: '2026-10-12', label: 'out/26' });
    expect(resolverPeriodo('mes_passado', '2027-01-05')).toEqual({ inicio: '2026-12-01', fimExcl: '2027-01-01', label: 'dez/26' });
  });
  it('AAAA-MM: mês fechado inteiro; mês atual até hoje; futuro e lixo → null', () => {
    expect(resolverPeriodo('2026-08', '2026-10-11')).toEqual({ inicio: '2026-08-01', fimExcl: '2026-09-01', label: 'ago/26' });
    expect(resolverPeriodo('2026-10', '2026-10-11')).toEqual({ inicio: '2026-10-01', fimExcl: '2026-10-12', label: 'out/26' });
    expect(resolverPeriodo('2026-11', '2026-10-11')).toBeNull();
    expect(resolverPeriodo('ontem', '2026-10-11')).toBeNull();
    expect(resolverPeriodo('2026-13', '2026-10-11')).toBeNull();
  });
});

describe('lerPessoa', () => {
  it('casal (padrão), Matheus, Ariane; resto null', () => {
    expect([lerPessoa(null), lerPessoa('casal'), lerPessoa('Matheus'), lerPessoa('Ariane'), lerPessoa('fulano')]).toEqual(['casal', 'casal', 'Matheus', 'Ariane', null]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/lib/periodos.test.ts` → FAIL (módulo não existe).

- [ ] **Step 3: Implementar `src/lib/periodos.ts`**:

```ts
// E1: períodos por nome (o modelo nunca escreve data) resolvidos no horário de SP.
import { mesLabel } from './format';
import { addMonths } from './previsao';
import type { Resp } from './queries';
import { semanaAnterior, somaDias } from './resumos';

export const PERIODOS = ['hoje', 'esta_semana', 'semana_passada', 'este_mes', 'mes_passado'];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ultimoDia = (mes: string) => somaDias(`${addMonths(mes, 1)}-01`, -1);

/** [inicio, fimExcl) e um rótulo; null para nome desconhecido ou mês futuro. */
export function resolverPeriodo(nome: string, hoje: string): { inicio: string; fimExcl: string; label: string } | null {
  const amanha = somaDias(hoje, 1);
  const mesAtual = hoje.slice(0, 7);
  if (nome === 'hoje') return { inicio: hoje, fimExcl: amanha, label: 'hoje' };
  if (nome === 'esta_semana') {
    const seg = somaDias(semanaAnterior(hoje).inicio, 7);
    return { inicio: seg, fimExcl: amanha, label: `esta semana (${ddmm(seg)} a ${ddmm(hoje)})` };
  }
  if (nome === 'semana_passada') {
    const s = semanaAnterior(hoje);
    return { inicio: s.inicio, fimExcl: somaDias(s.fim, 1), label: `semana passada (${ddmm(s.inicio)} a ${ddmm(s.fim)})` };
  }
  if (nome === 'este_mes') return { inicio: `${mesAtual}-01`, fimExcl: amanha, label: mesLabel(mesAtual) };
  const mes = nome === 'mes_passado' ? addMonths(mesAtual, -1) : nome;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes > mesAtual) return null;
  return { inicio: `${mes}-01`, fimExcl: mes === mesAtual ? amanha : somaDias(ultimoDia(mes), 1), label: mesLabel(mes) };
}

export function lerPessoa(v: string | null): Resp | null {
  if (v === null || v === '' || v === 'casal') return 'casal';
  return v === 'Matheus' || v === 'Ariane' ? v : null;
}
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run test/lib/periodos.test.ts` → PASS.

- [ ] **Step 5: Testes dos montadores** — criar `test/lib/bot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { montarComparar, montarGasto } from '../../src/lib/bot';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('montarGasto', () => {
  it('sem grupo: por grupo do painel, maiores primeiro, total de tudo', () => {
    const r = montarGasto(m({ Groceries: 300, 'Eating out': 100, 'Food delivery': 50 }), null);
    expect(r).toEqual({ total: 450, itens: [{ nome: 'Mercado', valor: 300 }, { nome: 'Comer fora', valor: 150 }] });
  });
  it('com grupo: por categoria só daquele grupo', () => {
    const r = montarGasto(m({ Groceries: 300, 'Eating out': 100, 'Food delivery': 50 }), 'Comer fora');
    expect(r).toEqual({ total: 150, itens: [{ nome: 'Eating out', valor: 100 }, { nome: 'Food delivery', valor: 50 }] });
  });
});

describe('montarComparar', () => {
  it('diferença e % prontos, maiores mudanças primeiro', () => {
    const r = montarComparar(m({ Groceries: 500, 'Eating out': 100 }), m({ Groceries: 400, 'Eating out': 300 }));
    expect(r.totalA).toBe(600); expect(r.totalB).toBe(700);
    expect(r.diferenca).toBe(-100); expect(r.pct).toBe(-14.3);
    expect(r.grupos[0]).toEqual({ nome: 'Comer fora', a: 100, b: 300, diferenca: -200 });
  });
  it('base zero: pct null', () => {
    expect(montarComparar(m({ Groceries: 10 }), m({})).pct).toBeNull();
  });
});
```

(Categorias conferidas em `GRUPOS_GASTO`: Mercado = `Groceries`; Comer fora = `Food delivery`, `Eating out`, `Food and drinks`.)

- [ ] **Step 6: Rodar e ver falhar** — `npx vitest run test/lib/bot.test.ts` → FAIL.

- [ ] **Step 7: Implementar `src/lib/bot.ts`**:

```ts
// E1: montadores puros das respostas das ferramentas do bot (as contas que o modelo não pode fazer).
import { agruparGastos, grupoDaCategoria } from './grupos';

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (m: ReadonlyMap<string, number>) => r2(Array.from(m.values()).reduce((s, v) => s + v, 0));

export function montarGasto(porCat: ReadonlyMap<string, number>, grupo: string | null): { total: number; itens: { nome: string; valor: number }[] } {
  if (grupo === null) {
    const itens = agruparGastos(porCat, 0).map((g) => ({ nome: g.nome, valor: r2(g.total) })).filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
    return { total: soma(porCat), itens };
  }
  const itens = Array.from(porCat.entries())
    .filter(([cat]) => (grupoDaCategoria(cat)?.nome ?? 'Resto') === grupo)
    .map(([nome, valor]) => ({ nome, valor: r2(valor) }))
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  return { total: r2(itens.reduce((s, i) => s + i.valor, 0)), itens };
}

export function montarComparar(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) {
  const ga = montarGasto(a, null).itens, gb = montarGasto(b, null).itens;
  const nomes = Array.from(new Set([...ga.map((g) => g.nome), ...gb.map((g) => g.nome)]));
  const grupos = nomes.map((nome) => {
    const va = ga.find((g) => g.nome === nome)?.valor ?? 0, vb = gb.find((g) => g.nome === nome)?.valor ?? 0;
    return { nome, a: va, b: vb, diferenca: r2(va - vb) };
  }).sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca)).slice(0, 8);
  const totalA = soma(a), totalB = soma(b);
  return { totalA, totalB, diferenca: r2(totalA - totalB), pct: totalB > 0 ? Math.round(((totalA - totalB) / totalB) * 1000) / 10 : null, grupos };
}
```

- [ ] **Step 8: Rodar e ver passar** — `npx vitest run test/lib/bot.test.ts` → PASS.

- [ ] **Step 9: Integração das consultas** — criar `test/integracao/bot.test.ts` (mesmo `beforeAll`/`afterAll` de `test/integracao/resumos.test.ts`, copiado):

```ts
  it('gasto por categoria filtra pessoa; maiores gastos ordena, filtra grupo e período', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, forma_pagamento, banco, responsavel) VALUES
      ('bt1', '2044-02-03', 300, 'MERCADO A', 'Groceries', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt2', '2044-02-04', 120, 'MERCADO B', 'Groceries', 'despesa', 'Crédito', 'B', 'Ariane'),
      ('bt3', '2044-02-05', 80, 'IFOOD', 'Food delivery', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt4', '2044-03-01', 999, 'MARCO', 'Groceries', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt5', '2044-02-06', 5000, 'SALARIO', 'Salary', 'receita', 'Débito', 'B', 'Matheus')`);
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre('2044-02-01', '2044-03-01', 'Matheus'))).toEqual({ Groceries: 300, 'Food delivery': 80 });
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre('2044-02-01', '2044-03-01'))).toEqual({ Groceries: 420, 'Food delivery': 80 });
    const top = await queries.getMaioresGastos('casal', '2044-02-01', '2044-03-01', null);
    expect(top.map((t) => [t.data, t.valor, t.descricao, t.pessoa])).toEqual([['03/02', 300, 'MERCADO A', 'Matheus'], ['04/02', 120, 'MERCADO B', 'Ariane'], ['05/02', 80, 'IFOOD', 'Matheus']]);
    expect((await queries.getMaioresGastos('casal', '2044-02-01', '2044-03-01', 'Mercado')).length).toBe(2);
  });
```


- [ ] **Step 10: Rodar e ver falhar** — subir o Postgres de teste (`docker run --rm -d --name pg-teste-c1 -e POSTGRES_PASSWORD=teste -p 127.0.0.1:55432:5432 postgres:16`, `CREATE DATABASE personal_hub_db`) e `TEST_DATABASE_URL=... npx vitest run test/integracao/bot.test.ts` → FAIL.

- [ ] **Step 11: Implementar em `src/lib/queries.ts`** — trocar `getGastoPorCategoriaEntre` por:

```ts
export async function getGastoPorCategoriaEntre(inicio: string, fimExcl: string, resp: Resp = 'casal'): Promise<Map<string, number>> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS cat, SUM(valor)::float8 AS v
     FROM financas_lancamentos
     WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date${r.sql}
     GROUP BY 1`,
    [inicio, fimExcl, ...r.p],
  );
  return new Map(rows.map((x) => [x.cat as string, Math.round(Number(x.v) * 100) / 100]));
}
```

e acrescentar no fim:

```ts
/** E1: maiores despesas de um período (grupo opcional, pelos grupos do painel). */
export async function getMaioresGastos(resp: Resp, inicio: string, fimExcl: string, grupo: string | null, limite = 10) {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT to_char(data_lancamento,'DD/MM') AS data, valor::float8 AS valor, COALESCE(descricao,'(sem descrição)') AS descricao,
            COALESCE(responsavel,'—') AS pessoa, categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria
     FROM financas_lancamentos
     WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date${r.sql}
     ORDER BY valor DESC, data_lancamento`,
    [inicio, fimExcl, ...r.p],
  );
  return rows
    .filter((x) => grupo === null || (grupoDaCategoria(x.categoria)?.nome ?? 'Resto') === grupo)
    .slice(0, limite)
    .map((x) => ({ data: x.data, valor: Math.round(Number(x.valor) * 100) / 100, descricao: x.descricao, pessoa: x.pessoa, categoria: x.categoria }));
}
```

(acrescentar `grupoDaCategoria` ao import de `./grupos` no topo do arquivo).

- [ ] **Step 12: Rodar e ver passar** — integração `bot.test.ts` e `resumos.test.ts` (que usa `getGastoPorCategoriaEntre` sem `resp`) → PASS; `npx tsc --noEmit` limpo.

- [ ] **Step 13: Commit** — `feat(bot): periodos por nome e consultas do bot (E1)`.

---

### Task 2: Rotas `/api/bot/*`

**Files:**
- Create: `src/app/api/bot/{situacao,gasto,maiores,comparar,faturas,contas,trilha,simular}/route.ts`, `src/lib/botRotas.ts`
- Test: `test/lib/botRotas.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces (JSON, consumidos pelos formatadores da Task 5):
  - `situacao`: `{ mesLabel, dapraGastarHoje, ritmoAtualDia, diasRestantes, fechaCom, saiDoVermelho: string | null, link: '/' }`
  - `gasto`: `{ periodo: string, pessoa, grupo: string | null, total, itens: {nome, valor}[], link: '/gastos' }`
  - `maiores`: `{ periodo, pessoa, grupo, itens: {data, valor, descricao, pessoa}[], link: '/buscar' }`
  - `comparar`: `{ a: string, b: string, pessoa, totalA, totalB, diferenca, pct, grupos: {nome, a, b, diferenca}[], link: '/gastos' }`
  - `faturas`: `{ itens: {banco, pessoa, valor, vencimento: string | null, paga: boolean}[], total, link: '/faturas' }`
  - `contas`: `{ mesLabel, pagas: {nome, valor}[], falta: {nome, valor, vence: number | null}[], aConfirmar: {nome, valor}[], totalFalta, link: '/contas' }`
  - `trilha`: `{ fase, titulo, proximoPasso, reserva: { aplicado, meta }, link: '/trilha' }`
  - `simular`: `{ valorTotal, parcelas, parcela, cabe, mesQueFura: string | null, aprofunda, link: '/simulador' }`
  - erro: `400 { erro: string }`.
  - `lerParams(sp: URLSearchParams, hoje: string, campos: ('periodo'|'periodo_b'|'pessoa'|'grupo')[]): { ok: true, v: {...} } | { ok: false, erro: string }` em `src/lib/botRotas.ts`.

- [ ] **Step 1: Teste da validação** — `test/lib/botRotas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerParams } from '../../src/lib/botRotas';

const sp = (o: Record<string, string>) => new URLSearchParams(o);

describe('lerParams', () => {
  it('resolve período, pessoa e grupo válidos', () => {
    const r = lerParams(sp({ periodo: 'mes_passado', pessoa: 'Ariane', grupo: 'Mercado' }), '2026-10-11', ['periodo', 'pessoa', 'grupo']);
    expect(r).toEqual({ ok: true, v: { periodo: { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' }, pessoa: 'Ariane', grupo: 'Mercado' } });
  });
  it('erros com mensagem para o modelo', () => {
    expect(lerParams(sp({ periodo: 'ontem' }), '2026-10-11', ['periodo'])).toEqual({ ok: false, erro: 'periodo inválido: use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)' });
    expect(lerParams(sp({ periodo: 'hoje', pessoa: 'Zé' }), '2026-10-11', ['periodo', 'pessoa'])).toEqual({ ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' });
    expect(lerParams(sp({ periodo: 'hoje', grupo: 'Xis' }), '2026-10-11', ['periodo', 'grupo']).ok).toBe(false);
  });
  it('sem pessoa = casal; sem grupo = null', () => {
    expect(lerParams(sp({ periodo: 'hoje' }), '2026-10-11', ['periodo', 'pessoa', 'grupo'])).toMatchObject({ ok: true, v: { pessoa: 'casal', grupo: null } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar `src/lib/botRotas.ts`**:

```ts
// E1: validação dos parâmetros das rotas /api/bot/* (erro em texto que o modelo entende e corrige).
import { GRUPOS_VALIDOS } from './grupos';
import { lerPessoa, resolverPeriodo } from './periodos';
import type { Resp } from './queries';

type Campo = 'periodo' | 'periodo_b' | 'pessoa' | 'grupo';
type Per = { inicio: string; fimExcl: string; label: string };
export type Params = { periodo?: Per; periodo_b?: Per; pessoa?: Resp; grupo?: string | null };

const ERRO_PERIODO = 'use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)';

export function lerParams(sp: URLSearchParams, hoje: string, campos: Campo[]): { ok: true; v: Params } | { ok: false; erro: string } {
  const v: Params = {};
  for (const c of campos) {
    if (c === 'periodo' || c === 'periodo_b') {
      const p = resolverPeriodo(sp.get(c) ?? '', hoje);
      if (!p) return { ok: false, erro: `${c} inválido: ${ERRO_PERIODO}` };
      v[c] = p;
    } else if (c === 'pessoa') {
      const p = lerPessoa(sp.get('pessoa'));
      if (!p) return { ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' };
      v.pessoa = p;
    } else {
      const g = sp.get('grupo');
      if (g && !GRUPOS_VALIDOS.includes(g)) return { ok: false, erro: `grupo inválido: use ${GRUPOS_VALIDOS.join(', ')}` };
      v.grupo = g || null;
    }
  }
  return { ok: true, v };
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: As oito rotas** — cada uma `export const dynamic = 'force-dynamic';` e `GET(req: Request)`. Código:

`src/app/api/bot/situacao/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { computeProjecao, getCalibracaoPara, getPrevisaoResumo, getProjecaoBase } from '@/lib/queries';
import { saiDoVermelho } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [p, base, { calib }] = await Promise.all([getPrevisaoResumo('casal'), getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const sai = saiDoVermelho(computeProjecao(base, 24), calib).provavel;
  return NextResponse.json({
    mesLabel: p.mesLabel, dapraGastarHoje: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia, diasRestantes: p.diasRestantes,
    fechaCom: p.fechaCom, saiDoVermelho: sai ? mesLabel(sai) : null, link: '/',
  });
}
```

`src/app/api/bot/gasto/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { montarGasto } from '@/lib/bot';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  const g = montarGasto(await getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa), grupo);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, ...g, link: '/gastos' });
}
```

`src/app/api/bot/maiores/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getMaioresGastos } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  const itens = (await getMaioresGastos(pessoa, periodo.inicio, periodo.fimExcl, grupo)).map(({ categoria: _c, ...x }) => x);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, itens, link: '/buscar' });
}
```

`src/app/api/bot/comparar/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { montarComparar } from '@/lib/bot';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'periodo_b', 'pessoa']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, periodo_b, pessoa } = r.v as Required<typeof r.v>;
  const [a, b] = await Promise.all([
    getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    getGastoPorCategoriaEntre(periodo_b.inicio, periodo_b.fimExcl, pessoa),
  ]);
  return NextResponse.json({ a: periodo.label, b: periodo_b.label, pessoa, ...montarComparar(a, b), link: '/gastos' });
}
```

`src/app/api/bot/faturas/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getFaturas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);

export async function GET() {
  const fs = await getFaturas('casal');
  const itens = fs.map((f) => ({ banco: f.banco, pessoa: f.responsavel, valor: f.valor, vencimento: ddmm(f.vencimento), paga: f.valor <= 0 }));
  return NextResponse.json({ itens, total: Math.round(itens.reduce((s, i) => s + Math.max(0, i.valor), 0) * 100) / 100, link: '/faturas' });
}
```

(Confirmar no `getFaturas` o formato de `vencimento` — se já vier `DD/MM` ou `Date`, ajustar `ddmm` para devolver `DD/MM`.)

`src/app/api/bot/contas/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { currentDateSP, mesLabel } from '@/lib/format';
import { getContasDoMes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mes = currentDateSP().slice(0, 7);
  const c = await getContasDoMes('casal', mes);
  const pagas = c.itens.filter((i) => i.status === 'pago').map((i) => ({ nome: i.nome, valor: i.pago ?? i.previsto }));
  const falta = c.itens.filter((i) => i.status === 'falta').map((i) => ({ nome: i.nome, valor: i.previsto, vence: i.vence ?? null }));
  const aConfirmar = c.itens.filter((i) => i.status === 'a_confirmar').map((i) => ({ nome: i.nome, valor: i.previsto }));
  return NextResponse.json({ mesLabel: mesLabel(mes), pagas, falta, aConfirmar, totalFalta: c.falta, link: '/contas' });
}
```

`src/app/api/bot/trilha/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { brl } from '@/lib/format';
import { getTrilhaDados } from '@/lib/queries';
import { avaliarTrilha, partesDoTexto } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t = avaliarTrilha(await getTrilhaDados());
  const f = t.fases[t.atual - 1];
  return NextResponse.json({
    fase: t.atual, titulo: f.titulo,
    proximoPasso: partesDoTexto(f.proximoPasso).map((p) => (typeof p === 'number' ? brl(p) : p)).join(''),
    reserva: { aplicado: t.reserva.aplicado, meta: t.reserva.meta }, link: '/trilha',
  });
}
```

(Se `Trilha` não expõe `reserva` com `aplicado`/`meta` nesse caminho, usar os campos do tipo `Trilha` em `src/lib/trilha.ts:124`.)

`src/app/api/bot/simular/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { compraCabe } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';
import { computeProjecao, getCalibracaoPara, getProjecaoBase } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const valorTotal = Number(sp.get('valor_total')), parcelas = Number(sp.get('parcelas') ?? '1');
  if (!(valorTotal > 0) || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 48) {
    return NextResponse.json({ erro: 'use valor_total > 0 e parcelas inteiro de 1 a 48' }, { status: 400 });
  }
  const [base, { calib }] = await Promise.all([getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const parcela = Math.round((valorTotal / parcelas) * 100) / 100;
  const c = compraCabe(computeProjecao(base, 24), calib, parcela, parcelas);
  return NextResponse.json({
    valorTotal, parcelas, parcela, cabe: c.cabe, mesQueFura: c.mesQueFura ? mesLabel(c.mesQueFura) : null, aprofunda: c.aprofunda, link: '/simulador',
  });
}
```

- [ ] **Step 6: Verificar** — `npx tsc --noEmit && npx vitest run --exclude 'test/integracao/**' && npm run build` → tudo ok. Conferência manual opcional com `npm run dev` não é necessária: as rotas usam só funções já testadas e a validação da Step 1.

- [ ] **Step 7: Commit** — `feat(bot): rotas de leitura /api/bot/* (E1)`.

---

### Task 3: Registro (migração 009)

**Files:**
- Create: `db/migrations/009_bot.sql`, `src/worker/bot/registro.ts`
- Test: `test/integracao/bot-registro.test.ts`

**Interfaces:**
- Produces: `interface LinhaBot { pessoa: string; pergunta: string; ferramentas: { nome: string; args: unknown; ok: boolean }[]; resposta: string | null; modelo: string | null; ms: number; trava: boolean; semFerramenta: boolean; erro: string | null }`; `class PgRegistroBot { gravar(l: LinhaBot): Promise<void>; contexto(minutos: number, n: number): Promise<{ pergunta: string; resposta: string }[]>; falhas24h(): Promise<number>; limpar(dias: number): Promise<number> }`.

- [ ] **Step 1: Teste** — `test/integracao/bot-registro.test.ts` (beforeAll aplica `base.sql`, `001_c1_ingestao.sql` e `009_bot.sql`):

```ts
  it('grava, devolve contexto recente na ordem, conta falhas e limpa antigas', async () => {
    const reg = new PgRegistroBot(pool);
    const base = { ferramentas: [], modelo: 'm', ms: 10, trava: false, semFerramenta: false };
    await reg.gravar({ ...base, pessoa: 'Matheus', pergunta: 'p1', resposta: 'r1', erro: null });
    await reg.gravar({ ...base, pessoa: 'Ariane', pergunta: 'p2', resposta: 'r2', erro: null });
    await reg.gravar({ ...base, pessoa: 'Ariane', pergunta: 'p3', resposta: null, erro: 'Groq fora' });
    expect(await reg.contexto(30, 3)).toEqual([{ pergunta: 'p1', resposta: 'r1' }, { pergunta: 'p2', resposta: 'r2' }]);
    expect(await reg.falhas24h()).toBe(1);
    await pool.query(`UPDATE financas_bot_conversas SET criado_em = now() - interval '91 days' WHERE pergunta = 'p1'`);
    expect(await reg.limpar(90)).toBe(1);
    expect((await reg.contexto(60 * 24 * 365, 10)).map((c) => c.pergunta)).toEqual(['p2']);
  });
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Migração** — `db/migrations/009_bot.sql`:

```sql
-- Bot de perguntas (E1): o que foi perguntado no grupo e como foi respondido. Sem telefone. 90 dias.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_bot_conversas (
  id             bigserial PRIMARY KEY,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  pessoa         text NOT NULL,
  pergunta       text NOT NULL,
  ferramentas    jsonb NOT NULL DEFAULT '[]',
  resposta       text,
  modelo         text,
  ms             integer NOT NULL DEFAULT 0,
  trava          boolean NOT NULL DEFAULT false,
  sem_ferramenta boolean NOT NULL DEFAULT false,
  erro           text
);
CREATE INDEX IF NOT EXISTS financas_bot_conversas_idx ON financas_bot_conversas (criado_em DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT, INSERT, DELETE ON financas_bot_conversas TO pluggy_worker;
    GRANT USAGE, SELECT ON SEQUENCE financas_bot_conversas_id_seq TO pluggy_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_bot_conversas TO bot_readonly;
  END IF;
END $$;
COMMIT;
```

- [ ] **Step 4: Registro** — `src/worker/bot/registro.ts`:

```ts
import type { Pool } from 'pg';

export interface LinhaBot {
  pessoa: string; pergunta: string; ferramentas: { nome: string; args: unknown; ok: boolean }[];
  resposta: string | null; modelo: string | null; ms: number; trava: boolean; semFerramenta: boolean; erro: string | null;
}

/** financas_bot_conversas: perguntas que passaram pelo filtro (grupo, membro, chamado) e o que o bot respondeu. */
export class PgRegistroBot {
  constructor(private readonly pool: Pool) {}

  async gravar(l: LinhaBot): Promise<void> {
    await this.pool.query(
      `INSERT INTO financas_bot_conversas (pessoa, pergunta, ferramentas, resposta, modelo, ms, trava, sem_ferramenta, erro)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [l.pessoa, l.pergunta, JSON.stringify(l.ferramentas), l.resposta, l.modelo, l.ms, l.trava, l.semFerramenta, l.erro],
    );
  }

  /** Últimas `n` trocas respondidas dos últimos `minutos`, da mais antiga para a mais nova. */
  async contexto(minutos: number, n: number): Promise<{ pergunta: string; resposta: string }[]> {
    const r = await this.pool.query(
      `SELECT pergunta, resposta FROM financas_bot_conversas
       WHERE resposta IS NOT NULL AND erro IS NULL AND criado_em > now() - make_interval(mins => $1)
       ORDER BY id DESC LIMIT $2`, [minutos, n]);
    return r.rows.reverse().map((x) => ({ pergunta: x.pergunta, resposta: x.resposta }));
  }

  async falhas24h(): Promise<number> {
    const r = await this.pool.query(`SELECT count(*)::int AS n FROM financas_bot_conversas WHERE erro IS NOT NULL AND criado_em > now() - interval '24 hours'`);
    return r.rows[0].n;
  }

  async limpar(dias: number): Promise<number> {
    const r = await this.pool.query(`DELETE FROM financas_bot_conversas WHERE criado_em < now() - make_interval(days => $1)`, [dias]);
    return r.rowCount ?? 0;
  }
}
```

- [ ] **Step 5: Rodar e ver passar** — PASS. **Step 6: Commit** — `feat(bot): registro das conversas do bot, migracao 009 (E1)`.

---

### Task 4: Entrada do webhook (filtro) e servidor HTTP

**Files:**
- Create: `src/worker/bot/entrada.ts`, `src/worker/bot/servidor.ts`
- Test: `test/worker/bot-entrada.test.ts`, `test/worker/bot-servidor.test.ts`

**Interfaces:**
- Produces: `interface ConfigEntrada { grupo: string; membros: Record<string, string[]>; botJids: string[] }`; `interface Pergunta { id: string; pessoa: string; texto: string }`; `type Entrada = { tipo: 'pergunta'; p: Pergunta } | { tipo: 'nao_texto'; pessoa: string } | { tipo: 'ignorar' }`; `lerWebhook(corpo: unknown, cfg: ConfigEntrada, enviados: ReadonlySet<string>): Entrada`; `lerMembros(v: string): Record<string, string[]>` (formato `Nome=jid1|jid2;Nome2=jid3`); `criarServidor(token: string, aoReceber: (corpo: unknown) => void): http.Server` (rotas `POST /whatsapp?t=` e `GET /saude`).

- [ ] **Step 1: Testes da entrada** — `test/worker/bot-entrada.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lerMembros, lerWebhook } from '../../src/worker/bot/entrada';

const G = '120363000000000001@g.us';
const cfg = { grupo: G, membros: { Matheus: ['5500000000001@s.whatsapp.net', '111@lid'], Ariane: ['5500000000002@s.whatsapp.net', '222@lid'] }, botJids: ['5500000000001@s.whatsapp.net', '111@lid'] };
const msg = (p: { remoteJid?: string; fromMe?: boolean; participant?: string; id?: string; texto?: string; mencoes?: string[]; tipo?: object }) => ({
  event: 'messages.upsert', instance: 'financas',
  data: {
    key: { remoteJid: p.remoteJid ?? G, fromMe: p.fromMe ?? false, id: p.id ?? 'X1', ...(p.participant ? { participant: p.participant } : {}) },
    message: p.tipo ?? (p.mencoes ? { extendedTextMessage: { text: p.texto, contextInfo: { mentionedJid: p.mencoes } } } : { conversation: p.texto }),
  },
});

describe('lerWebhook', () => {
  it('pergunta da Ariane com prefixo "bot" (vírgula, maiúscula): texto limpo', () => {
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'Bot, quanto gastei com mercado?' }), cfg, new Set()))
      .toEqual({ tipo: 'pergunta', p: { id: 'X1', pessoa: 'Ariane', texto: 'quanto gastei com mercado?' } });
  });
  it('menção ao bot também chama; a menção sai do texto', () => {
    expect(lerWebhook(msg({ participant: '5500000000002@s.whatsapp.net', texto: '@5500000000001 dá pra gastar quanto hoje?', mencoes: ['5500000000001@s.whatsapp.net'] }), cfg, new Set()))
      .toMatchObject({ tipo: 'pergunta', p: { pessoa: 'Ariane', texto: 'dá pra gastar quanto hoje?' } });
  });
  it('Matheus pelo próprio celular (fromMe, sem participant) é pergunta dele', () => {
    expect(lerWebhook(msg({ fromMe: true, texto: 'bot trilha' }), cfg, new Set())).toMatchObject({ tipo: 'pergunta', p: { pessoa: 'Matheus', texto: 'trilha' } });
  });
  it('resposta do próprio bot (id enviado) é ignorada', () => {
    expect(lerWebhook(msg({ fromMe: true, id: 'B9', texto: 'bot: 💸 Hoje dá pra gastar' }), cfg, new Set(['B9']))).toEqual({ tipo: 'ignorar' });
  });
  it('outra conversa, não membro, sem chamado, evento diferente: ignorar', () => {
    expect(lerWebhook(msg({ remoteJid: '5599999999999@s.whatsapp.net', texto: 'bot oi' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '999@lid', texto: 'bot oi' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'robotizado não é chamado' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook({ event: 'connection.update', data: {} }, cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(null, cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
  it('áudio mencionando o bot: nao_texto; áudio sem menção: ignorar', () => {
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { audioMessage: { contextInfo: { mentionedJid: ['111@lid'] } } } }), cfg, new Set())).toEqual({ tipo: 'nao_texto', pessoa: 'Ariane' });
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { audioMessage: {} } }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
});

describe('lerMembros', () => {
  it('Nome=jid|jid;Nome=jid', () => {
    expect(lerMembros('Matheus=a@lid|b@s.whatsapp.net;Ariane=c@lid')).toEqual({ Matheus: ['a@lid', 'b@s.whatsapp.net'], Ariane: ['c@lid'] });
    expect(lerMembros('')).toEqual({});
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — FAIL.

- [ ] **Step 3: Implementar `src/worker/bot/entrada.ts`**:

```ts
// E1: filtro do webhook. Nada aqui loga ou grava: o que não é do grupo, de membro e chamando o bot some.
export interface ConfigEntrada { grupo: string; membros: Record<string, string[]>; botJids: string[] }
export interface Pergunta { id: string; pessoa: string; texto: string }
export type Entrada = { tipo: 'pergunta'; p: Pergunta } | { tipo: 'nao_texto'; pessoa: string } | { tipo: 'ignorar' };

const IGNORAR: Entrada = { tipo: 'ignorar' };
const usuario = (jid: string) => jid.split('@')[0].split(':')[0];

export function lerMembros(v: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const par of v.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [nome, jids] = par.split('=');
    if (nome && jids) out[nome.trim()] = jids.split('|').map((j) => j.trim()).filter(Boolean);
  }
  return out;
}

export function lerWebhook(corpo: unknown, cfg: ConfigEntrada, enviados: ReadonlySet<string>): Entrada {
  const c = corpo as any;
  const ev = String(c?.event ?? '').toLowerCase().replace('_', '.');
  if (ev !== 'messages.upsert') return IGNORAR;
  const d = Array.isArray(c.data) ? c.data[0] : c.data;
  const key = d?.key;
  if (!key || key.remoteJid !== cfg.grupo) return IGNORAR;
  if (key.id && enviados.has(key.id)) return IGNORAR;
  // fromMe sem participant = o próprio número conectado (no número de teste, o Matheus pelo celular)
  const candidatos: string[] = key.fromMe
    ? cfg.botJids
    : [key.participant, key.participantAlt, key.participantPn, d?.participant].filter((x): x is string => typeof x === 'string');
  const pessoa = Object.entries(cfg.membros).find(([, jids]) => jids.some((j) => candidatos.some((x) => usuario(x) === usuario(j))))?.[0];
  if (!pessoa) return IGNORAR;
  const m = d.message ?? {};
  const texto: string | null = m.conversation ?? m.extendedTextMessage?.text ?? null;
  const ctx = (Object.values(m).find((x: any) => x?.contextInfo) as any)?.contextInfo;
  const mencoes: string[] = ctx?.mentionedJid ?? [];
  const mencionou = mencoes.some((j) => cfg.botJids.some((b) => usuario(b) === usuario(j)));
  if (texto === null) return mencionou ? { tipo: 'nao_texto', pessoa } : IGNORAR;
  const prefixo = /^\s*bot\b[\s,:;.!-]*/i;
  if (!prefixo.test(texto) && !mencionou) return IGNORAR;
  const limpo = texto.replace(prefixo, '').replace(/@\d+\s*/g, '').trim();
  return { tipo: 'pergunta', p: { id: String(key.id ?? ''), pessoa, texto: limpo || 'oi' } };
}
```

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Testes do servidor** — `test/worker/bot-servidor.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { criarServidor } from '../../src/worker/bot/servidor';

let s: Server | null = null;
afterEach(() => new Promise<void>((r) => (s ? s.close(() => r()) : r())));
const subir = async (aoReceber: (c: unknown) => void) => {
  s = criarServidor('TOKEN-FALSO', aoReceber);
  await new Promise<void>((r) => s!.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(s!.address() as any).port}`;
};

describe('servidor do webhook', () => {
  it('token certo: 200 e entrega o JSON; token errado: 403 e nada entregue', async () => {
    const recebidos: unknown[] = [];
    const u = await subir((c) => recebidos.push(c));
    expect((await fetch(`${u}/whatsapp?t=errado`, { method: 'POST', body: '{"a":1}' })).status).toBe(403);
    expect((await fetch(`${u}/whatsapp?t=TOKEN-FALSO`, { method: 'POST', body: '{"a":1}' })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(recebidos).toEqual([{ a: 1 }]);
  });
  it('corpo inválido: 200 sem entregar; /saude: 200; outra rota: 404', async () => {
    const recebidos: unknown[] = [];
    const u = await subir((c) => recebidos.push(c));
    expect((await fetch(`${u}/whatsapp?t=TOKEN-FALSO`, { method: 'POST', body: 'xx' })).status).toBe(200);
    expect((await fetch(`${u}/saude`)).status).toBe(200);
    expect((await fetch(`${u}/outra`)).status).toBe(404);
    expect(recebidos).toEqual([]);
  });
});
```

- [ ] **Step 6: Rodar e ver falhar; implementar `src/worker/bot/servidor.ts`**:

```ts
// E1: servidor HTTP do webhook (rede interna, sem porta publicada). Responde já e entrega o corpo; não loga corpo.
import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const LIMITE = 1_000_000;
const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function criarServidor(token: string, aoReceber: (corpo: unknown) => void): Server {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'GET' && url.pathname === '/saude') { res.writeHead(200).end('ok'); return; }
    if (req.method !== 'POST' || url.pathname !== '/whatsapp') { res.writeHead(404).end(); return; }
    if (!igual(url.searchParams.get('t') ?? '', token)) { res.writeHead(403).end(); req.resume(); return; }
    const partes: Buffer[] = []; let tam = 0;
    req.on('data', (b: Buffer) => { tam += b.length; if (tam <= LIMITE) partes.push(b); });
    req.on('end', () => {
      res.writeHead(200).end('ok');
      if (tam > LIMITE) return;
      let corpo: unknown;
      try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { return; }
      try { aoReceber(corpo); } catch { /* o processamento tem o próprio tratamento */ }
    });
  });
}
```

Rodar `npx vitest run test/worker/bot-servidor.test.ts test/worker/bot-entrada.test.ts` → PASS.

- [ ] **Step 7: Commit** — `feat(bot): filtro do webhook e servidor interno (E1)`.

---

### Task 5: Groq, ferramentas, formatadores, trava e agente

**Files:**
- Create: `src/worker/bot/groq.ts`, `src/worker/bot/trava.ts`, `src/worker/bot/ferramentas.ts` (schema, rota, texto montado e gráfico de cada ferramenta — mudam juntos), `src/worker/bot/agente.ts`
- Modify: `src/worker/notificacoes/graficos.ts` (nova `graficoBarras`)
- Test: `test/worker/bot-groq.test.ts`, `test/worker/bot-trava.test.ts`, `test/worker/bot-formatadores.test.ts`, `test/worker/bot-agente.test.ts`

**Interfaces:**
- Consumes: JSON da Task 2; `Pergunta` (Task 4).
- Produces:
  - `class ClienteGroq { constructor(apiKey: string, modelos: string[], fetcher?: Fetcher, base?: string); chat(msgs: MsgChat[], tools: object[]): Promise<{ content: string | null; toolCalls: { id: string; nome: string; args: string }[]; modelo: string }>; modelosSumidos(): Promise<string[]> }`; `type MsgChat = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }`.
  - `valoresBRL(texto: string): number[]`; `respostaConfere(resposta: string, resultados: unknown[]): boolean`.
  - `TOOLS: object[]` (schema OpenAI); `NOMES_FERRAMENTAS`; `caminhoDa(nome: string, args: Record<string, unknown>, quem: string): string | null`.
  - `formatar(nome: string, dados: any, painelUrl: string): string`; `graficoDaFerramenta(nome: string, dados: any): string | null`.
  - `responder(p: Pergunta, d: { groq: Pick<ClienteGroq, 'chat'>; painel: (caminho: string) => Promise<{ ok: boolean; dados: any }>; contexto: { pergunta: string; resposta: string }[]; hoje: string; painelUrl: string }): Promise<RespostaBot>`; `RespostaBot = { texto: string; svg: string | null; ferramentas: { nome: string; args: unknown; ok: boolean }[]; modelo: string | null; trava: boolean; semFerramenta: boolean; erro: string | null; ms: number }`; constantes `FALHA`, `SEM_FERRAMENTA`, `SO_TEXTO`.

- [ ] **Step 1: Teste da trava** — `test/worker/bot-trava.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { respostaConfere, valoresBRL } from '../../src/worker/bot/trava';

describe('valoresBRL', () => {
  it('lê R$ com milhar, centavos e sinal', () => {
    expect(valoresBRL('Gastaram R$ 1.234,56 e -R$ 50 e R$ -7,5; nada de 300 sem R$')).toEqual([1234.56, -50, -7.5]);
  });
});

describe('respostaConfere', () => {
  const res = [{ total: 1234.56, itens: [{ nome: 'Mercado', valor: 53.63 }] }];
  it('valor igual ou arredondado ao inteiro: confere; sinal ignorado', () => {
    expect(respostaConfere('🛒 Mercado: R$ 53,63 e total R$ 1.234,56', res)).toBe(true);
    expect(respostaConfere('Mercado deu R$ 54', res)).toBe(true);
    expect(respostaConfere('Faltou R$ 1.234,56', res)).toBe(true);
  });
  it('valor que não veio de ferramenta (soma, invenção): não confere', () => {
    expect(respostaConfere('Juntos dá R$ 1.288,19', res)).toBe(false);
  });
  it('sem R$: confere', () => {
    expect(respostaConfere('Vocês estão na fase 1.', res)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar; implementar `src/worker/bot/trava.ts`**:

```ts
// E1: trava de número. Todo R$ da resposta do modelo tem que ter vindo de uma ferramenta.
export function valoresBRL(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/(-?)\s*R\$\s*(-?)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)) {
    const n = Number(m[3].replace(/\./g, '').replace(',', '.'));
    out.push(m[1] || m[2] ? -n : n);
  }
  return out;
}

function numeros(x: unknown, out: number[] = []): number[] {
  if (typeof x === 'number' && Number.isFinite(x)) out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => numeros(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numeros(v, out));
  return out;
}

export function respostaConfere(resposta: string, resultados: unknown[]): boolean {
  const ok = numeros(resultados).map(Math.abs);
  return valoresBRL(resposta).every((v) => ok.some((n) => Math.abs(Math.abs(v) - n) < 0.006 || Math.abs(Math.abs(v) - Math.round(n)) < 0.006));
}
```

Rodar → PASS.

- [ ] **Step 3: Teste do Groq** — `test/worker/bot-groq.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ClienteGroq } from '../../src/worker/bot/groq';

const resp = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json });
const okChat = { choices: [{ message: { content: 'oi', tool_calls: [{ id: 'c1', function: { name: 'trilha', arguments: '{}' } }] } }] };

describe('ClienteGroq', () => {
  it('usa o primeiro modelo; devolve conteúdo e chamadas', async () => {
    const corpos: any[] = [];
    const g = new ClienteGroq('K-FALSA', ['m1', 'm2'], (async (_u: string, i: any) => { corpos.push(JSON.parse(i.body)); return resp(200, okChat); }) as any);
    expect(await g.chat([{ role: 'user', content: 'x' }], [])).toEqual({ content: 'oi', toolCalls: [{ id: 'c1', nome: 'trilha', args: '{}' }], modelo: 'm1' });
    expect(corpos[0].model).toBe('m1');
  });
  it('modelo descontinuado (404/400 de modelo/503): tenta o próximo', async () => {
    const vistos: string[] = [];
    const g = new ClienteGroq('K', ['velho', 'novo'], (async (_u: string, i: any) => {
      const m = JSON.parse(i.body).model; vistos.push(m);
      return m === 'velho' ? resp(400, { error: { code: 'model_decommissioned', message: 'gone' } }) : resp(200, okChat);
    }) as any);
    expect((await g.chat([], [])).modelo).toBe('novo');
    expect(vistos).toEqual(['velho', 'novo']);
  });
  it('todos falham: erro sem a chave', async () => {
    const g = new ClienteGroq('K-FALSA', ['a'], (async () => resp(503, { error: { message: 'K-FALSA indisponível' } })) as any);
    await expect(g.chat([], [])).rejects.toThrow(/Groq/);
    await expect(g.chat([], [])).rejects.not.toThrow(/K-FALSA/);
  });
  it('modelosSumidos: os da lista que não estão em /models', async () => {
    const g = new ClienteGroq('K', ['a', 'b'], (async () => resp(200, { data: [{ id: 'a' }] })) as any);
    expect(await g.modelosSumidos()).toEqual(['b']);
  });
});
```

- [ ] **Step 4: Rodar e ver falhar; implementar `src/worker/bot/groq.ts`**:

```ts
// E1: cliente da Groq (API compatível com OpenAI). Lista de modelos em ordem: modelo sumido → próximo.
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;
export type MsgChat = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

const TROCA = new Set([404, 503, 429]);

export class ClienteGroq {
  constructor(
    private readonly apiKey: string, private readonly modelos: string[],
    private readonly fetcher: Fetcher = fetch as unknown as Fetcher, private readonly base = 'https://api.groq.com/openai/v1',
  ) {}

  private semChave(s: string) { return this.apiKey ? s.split(this.apiKey).join('***') : s; }

  async chat(msgs: MsgChat[], tools: object[]): Promise<{ content: string | null; toolCalls: { id: string; nome: string; args: string }[]; modelo: string }> {
    let ultimo = 'sem modelo';
    for (const modelo of this.modelos) {
      let r;
      try {
        r = await this.fetcher(`${this.base}/chat/completions`, {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, messages: msgs, ...(tools.length ? { tools, tool_choice: 'auto' } : {}), temperature: 0.2 }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        ultimo = `${modelo}: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
      if (r.ok) {
        const m = (await r.json())?.choices?.[0]?.message ?? {};
        return {
          content: m.content ?? null, modelo,
          toolCalls: (m.tool_calls ?? []).map((t: any) => ({ id: t.id, nome: t.function?.name, args: t.function?.arguments ?? '{}' })),
        };
      }
      const j = await r.json().catch(() => ({}));
      ultimo = `${modelo}: HTTP ${r.status} ${j?.error?.code ?? ''} ${j?.error?.message ?? ''}`.trim();
      const deModelo = /model/i.test(`${j?.error?.code ?? ''} ${j?.error?.message ?? ''}`);
      if (!(TROCA.has(r.status) || (r.status === 400 && deModelo))) break;
    }
    throw new Error(this.semChave(`Groq: ${ultimo}`));
  }

  async modelosSumidos(): Promise<string[]> {
    const r = await this.fetcher(`${this.base}/models`, { method: 'GET', headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(this.semChave(`Groq /models HTTP ${r.status}`));
    const ids = new Set(((await r.json())?.data ?? []).map((m: any) => m.id));
    return this.modelos.filter((m) => !ids.has(m));
  }
}
```

(Timeout/erro de rede também passa ao próximo modelo — `continue` — e só no fim vira erro.) Rodar → PASS.

- [ ] **Step 5: `graficoBarras`** — em `src/worker/notificacoes/graficos.ts`, extrair o corpo de `graficoSemanal` para:

```ts
/** Barras horizontais (até 6): valor = barra; ref (opcional) = traço; cor pela ref (vermelho acima, verde abaixo) ou cinza sem ref. */
export function graficoBarras(titulo: string, itens: { nome: string; valor: number; ref?: number }[]): string | null {
  const gs = itens.filter((g) => g.valor > 0 || (g.ref ?? 0) > 0).slice(0, 6);
  if (!gs.length) return null;
  const max = Math.max(...gs.map((g) => Math.max(g.valor, g.ref ?? 0)), 1) * 1.15;
  const xb = 250, xf = W - 150, topo = 100, alt = (H - topo - 30) / 6;
  const L = (v: number) => ((xf - xb) * v) / max;
  const corpo = [texto(40, 56, titulo, 24, SUAVE)];
  gs.forEach((g, i) => {
    const y = topo + i * alt, cor = g.ref === undefined ? CINZA : g.valor > g.ref ? VERM : VERDE;
    corpo.push(
      texto(40, y + alt / 2 + 8, g.nome, 22, TEXTO),
      `<rect class="barra" x="${xb}" y="${f(y + 10)}" width="${f(Math.max(4, L(g.valor)))}" height="${f(alt - 20)}" rx="8" fill="${cor}"/>`,
      g.ref === undefined ? '' : `<line class="media" x1="${f(xb + L(g.ref))}" y1="${f(y + 2)}" x2="${f(xb + L(g.ref))}" y2="${f(y + alt - 2)}" stroke="${TEXTO}" stroke-width="4"/>`,
      texto(W - 30, y + alt / 2 + 8, brlCurto(g.valor), 20, SUAVE, ' text-anchor="end"'),
    );
  });
  return svg(corpo);
}
```

e `graficoSemanal` vira: ordenar/filtrar como hoje e `return graficoBarras('semana × média (traço)', gs.map((g) => ({ nome: g.nome, valor: g.semana, ref: g.media })));`. Rodar `npx vitest run test/worker/notificacoes-graficos.test.ts` → PASS (comportamento igual).

- [ ] **Step 6: Testes dos formatadores** — `test/worker/bot-formatadores.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { caminhoDa, formatar, graficoDaFerramenta, NOMES_FERRAMENTAS, TOOLS } from '../../src/worker/bot/ferramentas';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ferramentas', () => {
  it('8 ferramentas, schema com nome e parâmetros', () => {
    expect(NOMES_FERRAMENTAS).toEqual(['situacao_mes', 'gasto_periodo', 'maiores_gastos', 'comparar', 'faturas', 'contas_do_mes', 'trilha', 'simular_compra']);
    expect(TOOLS.every((t: any) => t.type === 'function' && t.function.parameters)).toBe(true);
  });
  it('caminho: query com período, pessoa ("eu" vira quem perguntou) e grupo; nome desconhecido → null', () => {
    expect(caminhoDa('gasto_periodo', { periodo: 'este_mes', pessoa: 'eu', grupo: 'Mercado' }, 'Ariane')).toBe('/api/bot/gasto?periodo=este_mes&pessoa=Ariane&grupo=Mercado');
    expect(caminhoDa('comparar', { periodo_a: 'este_mes', periodo_b: 'mes_passado' }, 'Matheus')).toBe('/api/bot/comparar?periodo=este_mes&periodo_b=mes_passado&pessoa=casal');
    expect(caminhoDa('simular_compra', { valor_total: 3000, parcelas: 10 }, 'Matheus')).toBe('/api/bot/simular?valor_total=3000&parcelas=10');
    expect(caminhoDa('trilha', {}, 'Matheus')).toBe('/api/bot/trilha');
    expect(caminhoDa('apagar_tudo', {}, 'Matheus')).toBeNull();
  });
});

describe('formatar (texto montado da trava)', () => {
  it('gasto_periodo', () => {
    expect(formatar('gasto_periodo', { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 450, itens: [{ nome: 'Mercado', valor: 400 }, { nome: 'Comer fora', valor: 50 }], link: '/gastos' }, 'https://p'))
      .toBe([`💰 Gasto em out/26 (casal): *${brl(450)}*`, `• Mercado: ${brl(400)}`, `• Comer fora: ${brl(50)}`, '', '👉 https://p/gastos'].join('\n'));
  });
  it('situacao_mes, simular_compra (cabe e não cabe), trilha', () => {
    expect(formatar('situacao_mes', { mesLabel: 'out/26', dapraGastarHoje: 50, ritmoAtualDia: 80, diasRestantes: 10, fechaCom: -500, saiDoVermelho: null, link: '/' }, 'https://p'))
      .toContain(`💸 Hoje dá pra gastar *${brl(50)}*`);
    expect(formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: true, mesQueFura: null, aprofunda: 0, link: '/simulador' }, 'https://p'))
      .toContain('✅ Cabe');
    expect(formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: false, mesQueFura: 'jan/27', aprofunda: 900, link: '/simulador' }, 'https://p'))
      .toContain('❌ Não cabe: jan/27 vai para o vermelho');
    expect(formatar('trilha', { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Pagar a fatura.', reserva: { aplicado: 100, meta: 1000 }, link: '/trilha' }, 'https://p'))
      .toContain('🧭 Fase 1 de 4 ▰▱▱▱: Sair das dívidas');
  });
  it('todo formatador termina com o link e não tem NaN', () => {
    const exemplos: Record<string, any> = {
      maiores_gastos: { periodo: 'hoje', pessoa: 'casal', grupo: null, itens: [{ data: '11/10', valor: 10, descricao: 'X', pessoa: 'Ariane' }], link: '/buscar' },
      comparar: { a: 'out/26', b: 'set/26', pessoa: 'casal', totalA: 10, totalB: 20, diferenca: -10, pct: -50, grupos: [{ nome: 'Mercado', a: 10, b: 20, diferenca: -10 }], link: '/gastos' },
      faturas: { itens: [{ banco: 'B', pessoa: 'Ariane', valor: 100, vencimento: '15/10', paga: false }], total: 100, link: '/faturas' },
      contas_do_mes: { mesLabel: 'out/26', pagas: [{ nome: 'Luz', valor: 100 }], falta: [{ nome: 'Água', valor: 80, vence: 20 }], aConfirmar: [], totalFalta: 80, link: '/contas' },
    };
    for (const [n, d] of Object.entries(exemplos)) {
      const t = formatar(n, d, 'https://p');
      expect(t.endsWith(`👉 https://p${d.link}`)).toBe(true);
      expect(t).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('gráfico da ferramenta', () => {
  it('gasto_periodo e comparar têm barras; o resto não', () => {
    expect(graficoDaFerramenta('gasto_periodo', { periodo: 'out/26', itens: [{ nome: 'Mercado', valor: 400 }] })).toContain('class="barra"');
    expect(graficoDaFerramenta('comparar', { a: 'out/26', b: 'set/26', grupos: [{ nome: 'Mercado', a: 10, b: 20, diferenca: -10 }] })).toContain('class="media"');
    expect(graficoDaFerramenta('trilha', {})).toBeNull();
  });
});
```

- [ ] **Step 7: Rodar e ver falhar; implementar `src/worker/bot/ferramentas.ts`** (schemas, caminhos, formatadores e gráficos num arquivo — tudo o que muda junto quando uma ferramenta muda):

```ts
// E1: as 8 ferramentas do bot — schema para o Groq, rota do painel, texto montado (trava) e gráfico.
import { GRUPOS_VALIDOS } from '../../lib/grupos';
import { barraTrilha } from '../notificacoes/textosD';
import { graficoBarras } from '../notificacoes/graficos';

const PERIODO = { type: 'string', description: 'hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM' };
const PESSOA = { type: 'string', enum: ['casal', 'Matheus', 'Ariane', 'eu'], description: 'padrão casal; "eu" = quem perguntou' };
const GRUPO = { type: 'string', enum: GRUPOS_VALIDOS, description: 'grupo de gasto do painel (opcional)' };
const fn = (name: string, description: string, properties: object = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const TOOLS = [
  fn('situacao_mes', 'Quanto dá pra gastar hoje, ritmo de gasto por dia, como o mês fecha e quando sai do vermelho.'),
  fn('gasto_periodo', 'Total gasto num período, dividido por grupo (ou por categoria dentro de um grupo).', { periodo: PERIODO, pessoa: PESSOA, grupo: GRUPO }, ['periodo']),
  fn('maiores_gastos', 'Os maiores lançamentos de gasto de um período (até 10).', { periodo: PERIODO, pessoa: PESSOA, grupo: GRUPO }, ['periodo']),
  fn('comparar', 'Compara o gasto de dois períodos, por grupo, com a diferença pronta.', { periodo_a: PERIODO, periodo_b: PERIODO, pessoa: PESSOA }, ['periodo_a', 'periodo_b']),
  fn('faturas', 'Faturas dos cartões: valor, vencimento e se já foram pagas.'),
  fn('contas_do_mes', 'Contas fixas do mês: pagas, em falta (com vencimento) e a confirmar.'),
  fn('trilha', 'Fase atual da trilha (dívidas → sobrar → reserva → patrimônio), próximo passo e reserva.'),
  fn('simular_compra', 'Se uma compra cabe na previsão: valor total e número de parcelas.', { valor_total: { type: 'number' }, parcelas: { type: 'integer', minimum: 1, maximum: 48 } }, ['valor_total']),
];
export const NOMES_FERRAMENTAS = TOOLS.map((t) => t.function.name);

const ROTA: Record<string, string> = {
  situacao_mes: 'situacao', gasto_periodo: 'gasto', maiores_gastos: 'maiores', comparar: 'comparar',
  faturas: 'faturas', contas_do_mes: 'contas', trilha: 'trilha', simular_compra: 'simular',
};

export function caminhoDa(nome: string, args: Record<string, unknown>, quem: string): string | null {
  const rota = ROTA[nome];
  if (!rota) return null;
  const q = new URLSearchParams();
  const pessoa = () => { const p = String(args.pessoa ?? 'casal'); q.set('pessoa', p === 'eu' ? quem : p); };
  if (nome === 'gasto_periodo' || nome === 'maiores_gastos') {
    q.set('periodo', String(args.periodo ?? '')); pessoa(); if (args.grupo) q.set('grupo', String(args.grupo));
  } else if (nome === 'comparar') {
    q.set('periodo', String(args.periodo_a ?? '')); q.set('periodo_b', String(args.periodo_b ?? '')); pessoa();
  } else if (nome === 'simular_compra') {
    q.set('valor_total', String(args.valor_total ?? '')); q.set('parcelas', String(args.parcelas ?? 1));
  }
  const s = q.toString();
  return `/api/bot/${rota}${s ? `?${s}` : ''}`;
}

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fim = (painel: string, link: string) => ['', `👉 ${painel.replace(/\/+$/, '')}${link}`];
const quem = (p: string) => (p === 'casal' ? 'casal' : p);

export function formatar(nome: string, d: any, painel: string): string {
  const l: string[] = [];
  switch (nome) {
    case 'situacao_mes':
      if (d.diasRestantes > 0) {
        l.push(`💸 Hoje dá pra gastar *${brl(d.dapraGastarHoje)}*`);
        l.push(`${d.ritmoAtualDia > d.dapraGastarHoje ? '🔥' : '🐢'} Ritmo: ${brl(d.ritmoAtualDia)} por dia`);
      }
      l.push(`${d.fechaCom < 0 ? '📉' : '📈'} ${d.mesLabel} fecha em *${brl(d.fechaCom)}*`);
      if (d.fechaCom < 0) l.push(d.saiDoVermelho ? `🗓️ Sai do vermelho em ${d.saiDoVermelho}` : '🗓️ Não sai do vermelho nos próximos 24 meses');
      break;
    case 'gasto_periodo':
      l.push(`💰 Gasto em ${d.periodo} (${quem(d.pessoa)}${d.grupo ? `, ${d.grupo}` : ''}): *${brl(d.total)}*`);
      for (const i of d.itens.slice(0, 6)) l.push(`• ${i.nome}: ${brl(i.valor)}`);
      if (!d.itens.length) l.push('💤 Nenhum gasto no período.');
      break;
    case 'maiores_gastos':
      l.push(`🧾 Maiores gastos em ${d.periodo} (${quem(d.pessoa)}${d.grupo ? `, ${d.grupo}` : ''})`);
      for (const i of d.itens.slice(0, 8)) l.push(`• ${i.data} ${i.descricao}: ${brl(i.valor)} (${i.pessoa})`);
      if (!d.itens.length) l.push('💤 Nenhum gasto no período.');
      break;
    case 'comparar':
      l.push(`📊 ${d.a} × ${d.b} (${quem(d.pessoa)})`);
      l.push(`💰 ${brl(d.totalA)} × ${brl(d.totalB)}${d.pct === null ? '' : `, ${d.diferenca > 0 ? `🔺 ${d.pct}%` : `🔻 ${Math.abs(d.pct)}%`}`}`);
      for (const g of d.grupos.slice(0, 5)) l.push(`${g.diferenca > 0 ? '⬆️' : g.diferenca < 0 ? '⬇️' : '➖'} ${g.nome}: ${brl(g.a)} × ${brl(g.b)}`);
      break;
    case 'faturas':
      l.push(`💳 Faturas: *${brl(d.total)}* em aberto`);
      for (const f of d.itens) l.push(`${f.paga ? '✅' : '🔸'} ${f.banco} (${f.pessoa}): ${brl(f.valor)}${f.vencimento ? `, vence ${f.vencimento}` : ''}`);
      break;
    case 'contas_do_mes':
      l.push(`🧾 Contas de ${d.mesLabel}: falta *${brl(d.totalFalta)}*`);
      for (const c of d.falta) l.push(`🔸 ${c.nome}: ${brl(c.valor)}${c.vence ? `, vence dia ${c.vence}` : ''}`);
      for (const c of d.aConfirmar) l.push(`❔ ${c.nome}: ${brl(c.valor)} (marcada, banco não confirmou)`);
      if (d.pagas.length) l.push(`✅ ${d.pagas.length} paga(s)`);
      break;
    case 'trilha':
      l.push(`🧭 Fase ${d.fase} de 4 ${barraTrilha(d.fase)}: ${d.titulo}`);
      l.push(`➡️ ${d.proximoPasso}`);
      l.push(`🛟 Reserva: ${brl(d.reserva.aplicado)} de ${brl(d.reserva.meta)}`);
      break;
    case 'simular_compra':
      l.push(`🛒 Compra de ${brl(d.valorTotal)} em ${d.parcelas}x de ${brl(d.parcela)}`);
      l.push(d.cabe ? '✅ Cabe: nenhum mês vai para o vermelho por causa dela' : `❌ Não cabe: ${d.mesQueFura} vai para o vermelho`);
      if (d.aprofunda > 0) l.push(`📉 Aprofunda o pior mês em ${brl(d.aprofunda)}`);
      break;
    default:
      return 'Não sei responder isso.';
  }
  return [...l, ...fim(painel, d.link ?? '/')].join('\n');
}

export function graficoDaFerramenta(nome: string, d: any): string | null {
  try {
    if (nome === 'gasto_periodo') return graficoBarras(`gasto em ${d.periodo}`, (d.itens ?? []).map((i: any) => ({ nome: i.nome, valor: i.valor })));
    if (nome === 'comparar') return graficoBarras(`${d.a} × ${d.b} (traço)`, (d.grupos ?? []).map((g: any) => ({ nome: g.nome, valor: g.a, ref: g.b })));
  } catch { /* gráfico nunca derruba a resposta */ }
  return null;
}
```

Rodar → PASS.

- [ ] **Step 8: Testes do agente** — `test/worker/bot-agente.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FALHA, responder, SEM_FERRAMENTA } from '../../src/worker/bot/agente';

const p = { id: 'X', pessoa: 'Ariane', texto: 'quanto gastei com mercado?' };
const gasto = { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 450, itens: [{ nome: 'Mercado', valor: 400 }, { nome: 'Comer fora', valor: 50 }], link: '/gastos' };
const painel = async (c: string) => (c.startsWith('/api/bot/gasto') ? { ok: true, dados: gasto } : { ok: false, dados: { erro: 'x' } });
const groqRoteiro = (passos: any[]) => { let i = 0; const vistos: any[] = []; return { vistos, chat: async (msgs: any) => { vistos.push(msgs); return passos[i++]; } }; };
const base = { contexto: [], hoje: '2026-10-11', painelUrl: 'https://p', painel };

describe('agente', () => {
  it('chama a ferramenta e usa a resposta do modelo quando os R$ conferem; gráfico vem junto', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes","grupo":null}' }], modelo: 'm' },
      { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.texto).toBe('🛒 Mercado: R$ 400,00 este mês.');
    expect(r.trava).toBe(false);
    expect(r.ferramentas).toEqual([{ nome: 'gasto_periodo', args: { periodo: 'este_mes', grupo: null }, ok: true }]);
    expect(r.svg).toContain('class="barra"');
    expect(JSON.stringify(g.vistos[0])).toContain('Ariane');
    expect(JSON.stringify(g.vistos[0])).toContain('2026-10-11');
  });
  it('R$ inventado: trava troca pelo texto montado', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: 'Deu R$ 999,99.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.trava).toBe(true);
    expect(r.texto).toContain('💰 Gasto em out/26');
  });
  it('sem ferramenta: "ainda não sei"', async () => {
    const r = await responder(p, { ...base, groq: groqRoteiro([{ content: 'Vai chover amanhã.', toolCalls: [], modelo: 'm' }]) });
    expect(r.texto).toBe(SEM_FERRAMENTA);
    expect(r.semFerramenta).toBe(true);
  });
  it('Groq falhou: mensagem de falha e erro registrado', async () => {
    const r = await responder(p, { ...base, groq: { chat: async () => { throw new Error('Groq: m: HTTP 503'); } } });
    expect(r.texto).toBe(FALHA);
    expect(r.erro).toBe('Groq: m: HTTP 503');
  });
  it('no máximo 4 rodadas de ferramenta; depois usa o texto montado da última', async () => {
    const chamada = { content: null, toolCalls: [{ id: 'c', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' };
    const g = groqRoteiro([chamada, chamada, chamada, chamada, chamada]);
    const r = await responder(p, { ...base, groq: g });
    expect(g.vistos.length).toBe(4);
    expect(r.texto).toContain('💰 Gasto em out/26');
  });
  it('argumento inválido do modelo (JSON quebrado) não derruba: ferramenta com erro', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{periodo' }], modelo: 'm' },
      { content: 'Não consegui ver os dados.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.ferramentas[0].ok).toBe(false);
    expect(r.texto).toBe('Não consegui ver os dados.');
  });
});
```

- [ ] **Step 9: Rodar e ver falhar; implementar `src/worker/bot/agente.ts`**:

```ts
// E1: o agente — o Groq escolhe ferramentas e escreve; números só das ferramentas (trava); até 4 rodadas.
import { caminhoDa, formatar, graficoDaFerramenta, TOOLS } from './ferramentas';
import type { ClienteGroq, MsgChat } from './groq';
import type { Pergunta } from './entrada';
import { respostaConfere } from './trava';

export const FALHA = '⚠️ Não consegui responder agora. Tenta de novo em alguns minutos.';
export const SEM_FERRAMENTA = '🤷 Ainda não sei responder isso. Anotei a pergunta.';
export const SO_TEXTO = '🎧 Por enquanto só leio texto.';
const RODADAS = 4;

export interface RespostaBot {
  texto: string; svg: string | null; ferramentas: { nome: string; args: unknown; ok: boolean }[];
  modelo: string | null; trava: boolean; semFerramenta: boolean; erro: string | null; ms: number;
}

const SISTEMA = (quem: string, hoje: string) => [
  'Você é o assistente financeiro do casal Matheus e Ariane, num grupo de WhatsApp.',
  `Quem perguntou: ${quem}. Hoje é ${hoje} (horário de São Paulo).`,
  'Use SEMPRE as ferramentas para qualquer número. Nunca some, subtraia, calcule percentual ou invente valor: copie os valores das ferramentas.',
  'Se nenhuma ferramenta serve, diga que ainda não sabe responder. Não chute.',
  'Responda em português, tom contido, até 8 linhas, um emoji no começo de cada linha, *negrito* do WhatsApp para o número principal.',
  'Períodos: hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM. "Eu" = quem perguntou.',
].join('\n');

export async function responder(p: Pergunta, d: {
  groq: Pick<ClienteGroq, 'chat'>; painel: (caminho: string) => Promise<{ ok: boolean; dados: any }>;
  contexto: { pergunta: string; resposta: string }[]; hoje: string; painelUrl: string;
}): Promise<RespostaBot> {
  const t0 = Date.now();
  const ferramentas: RespostaBot['ferramentas'] = [];
  const resultados: unknown[] = [];
  let ultima: { nome: string; dados: any } | null = null;
  const msgs: MsgChat[] = [
    { role: 'system', content: SISTEMA(p.pessoa, d.hoje) },
    ...d.contexto.flatMap((c): MsgChat[] => [{ role: 'user', content: c.pergunta }, { role: 'assistant', content: c.resposta }]),
    { role: 'user', content: p.texto },
  ];
  const fimCom = (texto: string, extra: Partial<RespostaBot> = {}): RespostaBot => ({
    texto, svg: ultima ? graficoDaFerramenta(ultima.nome, ultima.dados) : null, ferramentas, modelo: null,
    trava: false, semFerramenta: false, erro: null, ms: Date.now() - t0, ...extra,
  });
  let modelo: string | null = null;
  try {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const r = await d.groq.chat(msgs, TOOLS);
      modelo = r.modelo;
      if (!r.toolCalls.length) {
        const texto = (r.content ?? '').trim();
        if (!ferramentas.length) return fimCom(SEM_FERRAMENTA, { modelo, semFerramenta: true });
        if (!texto || !respostaConfere(texto, resultados)) {
          // sem dado de ferramenta para montar: não arrisca texto com número não conferido
          return ultima ? fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: !!texto }) : fimCom(FALHA, { modelo, erro: 'resposta sem dados conferidos' });
        }
        return fimCom(texto, { modelo });
      }
      msgs.push({ role: 'assistant', content: r.content, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.nome, arguments: t.args } })) });
      for (const t of r.toolCalls) {
        let args: Record<string, unknown> = {};
        let res: { ok: boolean; dados: any };
        try { args = JSON.parse(t.args || '{}'); } catch { args = {}; }
        const caminho = /^\s*\{[\s\S]*\}\s*$/.test(t.args || '{}') ? caminhoDa(t.nome, args, p.pessoa) : null;
        res = caminho ? await d.painel(caminho).catch((e) => ({ ok: false, dados: { erro: String(e) } })) : { ok: false, dados: { erro: 'ferramenta ou argumentos inválidos' } };
        ferramentas.push({ nome: t.nome, args, ok: res.ok });
        if (res.ok) { resultados.push(res.dados); ultima = { nome: t.nome, dados: res.dados }; }
        msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(res.dados) });
      }
    }
    // rodadas esgotadas: responde com o que já tem
    return ultima ? fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: true }) : fimCom(FALHA, { modelo, erro: 'rodadas esgotadas sem dados' });
  } catch (e) {
    return fimCom(FALHA, { modelo, erro: e instanceof Error ? e.message : String(e), svg: null });
  }
}
```

Rodar `npx vitest run test/worker/bot-*.test.ts` → PASS.

- [ ] **Step 10: Commit** — `feat(bot): groq com reserva, ferramentas, trava de numero e agente (E1)`.

---

### Task 6: Fila, envio, montagem no worker e aviso técnico

**Files:**
- Create: `src/worker/bot/fila.ts`, `src/worker/bot/bot.ts`
- Modify: `src/worker/notificacoes/whatsapp.ts` (`enviarComId`, `enviarImagemComId`), `src/worker/notificacoes/textosD.ts` (`DadosTecnico.bot?`), `src/worker/notificacoes/fontes.ts` (técnico lê o bot), `src/worker/index.ts`
- Test: `test/worker/bot-fila.test.ts`, `test/worker/bot-bot.test.ts`, `test/worker/notificacoes-whatsapp.test.ts`, `test/worker/notificacoes-textosD.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: `class FilaBot<T> { constructor(processar: (x: T) => Promise<void>, max: number, cheia: (x: T) => void); colocar(x: T): void; tamanho(): number }`; `criarBot(d: { cfg: ConfigEntrada; groq; painel; registro: Pick<PgRegistroBot,'gravar'|'contexto'>; wa: { enviarComId(t: string): Promise<string | null>; enviarImagemComId(png: Buffer, l: string): Promise<string | null> }; renderizar: (svg: string) => Promise<Buffer>; hoje: () => string; painelUrl: string; log: (m: string) => void }): { receber(corpo: unknown): void; enviados: Set<string> }`; `DadosTecnico.bot?: { falhas24h: number; modelosSumidos: string[] }`.

- [ ] **Step 1: Teste da fila** — `test/worker/bot-fila.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FilaBot } from '../../src/worker/bot/fila';

describe('FilaBot', () => {
  it('processa um por vez, na ordem; erro de um não para a fila', async () => {
    const ordem: string[] = [];
    let soltar!: () => void;
    const f = new FilaBot<string>(async (x) => {
      if (x === 'a') await new Promise<void>((r) => (soltar = r));
      if (x === 'b') throw new Error('falhou');
      ordem.push(x);
    }, 5, () => {});
    f.colocar('a'); f.colocar('b'); f.colocar('c');
    expect(ordem).toEqual([]);
    soltar();
    await new Promise((r) => setTimeout(r, 20));
    expect(ordem).toEqual(['a', 'c']);
  });
  it('acima do máximo: avisa "cheia" e não enfileira', async () => {
    const cheias: string[] = [];
    const f = new FilaBot<string>(() => new Promise(() => {}), 2, (x) => cheias.push(x));
    ['a', 'b', 'c', 'd'].forEach((x) => f.colocar(x));
    expect(cheias).toEqual(['d']);
  });
});
```


- [ ] **Step 2: Rodar e ver falhar; implementar `src/worker/bot/fila.ts`**:

```ts
// E1: uma pergunta por vez, na ordem de chegada. Mais de `max` esperando → avisa e descarta.
export class FilaBot<T> {
  private espera: T[] = [];
  private rodando = false;
  constructor(private readonly processar: (x: T) => Promise<void>, private readonly max: number, private readonly cheia: (x: T) => void) {}

  tamanho(): number { return this.espera.length + (this.rodando ? 1 : 0); }

  colocar(x: T): void {
    if (this.espera.length >= this.max) { this.cheia(x); return; }
    this.espera.push(x);
    void this.drenar();
  }

  private async drenar(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    while (this.espera.length) {
      const x = this.espera.shift()!;
      try { await this.processar(x); } catch { /* o processar registra o próprio erro */ }
    }
    this.rodando = false;
  }
}
```

(Nota: com `max = 2`, `a` sai da espera ao começar a rodar, então a espera aceita `b`,`c` e recusa `d` — bate com o teste.) Rodar → PASS.

- [ ] **Step 3: WhatsApp com id** — teste em `test/worker/notificacoes-whatsapp.test.ts`:

```ts
describe('WhatsApp: id da mensagem enviada (E1)', () => {
  it('enviarComId e enviarImagemComId devolvem key.id', async () => {
    const c = new CanalWhatsApp('http://evo', 'K', 'financas', 'G', (async () => ({ ok: true, json: async () => ({ key: { id: 'MSG1' } }) })) as any);
    expect(await c.enviarComId('oi')).toBe('MSG1');
    expect(await c.enviarImagemComId(Buffer.from('x'), 'l')).toBe('MSG1');
  });
});
```

Implementar: `post` passa a devolver `Promise<any>` (o JSON da resposta, `await r.json().catch(() => ({}))` quando ok); `enviar`/`enviarImagem` continuam `void`; novos:

```ts
  async enviarComId(texto: string): Promise<string | null> {
    return (await this.post('sendText', { number: this.destino, text: texto }, 15000))?.key?.id ?? null;
  }

  async enviarImagemComId(png: Buffer, legenda: string): Promise<string | null> {
    return (await this.post('sendMedia', {
      number: this.destino, mediatype: 'image', mimetype: 'image/png', fileName: 'grafico.png', caption: legenda, media: png.toString('base64'),
    }, 30000))?.key?.id ?? null;
  }
```

Rodar `npx vitest run test/worker/notificacoes-whatsapp.test.ts` → PASS.

- [ ] **Step 4: Teste do bot montado** — `test/worker/bot-bot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { criarBot } from '../../src/worker/bot/bot';

const G = 'G@g.us';
const cfg = { grupo: G, membros: { Ariane: ['222@lid'] }, botJids: ['111@lid'] };
const ev = (texto: string, remoteJid = G, id = 'Q1') => ({ event: 'messages.upsert', data: { key: { remoteJid, fromMe: false, id, participant: '222@lid' }, message: { conversation: texto } } });
const espera = () => new Promise((r) => setTimeout(r, 20));

function montar(groqResp: any[] = [{ content: 'Fase 1.', toolCalls: [], modelo: 'm' }]) {
  const enviados: string[] = []; const gravados: any[] = []; const logs: string[] = []; let chamadasGroq = 0;
  const bot = criarBot({
    cfg, painel: async () => ({ ok: true, dados: {} }),
    groq: { chat: async () => { chamadasGroq++; return groqResp.shift() ?? { content: 'x', toolCalls: [], modelo: 'm' }; } },
    registro: { gravar: async (l: any) => { gravados.push(l); }, contexto: async () => [] },
    wa: { enviarComId: async (t: string) => { enviados.push(t); return `R${enviados.length}`; }, enviarImagemComId: async (_p: Buffer, l: string) => { enviados.push(`[img] ${l}`); return 'I1'; } },
    renderizar: async () => Buffer.from('png'), hoje: () => '2026-10-11', painelUrl: 'https://p', log: (m) => logs.push(m),
  });
  return { bot, enviados, gravados, logs, groq: () => chamadasGroq };
}

describe('bot montado', () => {
  it('mensagem de outra conversa: nada enviado, gravado, logado ou perguntado ao Groq', async () => {
    const m = montar();
    m.bot.receber(ev('bot quanto gastei', '5599@s.whatsapp.net'));
    await espera();
    expect([m.enviados, m.gravados, m.logs, m.groq()]).toEqual([[], [], [], 0]);
  });
  it('pergunta válida: responde no grupo, guarda o id da resposta e registra sem JID', async () => {
    const m = montar();
    m.bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(m.enviados).toEqual(['🤷 Ainda não sei responder isso. Anotei a pergunta.']);
    expect(m.bot.enviados.has('R1')).toBe(true);
    expect(m.gravados[0]).toMatchObject({ pessoa: 'Ariane', pergunta: 'qual a fase?', semFerramenta: true });
    expect(JSON.stringify(m.gravados)).not.toMatch(/@lid|@g\.us|@s\.whatsapp/);
  });
  it('áudio chamando o bot: "só leio texto", sem Groq', async () => {
    const m = montar();
    m.bot.receber({ event: 'messages.upsert', data: { key: { remoteJid: G, fromMe: false, id: 'A1', participant: '222@lid' }, message: { audioMessage: { contextInfo: { mentionedJid: ['111@lid'] } } } } });
    await espera();
    expect(m.enviados).toEqual(['🎧 Por enquanto só leio texto.']);
    expect(m.groq()).toBe(0);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar; implementar `src/worker/bot/bot.ts`**:

```ts
// E1: liga as peças — webhook → filtro → fila → agente → WhatsApp → registro.
import { responder, SO_TEXTO, type RespostaBot } from './agente';
import { lerWebhook, type ConfigEntrada, type Pergunta } from './entrada';
import { FilaBot } from './fila';
import type { ClienteGroq } from './groq';
import type { PgRegistroBot } from './registro';

const CHEIA = '⏳ Muitas perguntas de uma vez, manda de novo daqui a pouco.';
const LEMBRAR = 200;

export function criarBot(d: {
  cfg: ConfigEntrada; groq: Pick<ClienteGroq, 'chat'>; painel: (c: string) => Promise<{ ok: boolean; dados: any }>;
  registro: Pick<PgRegistroBot, 'gravar' | 'contexto'>;
  wa: { enviarComId(t: string): Promise<string | null>; enviarImagemComId(png: Buffer, l: string): Promise<string | null> };
  renderizar: (svg: string) => Promise<Buffer>; hoje: () => string; painelUrl: string; log: (m: string) => void;
}) {
  const enviados = new Set<string>();
  const lembrar = (id: string | null) => {
    if (!id) return;
    enviados.add(id);
    if (enviados.size > LEMBRAR) enviados.delete(enviados.values().next().value as string);
  };
  const mandar = async (texto: string, svg: string | null) => {
    if (svg) {
      try { lembrar(await d.wa.enviarImagemComId(await d.renderizar(svg), texto)); return; } catch { /* cai para o texto */ }
    }
    lembrar(await d.wa.enviarComId(texto));
  };

  const fila = new FilaBot<Pergunta>(async (p) => {
    const contexto = await d.registro.contexto(30, 3).catch(() => []);
    const r: RespostaBot = await responder(p, { groq: d.groq, painel: d.painel, contexto, hoje: d.hoje(), painelUrl: d.painelUrl });
    let erroEnvio: string | null = null;
    try { await mandar(r.texto, r.svg); } catch (e) { erroEnvio = `envio: ${e instanceof Error ? e.message : String(e)}`; }
    await d.registro.gravar({
      pessoa: p.pessoa, pergunta: p.texto, ferramentas: r.ferramentas, resposta: r.texto, modelo: r.modelo, ms: r.ms,
      trava: r.trava, semFerramenta: r.semFerramenta, erro: r.erro ?? erroEnvio,
    }).catch((e) => d.log(`bot: falha ao registrar (${e instanceof Error ? e.message : String(e)})`));
    if (r.erro || erroEnvio) d.log(`bot: pergunta de ${p.pessoa} com erro (${r.erro ?? erroEnvio})`);
  }, 5, () => { void mandar(CHEIA, null).catch(() => {}); });

  return {
    enviados,
    receber(corpo: unknown) {
      const e = lerWebhook(corpo, d.cfg, enviados);
      if (e.tipo === 'pergunta') fila.colocar(e.p);
      else if (e.tipo === 'nao_texto') void mandar(SO_TEXTO, null).catch(() => {});
    },
  };
}
```

Rodar → PASS.

- [ ] **Step 6: Técnico com o bot** — teste em `test/worker/notificacoes-textosD.test.ts` (dentro de `describe('técnico')`):

```ts
  it('bot: falhas e modelo sumido viram linhas 🔴; zerado não aparece', () => {
    const t = montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [], bot: { falhas24h: 2, modelosSumidos: ['m-velho'] } })!;
    expect(t).toContain('🔴 Bot: 2 pergunta(s) com falha nas últimas 24h');
    expect(t).toContain('🔴 Bot: modelo m-velho não existe mais na Groq');
    expect(montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [], bot: { falhas24h: 0, modelosSumidos: [] } })).toBeNull();
  });
```

Implementar em `textosD.ts`: `DadosTecnico` ganha `bot?: { falhas24h: number; modelosSumidos: string[] }` e, em `montarTecnico`, antes do `if (!linhas.length)`:

```ts
  if (d.bot?.falhas24h) linhas.push(`🔴 Bot: ${d.bot.falhas24h} pergunta(s) com falha nas últimas 24h`);
  for (const m of d.bot?.modelosSumidos ?? []) linhas.push(`🔴 Bot: modelo ${m} não existe mais na Groq`);
```

Em `fontes.ts`, `criarFontes` ganha o 4º parâmetro opcional `bot?: () => Promise<{ falhas24h: number; modelosSumidos: string[] }>` e a fonte `tecnico` acrescenta `bot: bot ? await bot().catch(() => ({ falhas24h: 0, modelosSumidos: [] })) : undefined`. Rodar `npx vitest run test/worker` → PASS.

- [ ] **Step 7: Ligar no `index.ts`** — dentro de `main`, depois de `notif` e antes do `if (args.tarefa === 'agendar')`:

```ts
  // E1: bot de perguntas (só sobe no "agendar" e com tudo configurado)
  const groqKey = process.env.GROQ_API_KEY;
  const groq = groqKey ? new ClienteGroq(groqKey, (process.env.GROQ_MODELOS ?? 'openai/gpt-oss-120b').split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const registroBot = new PgRegistroBot(pool);
```

passar para `criarFontes` o 4º argumento: `groq ? async () => ({ falhas24h: await registroBot.falhas24h(), modelosSumidos: await groq.modelosSumidos() }) : undefined` (o `notif` precisa ser declarado depois disto — mover a declaração do `notif` para baixo destas linhas). E no ramo `agendar`, depois dos crons:

```ts
    new Cron('20 4 * * *', { timezone: TZ, protect: true }, async () => {
      const n = await registroBot.limpar(90).catch(() => 0);
      if (n) log(`bot: ${n} conversa(s) com mais de 90 dias apagada(s)`);
    });
    const faltando = ['GROQ_API_KEY', 'BOT_TOKEN', 'BOT_MEMBROS', 'BOT_JIDS', 'WA_GRUPO', 'WA_API_KEY'].filter((k) => !process.env[k]);
    if (faltando.length) log(`bot desligado: falta ${faltando.join(', ')}`);
    else {
      const painelBase = process.env.PAINEL_INTERNO ?? 'http://finance-dashboard:3000';
      const wa = new CanalWhatsApp(waUrl, waKey!, waInst, process.env.WA_GRUPO!);
      const bot = criarBot({
        cfg: { grupo: process.env.WA_GRUPO!, membros: lerMembros(process.env.BOT_MEMBROS!), botJids: process.env.BOT_JIDS!.split('|').filter(Boolean) },
        groq: groq!, registro: registroBot, wa, renderizar: (s) => paraPng(s), hoje: currentDateSP, painelUrl: notif.painelUrl, log,
        painel: async (c) => {
          const r = await fetch(`${painelBase}${c}`, { signal: AbortSignal.timeout(30000) });
          return { ok: r.ok, dados: await r.json().catch(() => ({ erro: `HTTP ${r.status}` })) };
        },
      });
      const porta = Number(process.env.BOT_PORTA ?? 8090);
      criarServidor(process.env.BOT_TOKEN!, (c) => bot.receber(c)).listen(porta, '0.0.0.0', () => log(`bot no ar na porta interna ${porta}`));
    }
```

Imports: `ClienteGroq` (`./bot/groq`), `PgRegistroBot` (`./bot/registro`), `criarBot` (`./bot/bot`), `lerMembros` (`./bot/entrada`), `criarServidor` (`./bot/servidor`), `currentDateSP` (`../lib/format`). Rodar `npx tsc --noEmit && npm run build:worker && npx vitest run --exclude 'test/integracao/**'` → tudo ok.

- [ ] **Step 8: Commit** — `feat(bot): fila, envio no grupo, aviso tecnico e servidor no worker (E1)`.

---

### Task 7: Scripts (segredos, membros, webhook)

**Files:**
- Create: `scripts/e1-bot-env.sh`, `scripts/e1-bot-membros.sh`, `scripts/e1-bot-webhook.sh`
- Test: `bash -n` + simulação com docker falso (padrão do D, script de simulação no scratchpad)

**Interfaces:**
- Consumes: `scripts/d-whatsapp-lib.sh` (`evo METODO CAMINHO [JSON]`).
- Produces: `/root/n8n-docker/.env.worker-bot` (600) com `GROQ_API_KEY`, `GROQ_MODELOS`, `BOT_TOKEN`, `BOT_MEMBROS`, `BOT_JIDS`.

- [ ] **Step 1: `scripts/e1-bot-env.sh`**:

```bash
#!/usr/bin/env bash
# E1: chave da Groq e token do webhook do bot, SEM mostrar valores. Rodar na VPS, como root.
#   bash e1-bot-env.sh            (cria; pede a chave da Groq)
#   bash e1-bot-env.sh --token    (só gera um token novo do webhook; depois rode e1-bot-webhook.sh --ligar)
set -euo pipefail
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
umask 077
touch "$ARQ"
troca() { grep -v "^$1=" "$ARQ" > "$ARQ.tmp" || true; echo "$1=$2" >> "$ARQ.tmp"; mv "$ARQ.tmp" "$ARQ"; }
if [[ "${1:-}" != "--token" ]]; then
  read -r -s -p "Chave da Groq (gsk_...; não aparece na tela): " K; echo
  K=$(printf '%s' "$K" | tr -d '[:space:]"'"'")
  [[ "$K" == gsk_* && ${#K} -ge 40 ]] || { echo "Chave com formato inesperado; nada gravado."; exit 1; }
  troca GROQ_API_KEY "$K"; unset K
  grep -q '^GROQ_MODELOS=' "$ARQ" || troca GROQ_MODELOS "openai/gpt-oss-120b"
fi
troca BOT_TOKEN "$(openssl rand -hex 24)"
chmod 600 "$ARQ"
echo "Gravado em $ARQ (permissão 600). Valores não exibidos. Campos: $(cut -d= -f1 "$ARQ" | tr '\n' ' ')"
```

- [ ] **Step 2: `scripts/e1-bot-membros.sh`**:

```bash
#!/usr/bin/env bash
# E1: quem é quem no grupo (JIDs de telefone e LID) e o JID do número conectado. Grava BOT_MEMBROS e BOT_JIDS.
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
GRUPO=$(grep '^WA_GRUPO=' "${D_ENV_DIR:-/root/n8n-docker}/.env.worker-whatsapp" | cut -d= -f2-)
[[ -n "$GRUPO" ]] || { echo "WA_GRUPO não configurado (rode d-whatsapp-grupos.sh)."; exit 1; }
PART=$(evo GET "/group/participants/financas?groupJid=$GRUPO")
DONO=$(evo GET "/instance/fetchInstances?instanceName=financas" | python3 -c 'import sys,json; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(d.get("ownerJid") or d.get("instance",{}).get("owner") or "")')
printf '%s' "$PART" | python3 -c '
import sys, json
d = json.load(sys.stdin); ps = d.get("participants", d) if isinstance(d, dict) else d
for i, p in enumerate(ps, 1):
    tel = (p.get("phoneNumber") or p.get("jid") or p.get("id") or "").split("@")[0]
    print("%3d  %s  final %s" % (i, p.get("name") or p.get("pushName") or "(sem nome)", tel[-4:] if tel.isdigit() else "lid"))
'
read -r -p "Número da lista que é o Matheus: " NM
read -r -p "Número da lista que é a Ariane: " NA
MEMBROS=$(printf '%s' "$PART" | python3 -c '
import sys, json
d = json.load(sys.stdin); ps = d.get("participants", d) if isinstance(d, dict) else d
def jids(n):
    n = int(n)
    if not 1 <= n <= len(ps): sys.exit(1)
    p = ps[n-1]
    return "|".join(sorted({x for x in (p.get("id"), p.get("jid"), p.get("phoneNumber"), p.get("lid")) if x}))
print("Matheus=%s;Ariane=%s" % (jids(sys.argv[1]), jids(sys.argv[2])))' "$NM" "$NA") || { echo "Escolha fora da lista; nada gravado."; exit 1; }
umask 077; touch "$ARQ"
troca() { grep -v "^$1=" "$ARQ" > "$ARQ.tmp" || true; echo "$1=$2" >> "$ARQ.tmp"; mv "$ARQ.tmp" "$ARQ"; }
troca BOT_MEMBROS "$MEMBROS"
# o número conectado: hoje o do Matheus (então BOT_JIDS = os JIDs dele); com o chip, o do chip
if [[ "$DONO" == "$(printf '%s' "$MEMBROS" | sed 's/;.*//;s/^Matheus=//' | tr '|' '\n' | grep -F "$DONO" || true)" && -n "$DONO" ]]; then
  troca BOT_JIDS "$(printf '%s' "$MEMBROS" | sed 's/;.*//;s/^Matheus=//')"
else
  troca BOT_JIDS "$DONO"
fi
chmod 600 "$ARQ"; unset PART MEMBROS DONO
echo "Gravado BOT_MEMBROS e BOT_JIDS em $ARQ (600). Valores não exibidos."
```

(Na execução: conferir no Step 4 com a resposta real de `/group/participants` da v2.3.7 que os campos `id`/`jid`/`phoneNumber`/`lid` existem; ajustar os nomes se a versão usar outros — ledger.)

- [ ] **Step 3: `scripts/e1-bot-webhook.sh`**:

```bash
#!/usr/bin/env bash
# E1: liga/desliga o webhook da instância para o bot (só MESSAGES_UPSERT, URL interna com token).
#   bash e1-bot-webhook.sh --ligar | --desligar | --estado
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
case "${1:-}" in
  --ligar)
    T=$(grep '^BOT_TOKEN=' "$ARQ" | cut -d= -f2-); [[ -n "$T" ]] || { echo "Sem BOT_TOKEN (rode e1-bot-env.sh)."; exit 1; }
    evo POST /webhook/set/financas "{\"webhook\":{\"enabled\":true,\"url\":\"http://finance-worker:8090/whatsapp?t=$T\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}" >/dev/null
    unset T; echo "Webhook ligado (só mensagens novas → worker, rede interna).";;
  --desligar)
    evo POST /webhook/set/financas '{"webhook":{"enabled":false,"url":"http://finance-worker:8090/whatsapp","events":["MESSAGES_UPSERT"]}}' >/dev/null
    echo "Webhook desligado.";;
  --estado)
    evo GET /webhook/find/financas | python3 -c 'import sys,json; d=json.load(sys.stdin) or {}; print("ligado" if d.get("enabled") else "desligado", d.get("events"))';;
  *) echo "uso: $0 --ligar | --desligar | --estado"; exit 1;;
esac
```

- [ ] **Step 4: Verificar** — `bash -n scripts/e1-*.sh`; simulação na VPS com docker falso (como a do D: `evo` responde participantes fictícios `{participants:[{id:"111@lid",phoneNumber:"5500000000001@s.whatsapp.net",name:"M"},{id:"222@lid",phoneNumber:"5500000000002@s.whatsapp.net",name:"A"}]}` e `fetchInstances` com `ownerJid`), entradas `1`,`2`, conferindo os nomes gravados (sem valores) e permissão 600; entrada fora da lista → nada gravado; `--estado`, `--ligar`, `--desligar` chamam as rotas certas. Conferir também na Evolution real, só leitura, os nomes dos campos: `ssh vps-financas` + `evo GET "/group/participants/financas?groupJid=$WA_GRUPO" | python3 -c 'import sys,json; d=json.load(sys.stdin); ps=d.get("participants",d); print(sorted(ps[0].keys()))'` (só as chaves, sem valores).

- [ ] **Step 5: Commit** — `feat(bot): scripts de segredo, membros e webhook do bot (E1)`.

---

### Task 8: Produção — teste no grupo de teste

- [ ] Suíte com integração (um arquivo por vez), `tsc`, `build`, `build:worker`; varredura de segredo/número/JID/valor no diff; revisão final independente (opus) com a Review Focus.
- [ ] Migração 009 na produção (backup não é necessário: só cria tabela; conferir `\d financas_bot_conversas` e os grants).
- [ ] Deploy do painel (`/root/finance-dash.bak-pre-e1`) e conferência de `/api/bot/*` pela rede interna: `situacao`, `gasto?periodo=este_mes`, `comparar?periodo=este_mes&periodo_b=mes_passado`, `faturas`, `contas`, `trilha`, `simular?valor_total=3000&parcelas=10` em 200 e `gasto?periodo=ontem` em 400.
- [ ] Compose do worker: `env_file` opcional `/root/n8n-docker/.env.worker-bot` (backup do compose antes; `docker compose config -q`; **sem** `ports`).
- [ ] **Parar para o Matheus:** `bash /root/finance-worker-src/scripts/e1-bot-env.sh` (chave da Groq) e `bash .../e1-bot-membros.sh`.
- [ ] Deploy do worker (`finance-worker:pre-e1`; fora de 16h–16h40/22h–22h40 SP e dos minutos :09); log "bot no ar na porta interna 8090"; `curl` interno em `/saude` = 200 e `POST /whatsapp?t=errado` = 403.
- [ ] Janela de teste: `e1-bot-webhook.sh --ligar`; Matheus e (se quiser) Ariane mandam 10 perguntas no grupo de teste cobrindo as 8 ferramentas + 1 fora do escopo + 1 ambígua; Claude confere cada número com o painel e lê `financas_bot_conversas` (pergunta/ferramentas/trava); `e1-bot-webhook.sh --desligar` no fim e `--estado` confirmando.
- [ ] Push, PR com base `feat/d2-visuais` (#16); roadmap no vault (linha do E1).
