# D — WhatsApp e notificações redesenhadas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diário, semanal e mensal no grupo do casal pelo WhatsApp (Evolution API), técnico no privado do Matheus; teste no número dele até o chip chegar; depois, Telegram desligado.

**Architecture:** O painel entrega os dados das mensagens por rotas internas (`/api/resumo/{diario,semanal,mensal}`), montados por funções puras em `src/lib/resumos.ts` sobre o que já existe (previsão, contas, trilha, meses passados, grupos). O worker (motor do C2) monta o texto (`textosD.ts`, puro), escolhe o canal pelo destino e envia pelo `CanalWhatsApp`. A Evolution API roda num container sem porta pública; scripts na VPS (rodados pelo Matheus) geram a chave, conectam o número por código de pareamento e listam grupos.

**Tech Stack:** Next.js 14, Node/TypeScript (worker), `pg`, `croner`, Evolution API v2 (Docker), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-11-d-whatsapp-notificacoes-design.md`

## Global Constraints

- Agendas (SP): diário `0 8 * * *`; semanal `0 9 * * 1`; mensal `0 9 1 * *`; técnico `30 12 * * *`.
- Diário/semanal/mensal → `WA_GRUPO`; técnico → `WA_MATHEUS`. Sem destino configurado, a mensagem fica em sombra.
- `NOTIF_REAL` aceita `diario,semanal,mensal,tecnico` (além dos bots do C2).
- Links: `linkPara(tela, filtros)` com `PAINEL_URL` na frente; sempre o casal.
- Texto em tom contido, sem gíria de TI; Markdown do WhatsApp (`*negrito*`, `_itálico_`); link em texto puro na última linha.
- Claude **nunca** vê a chave da Evolution nem o código de pareamento: os scripts rodam no terminal do Matheus.
- Evolution: sem porta publicada; não grava mensagens/contatos/chats; sem webhook.
- Nada de disparo em repetição para teste (incidente das 139 mensagens): um disparo por mensagem, pela linha de comando.
- Repositório público: nenhum número de telefone, id de grupo, chave ou dado real em código, teste ou commit.
- Commits via `git commit -F` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Diário no último dia do mês** → sem "por dia" (não há dias restantes); só o fecha e as contas. (Task 2)
2. **Conta já paga que vence amanhã** → não aparece no diário; só as não pagas. (Task 1)
3. **Semana sem nenhum gasto (ou média zero)** → semanal não divide por zero e diz algo sensato. (Task 1, Task 2)
4. **Evolution fora do ar / número desconectado** → erro registrado (sem a chave), worker segue, nada é perdido no estado. (Task 3)
5. **Técnico com tudo bem** → nenhuma mensagem; consentimento a ≤ 30 dias → uma linha por banco. (Task 2)

---

### Task 1: Dados dos resumos no painel

**Files:** Create `src/lib/resumos.ts`, `src/app/api/resumo/diario/route.ts`, `src/app/api/resumo/semanal/route.ts`, `src/app/api/resumo/mensal/route.ts`; Modify `src/lib/queries.ts`; Test `test/lib/resumos.test.ts`, `test/integracao/resumos.test.ts`

**Interfaces — Produces (JSON das rotas):**
- `ResumoDiario = { mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number; contas: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[] }`
- `ResumoSemanal = { semana: { inicio: string; fim: string }; total: number; mediaTotal: number; grupos: { nome: string; emoji: string; semana: number; media: number }[]; trilha: { fase: number; titulo: string; proximoPasso: string } }` (grupos: até 3, os de maior |semana − média|)
- `ResumoMensal = { mes: string; mesLabel: string; sobraReal: number; sobraPrevista: number; saldoFim: number; trilha: { fase: number; titulo: string; mudou: boolean; faseAntes: number | null }; mesNovo: { mesLabel: string; fechaCom: number } }`
- Puras em `resumos.ts`: `contasDoDia(itens: ItemConta[], hojeDia: number, diasNoMes: number): ResumoDiario['contas']`; `gruposDaSemana(semana: GrupoGasto[], media4: GrupoGasto[]): ResumoSemanal['grupos']`; `semanaAnterior(hoje: string): { inicio: string; fim: string }` (seg–dom anterior ao `hoje`)
- Consulta nova em `queries.ts`: `getGastoPorCategoriaEntre(inicio: string, fimExcl: string): Promise<Map<string, number>>` (casal; `classe='despesa'`; `categoria_efetiva`)
- Fase da trilha no mês anterior (para "mudou"): `avaliarTrilha(await getTrilhaDados(<último dia do mês anterior>))`

- [ ] **Step 1: testes puros (falham primeiro)** — `test/lib/resumos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contasDoDia, gruposDaSemana, semanaAnterior } from '../../src/lib/resumos';

