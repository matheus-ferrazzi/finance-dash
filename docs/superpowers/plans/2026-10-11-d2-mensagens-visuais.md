# D2 — Mensagens visuais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diário, semanal e mensal vão para o WhatsApp com um gráfico PNG e um texto com emoji que se entende batendo o olho; o técnico ganha 🔴/🟡.

**Architecture:** As rotas `/api/resumo/*` do painel ganham as séries do gráfico (campos opcionais). No worker, `graficos.ts` monta SVG puro, `png.ts` converte com `@resvg/resvg-js` (fonte DejaVu do npm, sem fonte do sistema), `CanalWhatsApp.enviarImagem` usa `sendMedia` e o motor manda imagem + legenda, caindo para só texto se a imagem falhar.

**Tech Stack:** Next.js 14 (rotas), TypeScript, `pg`, Vitest 3, esbuild (bundle do worker), `@resvg/resvg-js` 2.6.2, `dejavu-fonts-ttf` 2.37.3, Evolution API v2.3.7.

**Spec:** `docs/superpowers/specs/2026-10-11-d2-mensagens-visuais-design.md`

## Global Constraints

- Branch `feat/d2-visuais` (base `feat/d-whatsapp`, PR #15).
- Emoji só no texto; a imagem não tem emoji. Um emoji por linha, no começo. Tom contido, sem gíria.
- Cores do gráfico: vermelho `#E24B4A` (acima/faltou), verde `#1D9E75` (abaixo/sobrou), cinza `#888780` (referência). PNG 800×480.
- Nada sai da VPS para gerar gráfico. `loadSystemFonts: false`; fonte DejaVu Sans do pacote `dejavu-fonts-ttf` (ruling sobre a spec: a spec dizia `assets/fonts/` com OFL; o pacote npm dá o TTF pronto no Windows e no Alpine, licença livre Bitstream Vera/DejaVu).
- Imagem falhou → manda só o texto; `erro` registrado com o prefixo `imagem: `. Telegram e bots do C2: só texto.
- Legenda > 1000 caracteres → imagem sem legenda + texto em seguida.
- `--dry-run` não gera imagem; `--png <arquivo>` só com `--dry-run`.
- Sem mudança de esquema no banco. Sem número, id de grupo, chave ou valor real no repo.
- Testes de integração: `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db`, um arquivo por vez.
- Commits via `git commit -F` terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Dia 1 de manhã (sem gasto no mês ainda)** → a série tem 1 ponto com 0; o gráfico do diário não divide por zero nem desenha `NaN`. (Task 3)
2. **`cabeNoMes` zero (já estourou)** → a reta "o que cabe" fica no chão, a linha do gasto vermelha, nada de `NaN`/`Infinity`. (Task 3)
3. **Semanal com todos os grupos zerados na semana e na média** → sem imagem (`null`), só texto. (Task 3)
4. **Painel antigo sem os campos novos** (deploy do worker antes do painel) → só texto, sem erro. (Task 3, Task 4)
5. **Evolution recusa a mídia (HTTP 400) mas aceita texto** → a mensagem chega como texto e o erro da imagem fica registrado. (Task 4)

---

### Task 1: Dados do gráfico nas rotas do painel

**Files:**
- Modify: `src/lib/queries.ts` (interface `PrevisaoResumo` ~l.659, `getPrevisaoResumo` ~l.686, nova `getGastoLivrePorDia` no fim)
- Modify: `src/lib/resumos.ts` (nova `acumular`)
- Modify: `src/app/api/resumo/diario/route.ts`, `src/app/api/resumo/semanal/route.ts`, `src/app/api/resumo/mensal/route.ts`
- Test: `test/lib/resumos.test.ts`, `test/integracao/resumos.test.ts`

**Interfaces:**
- Produces: `acumular(porDia: {dia:number; valor:number}[], ateDia: number): {dia:number; acumulado:number}[]`; `getGastoLivrePorDia(resp: Resp, hoje: string): Promise<{dia:number; valor:number}[]>`; `PrevisaoResumo.sobraParaODiaADia: number`.
- JSON novo: diário `+ serie: {dia, acumulado}[], cabeNoMes: number, diasNoMes: number`; semanal `+ todosGrupos: {nome, emoji, semana, media}[]`; mensal `+ historico: {mes, mesLabel, sobra}[]`.

- [ ] **Step 1: Teste unitário de `acumular`** — em `test/lib/resumos.test.ts`, trocar o import para `import { acumular, contasDoDia, gruposDaSemana, semanaAnterior } from '../../src/lib/resumos';` e acrescentar:

```ts
describe('acumular', () => {
  it('soma dia a dia até hoje, preenchendo os dias sem gasto', () => {
    expect(acumular([{ dia: 2, valor: 10 }, { dia: 4, valor: 5.5 }], 5)).toEqual([
      { dia: 1, acumulado: 0 }, { dia: 2, acumulado: 10 }, { dia: 3, acumulado: 10 }, { dia: 4, acumulado: 15.5 }, { dia: 5, acumulado: 15.5 },
    ]);
  });
  it('dia 1 sem gasto: um ponto com zero', () => {
    expect(acumular([], 1)).toEqual([{ dia: 1, acumulado: 0 }]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/lib/resumos.test.ts`
Expected: FAIL — `acumular is not a function` (ou erro de import).

- [ ] **Step 3: Implementar `acumular`** — acrescentar em `src/lib/resumos.ts`:

```ts
/** Gasto acumulado por dia do mês, de 1 até `ateDia` (dias sem gasto repetem o acumulado). */
export function acumular(porDia: { dia: number; valor: number }[], ateDia: number): { dia: number; acumulado: number }[] {
  const out: { dia: number; acumulado: number }[] = [];
  let s = 0;
  for (let d = 1; d <= ateDia; d++) {
    s += porDia.filter((p) => p.dia === d).reduce((a, p) => a + p.valor, 0);
    out.push({ dia: d, acumulado: r2(s) });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/lib/resumos.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Teste de integração de `getGastoLivrePorDia`** — em `test/integracao/resumos.test.ts`, dentro do `describe`, acrescentar:

```ts
  it('gasto livre por dia: só despesa no débito, fora casa, até hoje', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, forma_pagamento, banco, responsavel) VALUES
      ('gl1', '2043-05-02', 40, 'PADARIA', 'Groceries', 'despesa', 'Débito', 'B', 'X'),
      ('gl2', '2043-05-02', 10, 'FARMACIA', 'Pharmacy', 'despesa', 'Débito', 'B', 'Y'),
      ('gl3', '2043-05-03', 900, 'ALUGUEL', 'Housing', 'despesa', 'Débito', 'B', 'X'),
      ('gl4', '2043-05-03', 70, 'LOJA', 'Shopping', 'despesa', 'Crédito', 'B', 'X'),
      ('gl5', '2043-05-04', 25, 'IFOOD', 'Food delivery', 'despesa', 'Débito', 'B', 'X'),
      ('gl6', '2043-05-06', 99, 'FUTURO', 'Groceries', 'despesa', 'Débito', 'B', 'X'),
      ('gl7', '2043-04-30', 33, 'MES ANTERIOR', 'Groceries', 'despesa', 'Débito', 'B', 'X')`);
    expect(await queries.getGastoLivrePorDia('casal', '2043-05-05')).toEqual([{ dia: 2, valor: 50 }, { dia: 4, valor: 25 }]);
    expect(await queries.getGastoLivrePorDia('Matheus' as any, '2043-05-05')).toEqual([]);
  });
```

(`responsavel` 'X'/'Y' não é Matheus: a visão individual vem vazia — confere que o filtro de pessoa entra.)

- [ ] **Step 6: Rodar e ver falhar**

Run: `docker run --rm -d --name pg-teste-c1 -e POSTGRES_PASSWORD=teste -p 127.0.0.1:55432:5432 postgres:16`, esperar ~6 s, `docker exec pg-teste-c1 psql -U postgres -c "CREATE DATABASE personal_hub_db"`, depois `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run test/integracao/resumos.test.ts`
Expected: FAIL — `queries.getGastoLivrePorDia is not a function`.

- [ ] **Step 7: Implementar a consulta e o campo** — no fim de `src/lib/queries.ts`:

```ts
/** Gasto livre por dia do mês de `hoje` até `hoje` (o mesmo filtro do variavelJaGasto: débito, fora casa e fixos). */
export async function getGastoLivrePorDia(resp: Resp, hoje: string): Promise<{ dia: number; valor: number }[]> {
  const r = rf(resp, 1);
  const n = r.p.length;
  const rows = await q<any>(
    `SELECT extract(day from l.data_lancamento)::int AS dia, SUM(l.valor)::float8 AS valor
     FROM financas_lancamentos l
     WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
       AND l.data_lancamento >= date_trunc('month', $${n + 1}::date) AND l.data_lancamento <= $${n + 1}::date
       AND NOT (l.categoria = ANY($${n + 2}::text[])) AND NOT (l.categoria = ANY($${n + 3}::text[]))
       AND ${SEM_ESPELHO}${r.sql}
     GROUP BY 1 ORDER BY 1`,
    [...r.p, hoje, CASA_CATS, FIXO_DEBITO_CATS],
  );
  return rows.map((x) => ({ dia: Number(x.dia), valor: Math.round(Number(x.valor) * 100) / 100 }));
}
```

Em `PrevisaoResumo` acrescentar `/** o que sobra para o dia a dia até o fim do mês (pode ser negativo) */ sobraParaODiaADia: number;` e em `getPrevisaoResumo` acrescentar `sobraParaODiaADia: ritmo.sobraParaODiaADia,` ao lado de `ritmoAtualDia`. Se `FIXO_DEBITO_CATS` não estiver no escopo do fim do arquivo, usar o mesmo identificador que a consulta do `variavel_gasto` usa (ele já é usado em `getProjecaoBase`).

- [ ] **Step 8: Rodar e ver passar**

Run: `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run test/integracao/resumos.test.ts`
Expected: PASS (2).

- [ ] **Step 9: Rotas** — `src/app/api/resumo/diario/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { diasNoMes, getContasDoMes, getGastoLivrePorDia, getPrevisaoResumo } from '@/lib/queries';
import { currentDateSP } from '@/lib/format';
import { acumular, contasDoDia } from '@/lib/resumos';

export const dynamic = 'force-dynamic';

/** Dados do resumo diário (D): ritmo, como o mês fecha, contas de hoje/amanhã e a série do gráfico. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const mes = hoje.slice(0, 7);
  const dia = Number(hoje.slice(8, 10));
  const [p, contas, porDia] = await Promise.all([getPrevisaoResumo('casal'), getContasDoMes('casal', mes), getGastoLivrePorDia('casal', hoje)]);
  const serie = acumular(porDia, dia);
  const ja = serie[serie.length - 1]?.acumulado ?? 0;
  return NextResponse.json({
    mesLabel: p.mesLabel, fechaCom: p.fechaCom, diasRestantes: p.diasRestantes,
    ritmoSeguroDia: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia,
    contas: contasDoDia(contas.itens, dia, diasNoMes(mes)),
    // gráfico: gasto livre acumulado × o total livre do mês que não fecha no vermelho
    serie, cabeNoMes: Math.round((ja + Math.max(0, p.sobraParaODiaADia)) * 100) / 100, diasNoMes: diasNoMes(mes),
  });
}
```

`src/app/api/resumo/semanal/route.ts`: guardar os grupos agrupados e acrescentar `todosGrupos`. Trocar o corpo do `NextResponse.json` para:

```ts
  const gs = agruparGastos(semana, 0).filter((g) => !g.travado);
  const ms = agruparGastos(antes, 0).filter((g) => !g.travado);
  const nomes = Array.from(new Set([...gs.map((g) => g.nome), ...ms.map((g) => g.nome)]));
  const todosGrupos = nomes.map((nome) => ({
    nome, emoji: (gs.find((g) => g.nome === nome) ?? ms.find((g) => g.nome === nome))!.emoji,
    semana: Math.round((gs.find((g) => g.nome === nome)?.total ?? 0) * 100) / 100,
    media: Math.round(((ms.find((g) => g.nome === nome)?.total ?? 0) / 4) * 100) / 100,
  }));
  return NextResponse.json({
    semana: s,
    total: soma(semana),
    mediaTotal: Math.round((soma(antes) / 4) * 100) / 100,
    grupos: gruposDaSemana(agruparGastos(semana, 0), agruparGastos(antes, 0)),
    todosGrupos,
    trilha: { fase: t.atual, titulo: f.titulo, proximoPasso: partesDoTexto(f.proximoPasso).map((p) => (typeof p === 'number' ? brl(p) : p)).join('') },
  });
```

`src/app/api/resumo/mensal/route.ts`: `getMesesPassados('casal', hoje, 6)` no lugar de `getMesesPassados('casal', hoje)` e acrescentar ao JSON:

```ts
    historico: passados.map((x) => ({ mes: x.mes, mesLabel: mesLabel(x.mes), sobra: x.real.saldo })),
```

- [ ] **Step 10: tsc e testes**

Run: `npx tsc --noEmit && npx vitest run --exclude 'test/integracao/**'`
Expected: tsc sem saída; todos passam.

- [ ] **Step 11: Commit**

```bash
git add src/lib/queries.ts src/lib/resumos.ts src/app/api/resumo test/lib/resumos.test.ts test/integracao/resumos.test.ts
git commit -F msg.txt   # "feat(resumos): series dos graficos no diario, semanal e mensal (D2)"
```

---

### Task 2: Textos com emoji

**Files:**
- Modify: `src/worker/notificacoes/textosD.ts`
- Test: `test/worker/notificacoes-textosD.test.ts` (reescrever os casos de diário, semanal, mensal e técnico)

**Interfaces:**
- Consumes: JSON da Task 1.
- Produces: tipos com campos opcionais `ResumoDiario.serie?: {dia:number; acumulado:number}[]; cabeNoMes?: number; diasNoMes?: number`, `ResumoSemanal.todosGrupos?: {nome:string; emoji:string; semana:number; media:number}[]`, `ResumoMensal.historico?: {mes:string; mesLabel:string; sobra:number}[]`; `barraTrilha(fase: number): string`. Assinaturas de `montarDiario/montarSemanal/montarMensal/montarTecnico` não mudam.

- [ ] **Step 1: Reescrever os testes** — substituir o conteúdo de `test/worker/notificacoes-textosD.test.ts` por:

```ts
import { describe, expect, it } from 'vitest';
import { barraTrilha, montarDiario, montarMensal, montarSemanal, montarTecnico } from '../../src/worker/notificacoes/textosD';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = { mesLabel: 'out/26', fechaCom: -500, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' as const }] };

describe('diário', () => {
  it('acima do que cabe, fecha no vermelho, conta e link', () => {
    expect(montarDiario(dia, 'https://painel/')).toBe([
      '☀️ *Bom dia!*',
      `💸 Hoje dá pra gastar *${brl(50)}*`,
      `🔥 Ritmo: ${brl(80)} por dia, acima do que cabe 🔴`,
      `📉 out/26 fecha em *${brl(-500)}* 🔴`,
      '', `🧾 Luz (${brl(120)}) vence hoje`,
      '', '👉 https://painel/',
    ].join('\n'));
  });
  it('dentro do que cabe e fecha no azul; sem contas a parte some', () => {
    const t = montarDiario({ ...dia, ritmoAtualDia: 40, fechaCom: 300, contas: [] }, 'L');
    expect(t).toContain(`🐢 Ritmo: ${brl(40)} por dia, dentro do que cabe 🟢`);
    expect(t).toContain(`📈 out/26 fecha em *${brl(300)}* 🟢`);
    expect(t).not.toContain('🧾');
  });
  it('último dia do mês: sem "dá pra gastar" nem ritmo', () => {
    const u = montarDiario({ ...dia, diasRestantes: 0, contas: [] }, 'L');
    expect(u).toBe(['☀️ *Bom dia!*', `📅 Último dia do mês: out/26 fecha em *${brl(-500)}* 🔴`, '', '👉 L'].join('\n'));
  });
  it('várias contas: uma por linha, hoje antes de amanhã', () => {
    const t = montarDiario({ ...dia, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }] }, 'L');
    expect(t).toContain(`🧾 Luz (${brl(120)}) vence hoje\n🧾 Agua (${brl(80)}) vence amanhã`);
  });
});

const sem = {
  semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 1160, mediaTotal: 1000,
  grupos: [
    { nome: 'Mercado', emoji: '🛒', semana: 0, media: 500 },
    { nome: 'Saúde', emoji: '💊', semana: 400, media: 150 },
    { nome: 'Lazer', emoji: '🎮', semana: 300, media: 250 },
  ],
  trilha: { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Pagar a fatura inteira.' },
};

describe('semanal', () => {
  it('total com % sobre a média, setas por grupo, trilha com barrinha e links', () => {
    expect(montarSemanal(sem, { gastos: 'G', trilha: 'T' })).toBe([
      '📊 *Semana de 05/10 a 11/10*',
      `💰 Gastaram ${brl(1160)}, 🔺 16% acima da média`,
      '',
      `🛒 Mercado: ${brl(0)} ⏬ (média ${brl(500)})`,
      `💊 Saúde: ${brl(400)} ⏫ (média ${brl(150)})`,
      `🎮 Lazer: ${brl(300)} ⬆️ (média ${brl(250)})`,
      '',
      '🧭 *Trilha* ▰▱▱▱ fase 1: Sair das dívidas',
      '➡️ Pagar a fatura inteira.',
      '', '👉 G', '👉 T',
    ].join('\n'));
  });
  it('abaixo da média e seta ⬇️ quando cai menos da metade', () => {
    const t = montarSemanal({ ...sem, total: 800, grupos: [{ nome: 'Mercado', emoji: '🛒', semana: 400, media: 500 }] }, { gastos: 'G', trilha: 'T' });
    expect(t).toContain(`💰 Gastaram ${brl(800)}, 🔻 20% abaixo da média`);
    expect(t).toContain(`🛒 Mercado: ${brl(400)} ⬇️ (média ${brl(500)})`);
  });
  it('sem gasto: frase própria; média zero: sem %', () => {
    expect(montarSemanal({ ...sem, total: 0, grupos: [] }, { gastos: 'G', trilha: 'T' })).toContain('💤 Nenhum gasto registrado na semana.');
    expect(montarSemanal({ ...sem, mediaTotal: 0, grupos: [] }, { gastos: 'G', trilha: 'T' })).toContain(`💰 Gastaram ${brl(1160)}.`);
  });
  it('igual à média: ➖', () => {
    expect(montarSemanal({ ...sem, grupos: [{ nome: 'Lazer', emoji: '🎮', semana: 250, media: 250 }] }, { gastos: 'G', trilha: 'T' })).toContain('➖');
  });
});

const mes = {
  mes: '2026-09', mesLabel: 'set/26', sobraReal: 299.26, sobraPrevista: -1360.45, saldoFim: -1284.04,
  trilha: { fase: 1, titulo: 'Sair das dívidas', mudou: false, faseAntes: 1 },
  mesNovo: { mesLabel: 'out/26', fechaCom: -1758.55 },
};

describe('mensal', () => {
  it('sobrou: 🎉, 🟢, saldo vermelho, trilha e mês novo', () => {
    expect(montarMensal(mes, 'L')).toBe([
      '📅 *set/26 fechou* 🎉',
      `🟢 Sobrou ${brl(299.26)} (previsto ${brl(-1360.45)})`,
      `🏦 Saldo em conta no fim: ${brl(-1284.04)} 🔴`,
      '',
      '🧭 *Trilha* ▰▱▱▱ seguem na fase 1: Sair das dívidas',
      '',
      `🔮 out/26 começa fechando em ${brl(-1758.55)}`,
      '', '👉 L',
    ].join('\n'));
  });
  it('faltou: sem 🎉; mudou de fase: 🚀', () => {
    const t = montarMensal({ ...mes, sobraReal: -200, saldoFim: 50, trilha: { fase: 2, titulo: 'Fazer sobrar', mudou: true, faseAntes: 1 } }, 'L');
    expect(t.split('\n')[0]).toBe('📅 *set/26 fechou*');
    expect(t).toContain(`🔴 Faltou ${brl(200)} (previsto ${brl(-1360.45)})`);
    expect(t).toContain(`🏦 Saldo em conta no fim: ${brl(50)} 🟢`);
    expect(t).toContain('🚀 *Trilha* ▰▰▱▱ passaram da fase 1 para a 2: Fazer sobrar');
  });
});

const saudeOk = { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 3, worker_falhas_24h: 0, ultimo_lancamento: 'x' };
const backupOk = { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 1, h_desde_offsite: 1, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null };

describe('técnico', () => {
  it('tudo bem: null', () => {
    expect(montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [] })).toBeNull();
  });
  it('🔴 para o que quebrou, 🟡 para consentimento a vencer, 🔴 para vencido', () => {
    const t = montarTecnico({ saude: { ...saudeOk, worker_falhas_24h: 1 } as any, backup: backupOk as any, consentimentos: [{ banco: 'B1', responsavel: 'R', dias: 10 }, { banco: 'B2', responsavel: 'R', dias: -1 }] })!;
    expect(t).toBe([
      '🛠️ *Aviso técnico*', '',
      '🔴 Ingestão (worker): 1 rodada(s) com falha nas últimas 24h',
      '🟡 Consentimento do B1 (R) na Pluggy vence em 10 dias',
      '🔴 Consentimento do B2 (R) na Pluggy venceu',
    ].join('\n'));
  });
});

describe('barra da trilha', () => {
  it('quatro fases', () => {
    expect([1, 2, 3, 4].map(barraTrilha)).toEqual(['▰▱▱▱', '▰▰▱▱', '▰▰▰▱', '▰▰▰▰']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/notificacoes-textosD.test.ts`
Expected: FAIL — `barraTrilha` não exportada e textos diferentes.

- [ ] **Step 3: Implementar** — em `src/worker/notificacoes/textosD.ts`, acrescentar os campos opcionais nos tipos:

```ts
export interface ResumoDiario {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
  contas: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[];
  /** D2: gráfico (opcional: painel antigo não manda) */
  serie?: { dia: number; acumulado: number }[]; cabeNoMes?: number; diasNoMes?: number;
}
export interface ResumoSemanal {
  semana: { inicio: string; fim: string }; total: number; mediaTotal: number;
  grupos: { nome: string; emoji: string; semana: number; media: number }[];
  trilha: { fase: number; titulo: string; proximoPasso: string };
  todosGrupos?: { nome: string; emoji: string; semana: number; media: number }[];
}
export interface ResumoMensal {
  mes: string; mesLabel: string; sobraReal: number; sobraPrevista: number; saldoFim: number;
  trilha: { fase: number; titulo: string; mudou: boolean; faseAntes: number | null };
  mesNovo: { mesLabel: string; fechaCom: number };
  historico?: { mes: string; mesLabel: string; sobra: number }[];
}
```

E trocar as quatro funções `montar*` (manter `brl` e `ddmm`) por:

```ts
const sinal = (v: number) => (v < 0 ? '🔴' : '🟢');

/** ▰ por fase alcançada, ▱ pelas que faltam (4 fases). */
export function barraTrilha(fase: number): string {
  const f = Math.max(1, Math.min(4, fase));
  return '▰'.repeat(f) + '▱'.repeat(4 - f);
}

export function montarDiario(r: ResumoDiario, link: string): string {
  const l = ['☀️ *Bom dia!*'];
  if (r.diasRestantes > 0) {
    const acima = r.ritmoAtualDia > r.ritmoSeguroDia;
    l.push(`💸 Hoje dá pra gastar *${brl(r.ritmoSeguroDia)}*`);
    l.push(acima
      ? `🔥 Ritmo: ${brl(r.ritmoAtualDia)} por dia, acima do que cabe 🔴`
      : `🐢 Ritmo: ${brl(r.ritmoAtualDia)} por dia, dentro do que cabe 🟢`);
    l.push(`${r.fechaCom < 0 ? '📉' : '📈'} ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  } else {
    // último dia do mês: não há o que distribuir por dia
    l.push(`📅 Último dia do mês: ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  }
  if (r.contas.length) l.push('', ...r.contas.map((c) => `🧾 ${c.nome} (${brl(c.valor)}) vence ${c.quando}`));
  l.push('', `👉 ${link}`);
  return l.join('\n');
}

function seta(semana: number, media: number): string {
  if (media > 0 && semana >= 2 * media) return '⏫';
  if (media > 0 && semana <= media / 2) return '⏬';
  if (semana > media) return '⬆️';
  if (semana < media) return '⬇️';
  return '➖';
}

export function montarSemanal(r: ResumoSemanal, links: { gastos: string; trilha: string }): string {
  const l = [`📊 *Semana de ${ddmm(r.semana.inicio)} a ${ddmm(r.semana.fim)}*`];
  if (r.total <= 0) l.push('💤 Nenhum gasto registrado na semana.');
  else if (r.mediaTotal > 0 && r.total !== r.mediaTotal) {
    const pct = Math.round((Math.abs(r.total - r.mediaTotal) / r.mediaTotal) * 100);
    l.push(`💰 Gastaram ${brl(r.total)}, ${r.total > r.mediaTotal ? `🔺 ${pct}% acima` : `🔻 ${pct}% abaixo`} da média`);
  } else l.push(`💰 Gastaram ${brl(r.total)}.`);
  if (r.grupos.length) l.push('', ...r.grupos.map((g) => `${g.emoji} ${g.nome}: ${brl(g.semana)} ${seta(g.semana, g.media)} (média ${brl(g.media)})`));
  l.push('', `🧭 *Trilha* ${barraTrilha(r.trilha.fase)} fase ${r.trilha.fase}: ${r.trilha.titulo}`, `➡️ ${r.trilha.proximoPasso}`,
    '', `👉 ${links.gastos}`, `👉 ${links.trilha}`);
  return l.join('\n');
}

export function montarMensal(r: ResumoMensal, link: string): string {
  const sobra = r.sobraReal >= 0
    ? `🟢 Sobrou ${brl(r.sobraReal)} (previsto ${brl(r.sobraPrevista)})`
    : `🔴 Faltou ${brl(-r.sobraReal)} (previsto ${brl(r.sobraPrevista)})`;
  const trilha = r.trilha.mudou && r.trilha.faseAntes !== null
    ? `🚀 *Trilha* ${barraTrilha(r.trilha.fase)} passaram da fase ${r.trilha.faseAntes} para a ${r.trilha.fase}: ${r.trilha.titulo}`
    : `🧭 *Trilha* ${barraTrilha(r.trilha.fase)} seguem na fase ${r.trilha.fase}: ${r.trilha.titulo}`;
  return [
    `📅 *${r.mesLabel} fechou*${r.sobraReal >= 0 ? ' 🎉' : ''}`,
    sobra,
    `🏦 Saldo em conta no fim: ${brl(r.saldoFim)} ${sinal(r.saldoFim)}`,
    '', trilha,
    '', `🔮 ${r.mesNovo.mesLabel} começa fechando em ${brl(r.mesNovo.fechaCom)}`,
    '', `👉 ${link}`,
  ].join('\n');
}

/** Só quando algo quebrou; null quando está tudo bem. */
export function montarTecnico(d: DadosTecnico): string | null {
  const linhas = [
    ...[...linhasSaude(d.saude), ...linhasBackup(d.backup)].map((x) => `🔴 ${x.replace(/^• /, '')}`),
    ...d.consentimentos.map((c) => (c.dias < 0
      ? `🔴 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy venceu`
      : `🟡 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy vence em ${c.dias} dias`)),
  ];
  if (!linhas.length) return null;
  return ['🛠️ *Aviso técnico*', '', ...linhas].join('\n');
}
```

- [ ] **Step 4: Rodar e ver passar; suíte do worker**

Run: `npx vitest run test/worker`
Expected: PASS. Se `notificacoes-motor.test.ts` checar texto antigo do diário (ex.: `endsWith('https://painel.exemplo/')`), continua valendo — o link segue na última linha.

- [ ] **Step 5: Commit** — `feat(notificacoes): textos do D com emoji por linha (D2)`, arquivos `src/worker/notificacoes/textosD.ts test/worker/notificacoes-textosD.test.ts`.

---

### Task 3: Gráficos (SVG) e PNG

**Files:**
- Modify: `package.json` (dependências)
- Create: `src/worker/notificacoes/graficos.ts`, `src/worker/notificacoes/png.ts`
- Test: `test/worker/notificacoes-graficos.test.ts`

**Interfaces:**
- Consumes: tipos da Task 2.
- Produces: `graficoDiario(r: ResumoDiario): string | null`, `graficoSemanal(r: ResumoSemanal): string | null`, `graficoMensal(r: ResumoMensal): string | null`, `paraPng(svg: string, fontes?: string[]): Buffer`, `fontesPadrao(): string[]`. Barras têm `class="barra"`, traço da média `class="media"`.

- [ ] **Step 1: Dependências**

Run: `npm install --save-exact @resvg/resvg-js@2.6.2 dejavu-fonts-ttf@2.37.3`
Expected: `package.json` com as duas em `dependencies`; `node -e "require('@resvg/resvg-js')"` sem erro. (O `package-lock.json` segue fora do git, como hoje.)

- [ ] **Step 2: Testes** — criar `test/worker/notificacoes-graficos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { graficoDiario, graficoMensal, graficoSemanal } from '../../src/worker/notificacoes/graficos';
import { paraPng } from '../../src/worker/notificacoes/png';

const VERM = '#E24B4A', VERDE = '#1D9E75';
const limpo = (s: string) => !/NaN|Infinity|undefined/.test(s);

const dia = (p: object = {}) => ({
  mesLabel: 'out/26', fechaCom: -500, diasRestantes: 20, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [],
  serie: [{ dia: 1, acumulado: 100 }, { dia: 2, acumulado: 250 }, { dia: 3, acumulado: 260 }], cabeNoMes: 1500, diasNoMes: 31, ...p,
});

describe('gráfico do diário', () => {
  it('acima do que cabe: linha vermelha, reta do que cabe, título com mês, dia e "hoje"', () => {
    const s = graficoDiario(dia())!;
    expect(s).toContain('<svg');
    expect(s).toContain(`stroke="${VERM}"`);
    expect(s).toContain('out/26 · dia 3');
    expect(s).toContain('hoje: R$ 50');
    expect(s).toContain('o que cabe');
    expect(limpo(s)).toBe(true);
  });
  it('dentro do que cabe: verde', () => {
    expect(graficoDiario(dia({ serie: [{ dia: 1, acumulado: 10 }, { dia: 2, acumulado: 20 }] }))).toContain(`stroke="${VERDE}"`);
  });
  it('dia 1 sem gasto e já estourado (cabe 0): sem NaN', () => {
    expect(limpo(graficoDiario(dia({ serie: [{ dia: 1, acumulado: 0 }], cabeNoMes: 0 }))!)).toBe(true);
    expect(limpo(graficoDiario(dia({ cabeNoMes: 0 }))!)).toBe(true);
  });
  it('painel antigo (sem série): null', () => {
    expect(graficoDiario(dia({ serie: undefined }))).toBeNull();
    expect(graficoDiario(dia({ serie: [] }))).toBeNull();
  });
});

const sem = (todos?: { nome: string; emoji: string; semana: number; media: number }[]) => ({
  semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 1, mediaTotal: 1, grupos: [],
  trilha: { fase: 1, titulo: 'T', proximoPasso: 'P' }, todosGrupos: todos,
});

describe('gráfico do semanal', () => {
  it('uma barra e um traço por grupo, cor pela média, até 6 grupos, sem emoji', () => {
    const gs = Array.from({ length: 8 }, (_, i) => ({ nome: `G${i}`, emoji: '🛒', semana: i % 2 ? 300 : 100, media: 200 + i }));
    const s = graficoSemanal(sem(gs))!;
    expect(s.match(/class="barra"/g)!.length).toBe(6);
    expect(s.match(/class="media"/g)!.length).toBe(6);
    expect(s).toContain(`fill="${VERM}"`);
    expect(s).toContain(`fill="${VERDE}"`);
    expect(s).not.toContain('🛒');
    expect(limpo(s)).toBe(true);
  });
  it('nome com & e < não quebra o SVG', () => {
    expect(graficoSemanal(sem([{ nome: 'Casa & <lar>', emoji: '•', semana: 10, media: 5 }]))).toContain('Casa &amp; &lt;lar&gt;');
  });
  it('tudo zerado ou sem campo: null', () => {
    expect(graficoSemanal(sem([{ nome: 'A', emoji: '•', semana: 0, media: 0 }]))).toBeNull();
    expect(graficoSemanal(sem(undefined))).toBeNull();
  });
});

const mes = (h?: { mes: string; mesLabel: string; sobra: number }[]) => ({
  mes: '2026-09', mesLabel: 'set/26', sobraReal: 1, sobraPrevista: 1, saldoFim: 1,
  trilha: { fase: 1, titulo: 'T', mudou: false, faseAntes: 1 }, mesNovo: { mesLabel: 'out/26', fechaCom: 1 }, historico: h,
});

describe('gráfico do mensal', () => {
  it('uma barra por mês, verde se sobrou, vermelha se faltou, rótulos', () => {
    const s = graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -300 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 299 }]))!;
    expect(s.match(/class="barra"/g)!.length).toBe(2);
    expect(s).toContain(`fill="${VERM}"`);
    expect(s).toContain(`fill="${VERDE}"`);
    expect(s).toContain('ago/26');
    expect(limpo(s)).toBe(true);
  });
  it('menos de 2 meses ou todos zero: sem NaN; menos de 2 → null', () => {
    expect(graficoMensal(mes([{ mes: '2026-09', mesLabel: 'set/26', sobra: 1 }]))).toBeNull();
    expect(graficoMensal(mes(undefined))).toBeNull();
    expect(limpo(graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: 0 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 0 }]))!)).toBe(true);
  });
});

describe('PNG', () => {
  it('cada gráfico vira PNG 800×480 com a fonte do pacote', () => {
    const svgs = [
      graficoDiario(dia())!,
      graficoSemanal(sem([{ nome: 'Mercado', emoji: '🛒', semana: 10, media: 5 }]))!,
      graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -3 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 2 }]))!,
    ];
    for (const s of svgs) {
      const png = paraPng(s);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(800);
      expect(png.readUInt32BE(20)).toBe(480);
    }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run test/worker/notificacoes-graficos.test.ts`
Expected: FAIL — módulos `graficos`/`png` não existem.

- [ ] **Step 4: `png.ts`** — criar `src/worker/notificacoes/png.ts`:

```ts
// D2: SVG → PNG com resvg (nativo, sem navegador). Fonte DejaVu do pacote npm; nada de fonte do sistema.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ARQUIVOS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

/** Onde está a fonte: FONTES_DIR, /app/fonts (imagem do worker) ou o pacote no node_modules (dev/testes). */
export function fontesPadrao(): string[] {
  const dirs = [process.env.FONTES_DIR, join(process.cwd(), 'fonts'), join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf')];
  for (const d of dirs) if (d && existsSync(join(d, ARQUIVOS[0]))) return ARQUIVOS.map((f) => join(d, f)).filter(existsSync);
  throw new Error('fonte DejaVuSans.ttf não encontrada');
}

export function paraPng(svg: string, fontes: string[] = fontesPadrao()): Buffer {
  const r = new Resvg(svg, {
    font: { fontFiles: fontes, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
    fitTo: { mode: 'width', value: 800 },
    background: '#FFFFFF',
  });
  return Buffer.from(r.render().asPng());
}
```

- [ ] **Step 5: `graficos.ts`** — criar `src/worker/notificacoes/graficos.ts`:

```ts
// D2: gráficos das mensagens como SVG puro (800×480), no estilo do painel. Sem emoji (não há fonte de emoji).
// null = sem dado para desenhar (a mensagem vai só com texto).
import type { ResumoDiario, ResumoMensal, ResumoSemanal } from './textosD';

const W = 800, H = 480;
const VERM = '#E24B4A', VERDE = '#1D9E75', CINZA = '#888780', TEXTO = '#2C2C2A', SUAVE = '#5F5E5A', GRADE = '#E5E3DC';
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brlCurto = (v: number) => `${v < 0 ? '-' : ''}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;

function svg(corpo: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans">`,
    `<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="#FFFFFF"/>`,
    ...corpo, '</svg>',
  ].join('');
}
const texto = (x: number, y: number, t: string, tam: number, cor = TEXTO, extra = '') =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${tam}" fill="${cor}"${extra}>${esc(t)}</text>`;

export function graficoDiario(r: ResumoDiario): string | null {
  const s = r.serie ?? [];
  if (!s.length || !r.diasNoMes || r.cabeNoMes == null) return null;
  const dias = r.diasNoMes, hoje = s[s.length - 1];
  const projFim = hoje.dia > 0 ? (hoje.acumulado / hoje.dia) * dias : 0;
  const max = Math.max(r.cabeNoMes, projFim, hoje.acumulado, 1) * 1.1;
  const x0 = 70, x1 = W - 40, y0 = H - 60, y1 = 140;
  const X = (d: number) => x0 + ((x1 - x0) * d) / dias;
  const Y = (v: number) => y0 - ((y0 - y1) * v) / max;
  const cor = hoje.acumulado > (r.cabeNoMes * hoje.dia) / dias ? VERM : VERDE;
  const pts = [{ dia: 0, acumulado: 0 }, ...s].map((p) => `${f(X(p.dia))},${f(Y(p.acumulado))}`).join(' ');
  return svg([
    texto(40, 56, `${r.mesLabel} · dia ${hoje.dia}`, 24, SUAVE),
    texto(40, 106, `hoje: ${brlCurto(r.ritmoSeguroDia)}`, 44, TEXTO, ' font-weight="bold"'),
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${GRADE}" stroke-width="2"/>`,
    `<line x1="${f(X(0))}" y1="${f(Y(0))}" x2="${f(X(dias))}" y2="${f(Y(r.cabeNoMes))}" stroke="${CINZA}" stroke-width="3" stroke-dasharray="10 8"/>`,
    texto(X(dias) - 150, Y(r.cabeNoMes) - 14, 'o que cabe', 20, SUAVE),
    hoje.dia < dias
      ? `<line x1="${f(X(hoje.dia))}" y1="${f(Y(hoje.acumulado))}" x2="${f(X(dias))}" y2="${f(Y(projFim))}" stroke="${cor}" stroke-width="3" stroke-dasharray="4 8" stroke-opacity="0.6"/>`
      : '',
    `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${f(X(hoje.dia))}" cy="${f(Y(hoje.acumulado))}" r="10" fill="${cor}"/>`,
    texto(X(hoje.dia) + 16, Y(hoje.acumulado) - 14, `gasto ${brlCurto(hoje.acumulado)}`, 20, cor),
    texto(x0, y0 + 34, 'dia 1', 18, SUAVE),
    texto(x1 - 70, y0 + 34, `dia ${dias}`, 18, SUAVE),
  ]);
}

export function graficoSemanal(r: ResumoSemanal): string | null {
  const gs = (r.todosGrupos ?? [])
    .filter((g) => g.semana > 0 || g.media > 0)
    .sort((a, b) => Math.max(b.semana, b.media) - Math.max(a.semana, a.media))
    .slice(0, 6);
  if (!gs.length) return null;
  const max = Math.max(...gs.map((g) => Math.max(g.semana, g.media)), 1) * 1.15;
  const xb = 250, xf = W - 120, topo = 100, alt = (H - topo - 30) / 6;
  const L = (v: number) => ((xf - xb) * v) / max;
  const corpo = [texto(40, 56, 'semana × média (traço)', 24, SUAVE)];
  gs.forEach((g, i) => {
    const y = topo + i * alt, cor = g.semana > g.media ? VERM : VERDE;
    corpo.push(
      texto(40, y + alt / 2 + 8, g.nome, 22, TEXTO),
      `<rect class="barra" x="${xb}" y="${f(y + 10)}" width="${f(Math.max(4, L(g.semana)))}" height="${f(alt - 20)}" rx="8" fill="${cor}"/>`,
      `<line class="media" x1="${f(xb + L(g.media))}" y1="${f(y + 2)}" x2="${f(xb + L(g.media))}" y2="${f(y + alt - 2)}" stroke="${TEXTO}" stroke-width="4"/>`,
      texto(xb + Math.max(L(g.semana), L(g.media)) + 14, y + alt / 2 + 8, brlCurto(g.semana), 20, SUAVE),
    );
  });
  return svg(corpo);
}

export function graficoMensal(r: ResumoMensal): string | null {
  const h = r.historico ?? [];
  if (h.length < 2) return null;
  const maxAbs = Math.max(...h.map((m) => Math.abs(m.sobra)), 1) * 1.2;
  const topo = 110, base = H - 60, zero = (topo + base) / 2, meia = (base - topo) / 2;
  const larg = (W - 80) / h.length;
  const corpo = [texto(40, 56, 'sobra por mês', 24, SUAVE),
    `<line x1="40" y1="${f(zero)}" x2="${W - 40}" y2="${f(zero)}" stroke="${GRADE}" stroke-width="2"/>`];
  h.forEach((m, i) => {
    const x = 40 + i * larg + larg * 0.18, w = larg * 0.64, alto = (Math.abs(m.sobra) / maxAbs) * meia;
    const y = m.sobra >= 0 ? zero - alto : zero, cor = m.sobra >= 0 ? VERDE : VERM;
    const op = m.mes === r.mes ? '1' : '0.55';
    corpo.push(
      `<rect class="barra" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(Math.max(2, alto))}" rx="8" fill="${cor}" fill-opacity="${op}"/>`,
      texto(x, m.sobra >= 0 ? y - 10 : y + alto + 26, brlCurto(m.sobra), 18, SUAVE),
      texto(x + w / 2 - 28, H - 24, m.mesLabel, 20, m.mes === r.mes ? TEXTO : SUAVE),
    );
  });
  return svg(corpo);
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run test/worker/notificacoes-graficos.test.ts`
Expected: PASS. Conferir também visualmente: `node -e` não precisa — o Step 7 da Task 4 grava PNGs reais.

- [ ] **Step 7: Commit** — `feat(notificacoes): graficos SVG e PNG do diario, semanal e mensal (D2)`, arquivos `package.json src/worker/notificacoes/graficos.ts src/worker/notificacoes/png.ts test/worker/notificacoes-graficos.test.ts`.

---

### Task 4: Envio com imagem (canal, motor, CLI, build)

**Files:**
- Modify: `src/worker/notificacoes/canal.ts` (interface `Canal`), `src/worker/notificacoes/whatsapp.ts`, `src/worker/notificacoes/motor.ts`, `src/worker/cli.ts`, `src/worker/index.ts`, `package.json` (script `build:worker`), `Dockerfile` (estágio `worker`)
- Test: `test/worker/notificacoes-whatsapp.test.ts`, `test/worker/notificacoes-motor.test.ts`, `test/worker/cli.test.ts`

**Interfaces:**
- Consumes: `graficoDiario/graficoSemanal/graficoMensal`, `paraPng` (Task 3).
- Produces: `Canal.enviarImagem?(png: Buffer, legenda: string): Promise<void>`; `rodarNotificacao(bot, { ..., renderizar?: (svg: string) => Buffer })`; `ResultadoNotif.svg?: string | null` (só no dry-run); `Args.png?: string`.

- [ ] **Step 1: Teste do canal** — acrescentar em `test/worker/notificacoes-whatsapp.test.ts`:

```ts
describe('WhatsApp: imagem', () => {
  it('sendMedia com base64, legenda e chave no header', async () => {
    const chamadas: any[] = [];
    const c = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'GRUPO@g.us', (async (url: string, init: any) => {
      chamadas.push([url, init.headers.apikey, JSON.parse(init.body)]); return { ok: true, json: async () => ({}) };
    }) as any);
    await c.enviarImagem(Buffer.from('png'), 'legenda');
    expect(chamadas[0]).toEqual(['http://evo:8080/message/sendMedia/financas', 'CHAVE-FALSA', {
      number: 'GRUPO@g.us', mediatype: 'image', mimetype: 'image/png', fileName: 'grafico.png', caption: 'legenda', media: Buffer.from('png').toString('base64'),
    }]);
  });
  it('erro HTTP sem a chave, mesmo com message em objeto', async () => {
    const c = new CanalWhatsApp('http://evo', 'CHAVE-FALSA', 'financas', 'G', (async () => ({ ok: false, status: 400, json: async () => ({ response: { message: [{ x: 'CHAVE-FALSA' }] } }) })) as any);
    await expect(c.enviarImagem(Buffer.from('x'), 'l')).rejects.toThrow(/WhatsApp HTTP 400/);
    await expect(c.enviarImagem(Buffer.from('x'), 'l')).rejects.not.toThrow(/CHAVE-FALSA/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/notificacoes-whatsapp.test.ts`
Expected: FAIL — `c.enviarImagem is not a function`.

- [ ] **Step 3: Implementar o canal** — em `src/worker/notificacoes/canal.ts`:

```ts
export interface Canal {
  enviar(texto: string): Promise<void>;
  /** D2: imagem com legenda (só o WhatsApp); sem isto, o motor manda só o texto */
  enviarImagem?(png: Buffer, legenda: string): Promise<void>;
}
```

Em `src/worker/notificacoes/whatsapp.ts`, extrair o POST para um método privado e acrescentar `enviarImagem`:

```ts
  private async post(rota: string, corpo: object, ms: number): Promise<void> {
    let r;
    try {
      r = await this.fetcher(`${this.baseUrl}/message/${rota}/${this.instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(ms),
      });
    } catch (e) {
      throw new Error(this.semChave(`WhatsApp: ${e instanceof Error ? e.message : String(e)}`));
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = j?.response?.message ?? j?.message ?? 'erro';
      const txt = (Array.isArray(m) ? m : [m]).map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
      throw new Error(this.semChave(`WhatsApp HTTP ${r.status}: ${txt}`));
    }
  }

  async enviar(texto: string): Promise<void> {
    await this.post('sendText', { number: this.destino, text: texto }, 15000);
  }

  async enviarImagem(png: Buffer, legenda: string): Promise<void> {
    await this.post('sendMedia', {
      number: this.destino, mediatype: 'image', mimetype: 'image/png', fileName: 'grafico.png', caption: legenda, media: png.toString('base64'),
    }, 30000);
  }
```

Atualizar o comentário do topo para "texto e imagem".

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/worker/notificacoes-whatsapp.test.ts`
Expected: PASS (incluindo os testes antigos de texto).

- [ ] **Step 5: Testes do motor** — em `test/worker/notificacoes-motor.test.ts`, acrescentar um canal fake com imagem e o bloco:

```ts
function canalComImagem(falhaImagem = false) {
  const textos: string[] = []; const imagens: [Buffer, string][] = [];
  const canal = {
    enviar: async (t: string) => { textos.push(t); },
    enviarImagem: async (p: Buffer, l: string) => { if (falhaImagem) throw new Error('WhatsApp HTTP 400: media'); imagens.push([p, l]); },
  };
  return { canal, textos, imagens };
}
const diarioComSerie = async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, contas: [],
  serie: [{ dia: 1, acumulado: 5 }], cabeNoMes: 100, diasNoMes: 31 });
const png = () => Buffer.from('PNG');

describe('imagem (D2)', () => {
  it('canal com imagem: um envio com legenda = texto; nada de texto separado', async () => {
    const { reg } = registroFake(); const c = canalComImagem();
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(r.enviado).toBe(true);
    expect(c.imagens).toHaveLength(1);
    expect(c.imagens[0][1]).toBe(r.texto);
    expect(c.textos).toHaveLength(0);
  });
  it('imagem recusada: vai o texto e o erro fica com "imagem:"', async () => {
    const { reg, linhas } = registroFake(); const c = canalComImagem(true);
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.textos).toHaveLength(1);
    expect(r.enviado).toBe(true);
    expect(r.erro).toMatch(/^imagem: WhatsApp HTTP 400/);
    expect(linhas.at(-1)!.erro).toMatch(/^imagem:/);
  });
  it('gerar o PNG falhou: vai o texto', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: () => { throw new Error('resvg'); } });
    expect(c.textos).toHaveLength(1);
    expect(r.erro).toBe('imagem: resvg');
  });
  it('painel sem série (sem gráfico) ou canal sem imagem (Telegram): só texto', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    await rodarNotificacao('diario', { fontes: fontes({ diario: async () => ({ ...(await diarioComSerie()), serie: undefined }) }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.textos).toHaveLength(1);
    const t = canalFake();
    await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: t.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(t.enviados).toHaveLength(1);
  });
  it('legenda acima de 1000 caracteres: imagem sem legenda e o texto em seguida', async () => {
    const c = canalComImagem(); const { reg } = registroFake();
    const muitas = Array.from({ length: 40 }, (_, i) => ({ nome: `Conta numero ${i}`, valor: 10, quando: 'hoje' as const }));
    await rodarNotificacao('diario', { fontes: fontes({ diario: async () => ({ ...(await diarioComSerie()), contas: muitas }) }), registro: reg, canais: { grupo: c.canal, matheus: null, telegram: null }, modo: 'real', renderizar: png });
    expect(c.imagens[0][1]).toBe('');
    expect(c.textos).toHaveLength(1);
  });
  it('dry-run devolve o SVG e não renderiza', async () => {
    const { reg } = registroFake(); let chamou = false;
    const r = await rodarNotificacao('diario', { fontes: fontes({ diario: diarioComSerie }), registro: reg, canais: { grupo: null, matheus: null, telegram: null }, modo: 'dry-run', renderizar: () => { chamou = true; return png(); } });
    expect(r.svg).toContain('<svg');
    expect(chamou).toBe(false);
  });
});
```

(`registroFake()` já devolve `{ reg, linhas }` e `canalFake()` `{ canal, enviados }`; se os nomes no arquivo forem outros, usar os do arquivo.)

- [ ] **Step 6: Rodar e ver falhar**

Run: `npx vitest run test/worker/notificacoes-motor.test.ts`
Expected: FAIL — `renderizar`/`svg` não existem; nada de imagem enviado.

- [ ] **Step 7: Implementar no motor** — em `src/worker/notificacoes/motor.ts`:
  - imports: `import { graficoDiario, graficoMensal, graficoSemanal } from './graficos';` e `import { paraPng } from './png';`
  - `ResultadoNotif` ganha `svg?: string | null`.
  - `montar` devolve `{ texto, estado, svg? }`: nos casos `diario`/`semanal`/`mensal`, `svg: grafico*(dados)` envolto em `try { … } catch { null }` (gráfico nunca derruba a mensagem):

```ts
const seguro = (g: () => string | null) => { try { return g(); } catch { return null; } };
// ...
    case 'diario': return { texto: montarDiario(dados, url('inicio')), estado: null, svg: seguro(() => graficoDiario(dados)) };
    case 'semanal': return { texto: montarSemanal(dados, { gastos: url('gastos'), trilha: url('trilha') }), estado: null, svg: seguro(() => graficoSemanal(dados)) };
    case 'mensal': return { texto: montarMensal(dados, url('previsao', dados?.mes)), estado: null, svg: seguro(() => graficoMensal(dados)) };
```

  - assinatura: `d: { fontes; registro; canais; modo; painelUrl?: string; renderizar?: (svg: string) => Buffer }`.
  - tipo de `m`: `{ texto: string | null; estado: unknown | null; svg?: string | null }`.
  - dry-run: `return { bot, modo, texto: m.texto, enviado: false, erro: null, svg: m.svg ?? null };`
  - envio real, no lugar do `try { await canal!.enviar(m.texto); enviado = true } catch …`:

```ts
const LIMITE_LEGENDA = 1000;

/** Imagem + legenda quando dá; qualquer falha da imagem cai para o texto (a mensagem não se perde pelo gráfico). */
async function entregar(canal: Canal, texto: string, svg: string | null | undefined, renderizar: (s: string) => Buffer): Promise<string | null> {
  if (svg && canal.enviarImagem) {
    try {
      const png = renderizar(svg);
      if (texto.length <= LIMITE_LEGENDA) { await canal.enviarImagem(png, texto); return null; }
      await canal.enviarImagem(png, '');
    } catch (e) {
      await canal.enviar(texto);
      return `imagem: ${msg(e)}`;
    }
  }
  await canal.enviar(texto);
  return null;
}
// ...
  if (modo === 'real') {
    try {
      const aviso = await entregar(canal!, m.texto, m.svg, d.renderizar ?? ((s) => paraPng(s)));
      enviado = true;
      erro = aviso;
    } catch (e) {
      erro = msg(e);
    }
  }
  // envio que falhou não avança o estado; aviso só da imagem ("imagem: …") com o texto entregue avança
  await d.registro.gravar({ bot, modo, texto: m.texto, enviado, erro, estado: enviado ? m.estado : null });
```

  (Antes era `estado: erro ? null : m.estado`; agora `enviado ? m.estado : null` — mesmo efeito quando não há imagem, e o aviso de imagem não faz repetir aviso de fatura/gasto.) Importar `type Canal` já existe.

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run test/worker`
Expected: PASS (todos, incluindo os do C2).

- [ ] **Step 9: CLI `--png`** — teste em `test/worker/cli.test.ts`:

```ts
  it('notificação aceita --png <arquivo> só com --dry-run', () => {
    expect(lerArgs(['notif-diario', '--dry-run', '--png', '/tmp/d.png'])).toEqual({ tarefa: 'notif-diario', dryRun: true, png: '/tmp/d.png' });
    expect(() => lerArgs(['notif-diario', '--png', '/tmp/d.png'])).toThrow(/--png só com --dry-run/);
    expect(() => lerArgs(['notif-diario', '--dry-run', '--png'])).toThrow(/--png precisa de um arquivo/);
  });
```

Run: `npx vitest run test/worker/cli.test.ts` → FAIL. Implementar em `src/worker/cli.ts`: `Args` ganha `png?: string;` e o ramo das notificações vira:

```ts
  if (NOTIFS.has(primeiro)) {
    // notificação: --dry-run (monta e mostra, não grava nem envia) e --png <arquivo> (grava o gráfico)
    const out: Args = { tarefa: primeiro as TarefaNotif, dryRun: false };
    for (let i = 0; i < resto.length; i++) {
      if (resto[i] === '--dry-run') out.dryRun = true;
      else if (resto[i] === '--png') {
        const v = resto[++i];
        if (!v || v.startsWith('--')) throw new Error('--png precisa de um arquivo');
        out.png = v;
      } else throw new Error(`opção desconhecida: ${resto[i]}`);
    }
    if (out.png && !out.dryRun) throw new Error('--png só com --dry-run');
    return out;
  }
```

Run de novo → PASS (o teste antigo de `--dry-run` continua: `{ tarefa, dryRun: true }` sem `png`).

- [ ] **Step 10: `index.ts`** — no ramo `args.tarefa.startsWith('notif-')`:

```ts
  if (args.tarefa.startsWith('notif-')) {
    const r = await notificar(args.tarefa.slice('notif-'.length) as Bot, args.dryRun);
    if (args.png) {
      if (r.svg) { writeFileSync(args.png, paraPng(r.svg)); console.log(`gráfico gravado em ${args.png}`); }
      else console.log('sem gráfico para esta mensagem');
    }
    const { svg: _svg, ...semSvg } = r;
    console.log(JSON.stringify(semSvg, null, 2));
    await pool.end();
    process.exitCode = r.erro && !r.erro.startsWith('imagem:') ? 1 : 0;
    return;
  }
```

com `import { writeFileSync } from 'node:fs';` e `import { paraPng } from './notificacoes/png';`. No `agendar`, o log já mostra `erro=` (o aviso `imagem:` aparece ali).

- [ ] **Step 11: Build do worker e Dockerfile** — `package.json`, script `build:worker`: acrescentar `--external:@resvg/resvg-js` aos três comandos do esbuild. `Dockerfile`, estágio `worker`, depois do `COPY --from=worker-build /app/dist/...`:

```dockerfile
# D2: resvg é nativo (binário musl) e fica fora do bundle; a fonte do gráfico vem do pacote dejavu
COPY --from=worker-build /app/node_modules/@resvg ./node_modules/@resvg
COPY --from=worker-build /app/node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf /app/node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf ./fonts/
```

Run: `npm run build:worker && npx tsc --noEmit && npx vitest run --exclude 'test/integracao/**'`
Expected: build ok; tsc sem saída; suíte toda verde.

Conferência visual local (sem enviar nada): `node -e "const {graficoDiario}=require('./dist/...')"` não serve (bundle único) — em vez disso, um teste descartável não commitado: `npx tsx -e` não está instalado; usar `npx vitest run test/worker/notificacoes-graficos.test.ts` com uma linha temporária que grava `paraPng(...)` em `.superpowers/sdd/<plano>/d2-*.png` e abrir as imagens (Read). Remover a linha antes do commit.

- [ ] **Step 12: Commit** — `feat(notificacoes): imagem com legenda no WhatsApp e queda para texto (D2)`, arquivos `src/worker test/worker package.json Dockerfile`.

---

### Task 5: Produção — teste no grupo de teste

- [ ] Suíte com integração (um arquivo por vez), `tsc`, `build`, `build:worker`; varredura de segredo/número/id/valor no diff; revisão final independente (opus) com a Review Focus.
- [ ] Deploy do painel (tar → `/root/fd_d2.tgz`, `cp -a /root/finance-dash /root/finance-dash.bak-pre-d2`, build, `compose up -d --no-deps --force-recreate finance-dashboard`); conferir `/api/resumo/{diario,semanal,mensal}` em 200 e os campos novos (`serie`, `todosGrupos`, `historico`) pela rede interna.
- [ ] Deploy do worker (`docker tag finance-worker:1 finance-worker:pre-d2`; fonte em `/root/finance-worker-src`; `docker build --target worker`; `compose up -d --no-deps --force-recreate finance-worker`) **fora de 16h–16h40 e 22h–22h40 SP e longe dos minutos :09**. Conferir `docker exec finance-worker node -e "require('@resvg/resvg-js')"` e `ls /app/fonts`.
- [ ] Conferência sem enviar: `docker exec finance-worker node worker.js notif-diario --dry-run --png /tmp/d2-diario.png` (idem semanal, mensal), copiar com `docker cp` e `scp` para o scratchpad e olhar as imagens.
- [ ] Disparo real, **um de cada**, no grupo de teste: `docker exec -e NOTIF_REAL=diario finance-worker node worker.js notif-diario` (idem semanal, mensal, técnico). Matheus confere no celular.
- [ ] Push, PR com base `feat/d-whatsapp` (#15); roadmap no vault (linha do D/D2).