const item = (nome: string, dia: number | null, status: 'pago' | 'a_confirmar' | 'falta', previsto = 100) =>
  ({ contaId: 1, marcaId: null, nome, responsavel: 'X', previsto, pago: null, status, dia, parcela: null, avulsa: false, origem: null }) as any;

describe('contas do dia', () => {
  it('vencendo hoje e amanhã, não pagas', () => {
    expect(contasDoDia([item('Luz', 10, 'falta'), item('Agua', 11, 'a_confirmar', 80), item('Net', 11, 'pago'), item('Aluguel', 15, 'falta'), item('Sem dia', null, 'falta')], 10, 31))
      .toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }]);
  });
  it('último dia do mês: "amanhã" não existe neste mês', () => {
    expect(contasDoDia([item('Luz', 31, 'falta'), item('Gás', 1, 'falta')], 31, 31)).toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }]);
  });
});

describe('grupos da semana', () => {
  const g = (nome: string, total: number) => ({ nome, emoji: '•', total, pctRenda: 0, travado: false });
  it('os 3 que mais mudaram em relação à média semanal das 4 semanas', () => {
    const r = gruposDaSemana([g('Mercado', 500), g('Comer fora', 50), g('Casa', 0), g('Transporte', 210)], [g('Mercado', 1200), g('Comer fora', 1600), g('Casa', 800), g('Transporte', 840)]);
    expect(r.map((x) => [x.nome, x.semana, x.media])).toEqual([['Comer fora', 50, 400], ['Mercado', 500, 300], ['Casa', 0, 200]]);
  });
  it('sem gasto e sem média: lista vazia, sem NaN', () => {
    expect(gruposDaSemana([], [])).toEqual([]);
  });
});

describe('semana anterior', () => {
  it('segunda a domingo antes de hoje', () => {
    expect(semanaAnterior('2026-10-12')).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' }); // segunda
    expect(semanaAnterior('2026-10-15')).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' }); // quinta
  });
});
```

Run → FAIL.

- [ ] **Step 2: implementar `resumos.ts`**:

```ts
// Dados das mensagens do D (diário, semanal, mensal): só remonta o que o painel já calcula.
import type { ItemConta } from './contas';
import type { GrupoGasto } from './grupos';
import { addMonths } from './previsao';

const r2 = (x: number) => Math.round(x * 100) / 100;

export function contasDoDia(itens: ItemConta[], hojeDia: number, diasNoMes: number) {
  const out: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[] = [];
  for (const i of itens) {
    if (i.status === 'pago' || i.dia === null) continue;
    if (i.dia === hojeDia) out.push({ nome: i.nome, valor: i.previsto, quando: 'hoje' });
    else if (hojeDia < diasNoMes && i.dia === hojeDia + 1) out.push({ nome: i.nome, valor: i.previsto, quando: 'amanhã' });
  }
  return out.sort((a, b) => (a.quando === b.quando ? 0 : a.quando === 'hoje' ? -1 : 1));
}

/** media4 = total das 4 semanas anteriores por grupo; a média semanal é /4. */
export function gruposDaSemana(semana: GrupoGasto[], media4: GrupoGasto[]) {
  const nomes = new Set([...semana.map((g) => g.nome), ...media4.map((g) => g.nome)]);
  const emoji = new Map([...media4, ...semana].map((g) => [g.nome, g.emoji]));
  return Array.from(nomes)
    .map((nome) => ({
      nome, emoji: emoji.get(nome) ?? '•',
      semana: r2(semana.find((g) => g.nome === nome)?.total ?? 0),
      media: r2((media4.find((g) => g.nome === nome)?.total ?? 0) / 4),
    }))
    .filter((g) => g.semana > 0 || g.media > 0)
    .sort((a, b) => Math.abs(b.semana - b.media) - Math.abs(a.semana - a.media))
    .slice(0, 3);
}

export function semanaAnterior(hoje: string) {
  const d = new Date(`${hoje}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  const seg = new Date(d.getTime() - (dow + 7) * 86400000);
  const dom = new Date(seg.getTime() + 6 * 86400000);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: f(seg), fim: f(dom) };
}
```

> `ItemConta.status` é `'pago' | 'a_confirmar' | 'falta'` (`src/lib/contas.ts`): só `pago` sai do diário. `addMonths` fica para as rotas (mês anterior).

- [ ] **Step 3: consulta e rotas** — `getGastoPorCategoriaEntre` em `queries.ts`:

```ts
/** Gasto do casal por categoria (efetiva) num intervalo [inicio, fimExcl). */
export async function getGastoPorCategoriaEntre(inicio: string, fimExcl: string): Promise<Map<string, number>> {
  const rows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS cat, SUM(valor)::float8 AS v
     FROM financas_lancamentos WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date
     GROUP BY 1`, [inicio, fimExcl]);
  return new Map(rows.map((r) => [r.cat, Number(r.v)]));
}
```

Rotas (`force-dynamic`, resposta JSON):
- `diario`: `getPrevisaoResumo('casal')` → `mesLabel, fechaCom, diasRestantes, ritmoSeguroDia, ritmoAtualDia`; `getContasDoMes('casal', mes)` → `contasDoDia(itens, dia de hoje, diasNoMes(mes))`.
- `semanal`: `semanaAnterior(hoje)`; `agruparGastos(await getGastoPorCategoriaEntre(inicio, fim+1), 0)` para a semana e para as 4 semanas antes (`inicio − 28 dias` até `inicio`); `gruposDaSemana`; `total`/`mediaTotal`; trilha atual (`avaliarTrilha(await getTrilhaDados())` → fase atual, título, próximo passo — o próximo passo passa por `partesDoTexto` e vira texto com `brl` no valor).
- `mensal`: mês fechado = mês anterior a hoje; `getMesesPassados('casal', hoje)` → o último (`real.saldo`, `previsto.saldo`, `saldoFim`); trilha hoje e trilha no último dia do mês anterior ao fechado (`getTrilhaDados(data)`), `mudou`; `mesNovo` = `getPrevisaoResumo('casal')` (`mesLabel`, `fechaCom`).

- [ ] **Step 4: integração** — `test/integracao/resumos.test.ts`: lançamentos sintéticos numa semana e nas 4 anteriores → `getGastoPorCategoriaEntre` soma por categoria e respeita o intervalo (o dia `fimExcl` fica fora).
- [ ] **Step 5:** PASS; `tsc`; `build`. **Step 6: commit** — `feat(resumos): dados do diario, semanal e mensal no painel (D)`.

---

### Task 2: Mensagens do D (puras)

**Files:** Create `src/worker/notificacoes/textosD.ts`; Test `test/worker/notificacoes-textosD.test.ts`

**Interfaces:** Consumes os JSON da Task 1 (tipos redeclarados no worker — o worker não importa do painel); `montarSaude`, `montarBackup` (C2). Produces:
- `montarDiario(r: ResumoDiario, link: string): string`
- `montarSemanal(r: ResumoSemanal, links: { gastos: string; trilha: string }): string`
- `montarMensal(r: ResumoMensal, link: string): string`
- `montarTecnico(s: { saude: SaudeDados; backup: BackupDados; consentimentos: { banco: string; responsavel: string; dias: number }[] }): string | null`

- [ ] **Step 1: testes (falham primeiro)**:

```ts
import { describe, expect, it } from 'vitest';
import { montarDiario, montarMensal, montarSemanal, montarTecnico } from '../../src/worker/notificacoes/textosD';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = { mesLabel: 'out/26', fechaCom: -500, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' as const }] };

describe('diário', () => {
  it('ritmo, fecha, contas e link', () => {
    expect(montarDiario(dia, 'https://painel/')).toBe([
      `*Bom dia.* Hoje dá pra gastar *${brl(50)}*.`,
      `Vocês vêm gastando ${brl(80)} por dia, acima do que cabe.`,
      `Nesse ritmo, out/26 fecha em *${brl(-500)}*.`,
      '', `*Contas:* Luz (${brl(120)}) vence hoje.`, '', 'https://painel/',
    ].join('\n'));
  });
  it('dentro do que cabe; sem contas a parte some; último dia sem "por dia"', () => {
    const t = montarDiario({ ...dia, ritmoAtualDia: 40, contas: [] }, 'L');
    expect(t).toContain('dentro do que cabe');
    expect(t).not.toContain('Contas');
    const u = montarDiario({ ...dia, diasRestantes: 0 }, 'L');
    expect(u).not.toContain('dá pra gastar');
    expect(u).toContain('out/26 fecha em');
  });
});

describe('semanal', () => {
  it('total × média, até 3 grupos com seta, trilha e links', () => {
    const t = montarSemanal({ semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 900, mediaTotal: 1000,
      grupos: [{ nome: 'Comer fora', emoji: '🍔', semana: 50, media: 400 }, { nome: 'Mercado', emoji: '🛒', semana: 500, media: 300 }],
      trilha: { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Manter a fatura paga inteira.' } }, { gastos: 'G', trilha: 'T' });
    expect(t).toContain('*Semana de 05/10 a 11/10*');
    expect(t).toContain(`Gastaram ${brl(900)} (a média é ${brl(1000)}).`);
    expect(t).toContain(`🍔 Comer fora: ${brl(50)} (média ${brl(400)}) ↓`);
    expect(t).toContain(`🛒 Mercado: ${brl(500)} (média ${brl(300)}) ↑`);
    expect(t).toContain('*Trilha:* fase 1, Sair das dívidas. Manter a fatura paga inteira.');
    expect(t.endsWith('G\nT')).toBe(true);
  });
  it('semana sem gasto e média zero: sem NaN, sem lista de grupos', () => {
    const t = montarSemanal({ semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 0, mediaTotal: 0, grupos: [], trilha: { fase: 2, titulo: 'Fazer sobrar', proximoPasso: 'x' } }, { gastos: 'G', trilha: 'T' });
    expect(t).not.toContain('NaN');
    expect(t).toContain('Nenhum gasto registrado na semana.');
  });
});

describe('mensal', () => {
  it('sobra × prevista, saldo, trilha (mudou) e o mês novo', () => {
    const t = montarMensal({ mes: '2026-09', mesLabel: 'set/26', sobraReal: 300, sobraPrevista: -1300, saldoFim: -1200,
      trilha: { fase: 2, titulo: 'Fazer sobrar', mudou: true, faseAntes: 1 }, mesNovo: { mesLabel: 'out/26', fechaCom: -500 } }, 'L');
    expect(t).toContain('*set/26 fechou.*');
    expect(t).toContain(`Sobrou ${brl(300)} (o previsto era ${brl(-1300)}).`);
    expect(t).toContain(`Saldo em conta no fim: ${brl(-1200)}.`);
    expect(t).toContain('*Trilha:* passaram da fase 1 para a 2, Fazer sobrar.');
    expect(t).toContain(`out/26 começa fechando em ${brl(-500)}.`);
  });
});

describe('técnico', () => {
  const ok = { saude: { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 5, worker_falhas_24h: 0, ultimo_lancamento: '10/10/2026' },
    backup: { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 20, h_desde_offsite: 10, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null }, consentimentos: [] };
  it('tudo bem: nada; consentimento e saúde viram linhas', () => {
    expect(montarTecnico(ok)).toBeNull();
    const t = montarTecnico({ ...ok, saude: { ...ok.saude, h_worker_ok: 30 }, consentimentos: [{ banco: 'B1', responsavel: 'X', dias: 10 }] })!;
    expect(t).toContain('Ingestão (worker): última rodada completa há 30h');
    expect(t).toContain('• Consentimento do B1 (X) na Pluggy vence em 10 dias');
  });
});
```

Run → FAIL.

- [ ] **Step 2: implementar `textosD.ts`** (formato exatamente o dos testes; `brl` pt-BR; data `DD/MM` da semana; seta `↑` se semana > média, `↓` se menor, nada se igual; técnico = linhas `•` de `montarSaude`/`montarBackup` (extraídas do texto deles, sem cabeçalho) + consentimentos, com cabeçalho `*Aviso técnico*`; `null` se nenhuma linha).

> Para reaproveitar as linhas do C2 sem duplicar regra: extrair em `textos.ts` `linhasSaude(s): string[]` e `linhasBackup(s): string[]` (as listas `probs` de hoje) e fazer `montarSaude`/`montarBackup` usarem-nas — o teste de equivalência do C2 garante que nada mudou.

- [ ] **Step 3:** PASS (inclusive `notificacoes-equivalencia`). **Step 4: commit** — `feat(notificacoes): mensagens diario, semanal, mensal e tecnico (D)`.

---

### Task 3: Canal WhatsApp e destinos no worker

**Files:** Create `src/worker/notificacoes/whatsapp.ts`; Modify `src/worker/notificacoes/motor.ts`, `src/worker/notificacoes/fontes.ts`, `src/worker/notificacoes/textos.ts` (tipo `Bot`), `src/worker/cli.ts`, `src/worker/index.ts`; Test `test/worker/notificacoes-whatsapp.test.ts`, `test/worker/notificacoes-motor.test.ts`, `test/worker/cli.test.ts`

**Interfaces:**
- `class CanalWhatsApp implements Canal { constructor(baseUrl: string, apiKey: string, instancia: string, destino: string, fetcher = fetch) }` — `POST ${baseUrl}/message/sendText/${instancia}` `{ number: destino, text }`, header `apikey`, timeout 15 s; erro `WhatsApp HTTP <status>: <message>` sem a chave.
- `Bot` passa a incluir `'diario' | 'semanal' | 'mensal' | 'tecnico'`; `destinoDe(bot): 'grupo' | 'matheus'` (técnico → matheus; resto → grupo; os 5 do C2 → grupo, enquanto existirem).
- `rodarNotificacao` recebe `canais: { grupo: Canal | null; matheus: Canal | null }` no lugar de `canal` e usa `canais[destinoDe(bot)]`.
- Fontes novas: `diario/semanal/mensal` = GET `${urlPainel}/api/resumo/<x>`; `tecnico` = `{ saude, backup, consentimentos }` (consentimentos: `SELECT banco, responsavel, (consent_expires_at::date - (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias FROM pluggy_itens WHERE consent_expires_at IS NOT NULL AND consent_expires_at < now() + interval '30 days'`).
- Montagem: `diario/semanal/mensal/tecnico` chamam as funções da Task 2 com links `PAINEL_URL + linkPara(...)` (o worker recebe a base e monta os caminhos: `/`, `/gastos`, `/trilha`, `/previsibilidade?mes=AAAA-MM`).
- `AGENDA_NOTIF` ganha `['0 8 * * *','diario']`, `['0 9 * * 1','semanal']`, `['0 9 1 * *','mensal']`, `['30 12 * * *','tecnico']`.
- `index.ts`: `WA_URL` (padrão `http://evolution:8080`), `WA_API_KEY`, `WA_INSTANCIA` (padrão `financas`), `WA_GRUPO`, `WA_MATHEUS`, `PAINEL_URL`; canais criados só se as variáveis existirem.

- [ ] **Step 1: testes (falham primeiro)**:

```ts
// notificacoes-whatsapp.test.ts
import { describe, expect, it } from 'vitest';
import { CanalWhatsApp } from '../../src/worker/notificacoes/whatsapp';

describe('canal WhatsApp', () => {
  it('manda texto para o destino com a chave no cabeçalho; erro não expõe a chave', async () => {
    const chamadas: any[] = [];
    const ok = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'GRUPO@g.us', (async (url: string, init: any) => { chamadas.push([url, init.headers.apikey, JSON.parse(init.body)]); return { ok: true, json: async () => ({}) }; }) as any);
    await ok.enviar('oi');
    expect(chamadas[0]).toEqual(['http://evo:8080/message/sendText/financas', 'CHAVE-FALSA', { number: 'GRUPO@g.us', text: 'oi' }]);
    const ruim = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'G', (async () => ({ ok: false, status: 401, json: async () => ({ response: { message: ['Unauthorized CHAVE-FALSA'] } }) })) as any);
    const e = await ruim.enviar('oi').catch((x) => String(x));
    expect(e).toContain('WhatsApp HTTP 401');
    expect(e).not.toContain('CHAVE-FALSA');
  });
});
```

Em `notificacoes-motor.test.ts`: adaptar `canal:` → `canais: { grupo: canal, matheus: null }` e acrescentar:

```ts
  it('técnico vai para o canal do Matheus; sem esse canal fica em sombra', async () => {
    const { reg } = registroFake(); const grupo = canalFake(); const matheus = canalFake();
    const f = fontes({ tecnico: async () => ({ saude: { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 30, worker_falhas_24h: 0, ultimo_lancamento: 'x' }, backup: { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 1, h_desde_offsite: 1, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null }, consentimentos: [] }) });
    await rodarNotificacao('tecnico', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: matheus.canal }, modo: 'real' });
    expect(matheus.enviados).toHaveLength(1);
    expect(grupo.enviados).toHaveLength(0);
    const r = await rodarNotificacao('tecnico', { fontes: f, registro: reg, canais: { grupo: grupo.canal, matheus: null }, modo: 'real' });
    expect(r.modo).toBe('sombra');
  });
```

E em `cli.test.ts`: `AGENDA_NOTIF` contém os 4 novos; `lerArgs(['notif-diario', '--dry-run'])` aceito.

Run → FAIL.

- [ ] **Step 2: implementar** conforme as interfaces. O `montar` do motor ganha os 4 casos; o `urlPainel` vem de `criarFontes(pool, urlPainel)` (o ritmo do C2 passa a usar `${urlPainel}/api/previsao`).
- [ ] **Step 3:** `npx vitest run test/worker` → PASS; `tsc`; `build:worker`. **Step 4: commit** — `feat(notificacoes): canal WhatsApp e destinos (D)`.

---

### Task 4: Evolution API na VPS e scripts do Matheus

**Files:** Create `deploy/evolution/compose-evolution.yml` (trecho para o compose da VPS, sem segredo), `scripts/d-evolution-env.sh`, `scripts/d-whatsapp-conectar.sh`, `scripts/d-whatsapp-grupos.sh`; Test: `bash -n` nos scripts + simulação com valores falsos (como no C2)

- [ ] **Step 1: compose** — serviço `evolution` (imagem da Evolution API v2 com **tag fixa**, conferida com `docker pull` antes de fixar; registrar a tag no ledger), `env_file: /root/n8n-docker/.env.evolution`, rede `n8n_network`, **sem `ports:`**, volume para `/evolution/instances`, variáveis: `SERVER_URL=http://evolution:8080`, `DATABASE_ENABLED=true`, `DATABASE_PROVIDER=postgresql`, `DATABASE_SAVE_DATA_INSTANCE=true`, `DATABASE_SAVE_DATA_NEW_MESSAGE=false`, `DATABASE_SAVE_MESSAGE_UPDATE=false`, `DATABASE_SAVE_DATA_CONTACTS=false`, `DATABASE_SAVE_DATA_CHATS=false`, `DATABASE_SAVE_DATA_LABELS=false`, `DATABASE_SAVE_DATA_HISTORIC=false`, `CACHE_REDIS_ENABLED=false`, `CACHE_LOCAL_ENABLED=true`, `WEBHOOK_GLOBAL_ENABLED=false`, `LOG_LEVEL=ERROR,WARN`.
- [ ] **Step 2: `d-evolution-env.sh`** (Matheus roda na VPS): cria `evolution_db` e o usuário `evolution` no `postgres-hub` com senha gerada (`openssl rand -hex 24`), gera `AUTHENTICATION_API_KEY` (`openssl rand -hex 32`), grava `/root/n8n-docker/.env.evolution` (`AUTHENTICATION_API_KEY`, `DATABASE_CONNECTION_URI`) e acrescenta `WA_API_KEY` em `/root/n8n-docker/.env.worker-whatsapp` — tudo 600, sem exibir valores; idempotente (não sobrescreve se já existe, a menos de `--refazer`).
- [ ] **Step 3: `d-whatsapp-conectar.sh`** (Matheus roda na VPS, depois do container no ar): lê a chave do `.env.evolution`; cria a instância `financas` (`POST /instance/create` `{ instanceName, integration: 'WHATSAPP-BAILEYS' }`) se não existir; pede o número (com DDI, só dígitos) com `read`; chama `GET /instance/connect/financas?number=<n>` e mostra **só o código de pareamento** (8 caracteres) com a instrução "WhatsApp → Aparelhos conectados → Conectar com número de telefone"; espera e mostra o estado (`connectionState` = `open`). `--trocar`: `DELETE /instance/logout/financas` antes. Chamadas por `docker exec finance-worker` (o worker está na mesma rede e tem `fetch`) ou `docker run --rm --network n8n-docker_n8n_network curlimages/curl`.
- [ ] **Step 4: `d-whatsapp-grupos.sh`**: lista `nome — id` dos grupos da instância (`GET /group/fetchAllGroups/financas?getParticipants=false`), para o Matheus escolher o grupo; grava `WA_GRUPO` e `WA_MATHEUS` (pergunta) em `.env.worker-whatsapp`.
- [ ] **Step 5:** `bash -n` nos 3; simulação local do `d-evolution-env.sh` com `ARQ`/comandos trocados por arquivos temporários (sem Docker), conferindo que nenhum valor é impresso. **Step 6: commit** — `feat(d): evolution api e scripts de conexao do WhatsApp (D)`.

---

### Task 5: Produção — teste no número do Matheus

- [ ] Suíte com integração, `tsc`, `build`, `build:worker`; varredura (números, ids, chaves); revisão final independente.
- [ ] Deploy do painel (rotas `/api/resumo/*` em 200 pela rede interna) e do worker (tag `finance-worker:pre-d`), com `env_file` do `.env.worker-telegram` e do `.env.worker-whatsapp` no compose (fora das janelas de ingestão).
- [ ] Matheus roda `d-evolution-env.sh`; Claude sobe o serviço `evolution` (confere: sem porta publicada, `docker ps`, log sem erro); Matheus roda `d-whatsapp-conectar.sh` com o número dele e cria um **grupo de teste**; roda `d-whatsapp-grupos.sh` escolhendo o grupo de teste e o número dele para `WA_MATHEUS`; Claude recria o worker.
- [ ] Disparo de teste, **um de cada**, pela linha de comando, com a mensagem em `NOTIF_REAL` só nessa execução (`docker exec -e NOTIF_REAL=diario finance-worker node worker.js notif-diario`, idem semanal, mensal, técnico — o técnico só manda se houver problema; para testar o canal, conferir em `--dry-run` e, se quiser, forçar com o consentimento a ≤ 30 dias se houver). Conferir no WhatsApp.
- [ ] Push e PR com base `feat/c2-notificacoes`; roadmap no vault.
- [ ] **Depois (quando o chip chegar)**: `d-whatsapp-conectar.sh --trocar` com o chip, `d-whatsapp-grupos.sh` com o grupo do casal, `NOTIF_REAL=diario,semanal,mensal,tecnico`; após 3 diários + 1 semanal no grupo do casal, desligar o Telegram (bots 02–12 no n8n pela skill `mexer-n8n`; os 5 do C2 saem da `AGENDA_NOTIF`).
