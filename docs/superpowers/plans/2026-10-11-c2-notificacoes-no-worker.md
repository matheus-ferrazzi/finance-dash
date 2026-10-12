# C2 — Notificações no worker: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar os bots 12, 08, 09, 05 e 11 do n8n para o worker (texto idêntico), com registro em `financas_notificacoes`, modo sombra/real por bot e canal Telegram trocável; deploy em sombra e troca bot a bot.

**Architecture:** Módulo `src/worker/notificacoes/`: `textos.ts` (montagem pura, portada dos nós Code), `fontes.ts` (as consultas SQL dos nós Postgres e o GET do painel), `canal.ts` (Telegram), `motor.ts` (estado, modo, gravação, envio). O `index.ts` agenda as 5 tarefas com o mesmo `croner` da ingestão; a CLI roda cada uma com `--dry-run`.

**Tech Stack:** Node/TypeScript (worker), `pg`, `croner`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-11-c2-notificacoes-no-worker-design.md`

## Global Constraints

- Texto **idêntico** ao do n8n (mesmo Markdown, mesmos emojis, mesma pontuação, `brl` = `toLocaleString('pt-BR',{style:'currency',currency:'BRL'})`).
- Agendas (SP): ritmo `0 8 * * *`; fatura `0 9 * * *`; gasto `45 16,22 * * *`; saúde `30 12 * * *`; backup `0 10 * * *`.
- Estado (marca d'água do gasto, faturas avisadas) lido da última linha do bot **em qualquer modo**.
- `NOTIF_REAL` = lista de bots (`ritmo,fatura,gasto,saude,backup`) que enviam; os outros em sombra; sem `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, todos em sombra.
- Claude **nunca** manipula token: o Matheus roda o script que grava as variáveis.
- Falha de notificação não derruba o worker nem a ingestão.
- Repositório público: nenhum token, chat id ou dado real em código, teste ou commit.
- Commits via `git commit -F` com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Primeira execução do gasto grande com muitas despesas recentes** → nenhuma mensagem, só a marca d'água (como o n8n). (Task 1)
2. **Fatura que continua na janela de 0–3 dias por vários dias** → avisada uma vez só, inclusive depois de trocar de sombra para real. (Task 1, Task 2)
3. **Painel fora do ar na hora do ritmo** → erro registrado, sem mensagem, worker segue. (Task 2)
4. **Telegram recusa (token errado, Markdown inválido)** → linha com `erro` e `enviado=false`, worker segue. (Task 2)
5. **Descrição com `*`, `_`, `` ` ``, `[`, `]`** → limpa como no n8n, Markdown não quebra. (Task 1)

---

### Task 1: Montagem das mensagens (pura)

**Files:** Create `src/worker/notificacoes/textos.ts`; Test `test/worker/notificacoes-textos.test.ts`

**Interfaces — Produces:**
- `type Bot = 'ritmo' | 'fatura' | 'gasto' | 'saude' | 'backup'`
- `interface Montagem<E> { texto: string | null; estado: E }`
- `montarRitmo(p: PrevisaoApi): string | null` — `PrevisaoApi = { mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number; receitasAReceber: { valor: number }[] }`
- `montarFatura(fats: FaturaAviso[], estado: { alertados: string[] } | null): Montagem<{ alertados: string[] }>` — `FaturaAviso = { banco; responsavel; valor: number; venc: string; venc_iso: string; dias: number }`
- `montarGasto(txs: GastoGrande[], estado: { lastCriadoEm: string } | null): Montagem<{ lastCriadoEm: string }>` — `GastoGrande = { id_transacao; criado_em: string; valor: number; descricao; banco; responsavel; data: string }`
- `montarSaude(s: SaudeDados): string | null` — `SaudeDados = { h_lancamentos: number|null; h_investimentos: number|null; h_faturas: number|null; h_worker_ok: number|null; worker_falhas_24h: number|null; ultimo_lancamento: string|null }`
- `montarBackup(s: BackupDados): string | null` — `BackupDados = { h_desde_ok; h_desde_n8n; n8n_workflows; h_desde_offsite; tamanho; tabelas; falhas_24h; ultimo_erro }` (números ou null; `ultimo_erro` string|null)

- [ ] **Step 1: teste (falha primeiro)** — `test/worker/notificacoes-textos.test.ts` (valores sintéticos):

```ts
import { describe, expect, it } from 'vitest';
import { montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude } from '../../src/worker/notificacoes/textos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ritmo', () => {
  const p = { mesLabel: 'out/26', fechaCom: -100, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 75, receitasAReceber: [{ valor: 300 }] };
  it('acima do que cabe: % e o que entra', () => {
    expect(montarRitmo(p)).toBe([
      '🎯 *Ritmo de hoje*', '', `Da pra gastar *${brl(50)}* hoje.`, `Voce vem gastando ${brl(75)}/dia — *50% acima*.`, '',
      `Nesse ritmo out/26 fecha em *${brl(-100)}*.`, `Faltam 10 dias e ainda entram ${brl(300)}.`,
    ].join('\n'));
  });
  it('dentro do que cabe, sem receita a entrar; último dia não manda nada', () => {
    const t = montarRitmo({ ...p, ritmoAtualDia: 40, receitasAReceber: [] })!;
    expect(t).toContain('— dentro do que cabe.');
    expect(t.endsWith('Faltam 10 dias.')).toBe(true);
    expect(montarRitmo({ ...p, diasRestantes: 0 })).toBeNull();
  });
});

describe('fatura', () => {
  const f = (banco: string, dias: number) => ({ banco, responsavel: 'X', valor: 100, venc: '15/10', venc_iso: '2026-10-15', dias });
  it('avisa uma vez por fatura; o estado guarda as avisadas', () => {
    const r1 = montarFatura([f('B1', 2)], null);
    expect(r1.texto).toBe(`📅 *Vencimento de fatura*\n\n• B1 (X): ${brl(100)} — vence em *2 dias* (15/10)\n\n_Programe o pagamento pra não pagar juros._`);
    expect(r1.estado).toEqual({ alertados: ['B1|X|2026-10-15'] });
    const r2 = montarFatura([f('B1', 1)], r1.estado);
    expect(r2.texto).toBeNull();
    expect(r2.estado).toEqual(r1.estado);
  });
  it('hoje / amanhã; sem faturas nada', () => {
    expect(montarFatura([f('B1', 0)], null).texto).toContain('vence *hoje*');
    expect(montarFatura([f('B1', 1)], null).texto).toContain('vence *amanhã*');
    expect(montarFatura([], { alertados: ['a'] })).toEqual({ texto: null, estado: { alertados: ['a'] } });
  });
});

describe('gasto grande', () => {
  const t = (id: string, criado: string, desc = 'LOJA') => ({ id_transacao: id, criado_em: criado, valor: 600, descricao: desc, banco: 'B', responsavel: 'X', data: '10/10' });
  it('primeira execução só define a marca; depois só os novos; limpa Markdown', () => {
    const r1 = montarGasto([t('a', '2026-10-10T10:00:00')], null);
    expect(r1).toEqual({ texto: null, estado: { lastCriadoEm: '2026-10-10T10:00:00' } });
    const r2 = montarGasto([t('a', '2026-10-10T10:00:00'), t('b', '2026-10-11T09:00:00', 'LOJA *_`[x]')], r1.estado);
    expect(r2.texto).toBe(`💸 *Gasto acima de ${brl(500)}*\n\n• ${brl(600)} — LOJA x (B, X, 10/10)\n\n_Se não reconhece, confira no app do banco._`);
    expect(r2.estado).toEqual({ lastCriadoEm: '2026-10-11T09:00:00' });
    expect(montarGasto([], r2.estado)).toEqual({ texto: null, estado: r2.estado });
  });
});

describe('saúde', () => {
  const ok = { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 5, worker_falhas_24h: 0, ultimo_lancamento: '10/10/2026' };
  it('tudo bem: nada; cada limite vira uma linha; nulos contam como parados', () => {
    expect(montarSaude(ok)).toBeNull();
    const t = montarSaude({ ...ok, h_faturas: 40, h_worker_ok: 20, worker_falhas_24h: 2 })!;
    expect(t).toBe('⚠️ *Alerta de sincronização*\n\nAlgo pode ter parado de atualizar:\n• Faturas: sem atualizar há 40h\n• Ingestão (worker): última rodada completa há 20h\n• Ingestão (worker): 2 rodada(s) com falha nas últimas 24h\n\nÚltimo lançamento: 10/10/2026');
    expect(montarSaude({ ...ok, h_worker_ok: null })).toContain('última rodada completa há —h');
  });
});

describe('backup', () => {
  const ok = { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 20, h_desde_offsite: 10, tamanho: 2097152, tabelas: 30, falhas_24h: 0, ultimo_erro: null };
  it('tudo bem: nada; problemas listados; "nunca" quando nulo', () => {
    expect(montarBackup(ok)).toBeNull();
    const t = montarBackup({ ...ok, h_desde_ok: null, falhas_24h: 1, ultimo_erro: 'disco *cheio*' })!;
    expect(t).toContain('• Postgres (os dados): ultimo OK nunca');
    expect(t).toContain('• 1 falha(s) em 24h — ultima: disco cheio');
    expect(t).toContain('Ultimo bom: 2.00 MB / 30 tabelas, 20 workflows.');
  });
});
```

Run `npx vitest run test/worker/notificacoes-textos.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 2: implementar** — `src/worker/notificacoes/textos.ts`: porta literal dos nós Code dos workflows exportados (Bot 12, 08, 09, 05, 11), trocando `$json`/`$getWorkflowStaticData` por parâmetros e retorno (`{ texto, estado }`). Manter os textos **byte a byte** (inclusive "Da pra", "Voce", "ultimo", "ha", sem acento onde o original não tem; e a barra invertida em `01-financas\backups`). `clean = (s) => String(s ?? '').replace(/[*_`\[\]]/g, '')`. Para o fatura: `novos` = as que não estão em `alertados`; se nenhum novo, devolve o estado intacto; senão `alertados = [...antes, ...novas].slice(-100)`. Para o gasto: `ultimo = max(criado_em dos txs, last)`; primeira execução (`!last`) → texto null com o estado novo.

> Fonte: os 5 JSON exportados do n8n em 11/10/2026 (scratchpad do Claude, fora do repositório — contêm o chat id; não copiar para o repo). O texto de cada `montarX` vem do campo `jsCode` do nó "Monta Mensagem".

- [ ] **Step 3:** PASS. **Step 4: commit** — `feat(notificacoes): mensagens dos 5 bots portadas do n8n (C2)`.

---

### Task 2: Motor, canal e modo

**Files:** Create `src/worker/notificacoes/canal.ts`, `src/worker/notificacoes/motor.ts`; Test `test/worker/notificacoes-motor.test.ts`

**Interfaces:**
- Consumes: `Bot`, `montar*` (Task 1)
- Produces:
  - `interface Canal { enviar(texto: string): Promise<void> }`; `class CanalTelegram implements Canal { constructor(token: string, chatId: string, fetcher = fetch) }` — POST `https://api.telegram.org/bot${token}/sendMessage` `{ chat_id, text, parse_mode: 'Markdown' }`; resposta não-ok → `throw new Error('Telegram HTTP <status>: <description>')` (sem o token na mensagem)
  - `interface RegistroNotif { ultimoEstado(bot: Bot): Promise<unknown | null>; gravar(l: LinhaNotif): Promise<void> }`; `LinhaNotif = { bot: Bot; modo: 'sombra' | 'real'; texto: string | null; enviado: boolean; erro: string | null; estado: unknown | null }`
  - `modoDoBot(bot: Bot, notifReal: string | undefined, temCanal: boolean): 'sombra' | 'real'`
  - `type Fontes = { [b in Bot]: () => Promise<unknown> }`
  - `rodarNotificacao(bot: Bot, d: { fontes: Fontes; registro: RegistroNotif; canal: Canal | null; modo: 'sombra' | 'real' | 'dry-run' }): Promise<{ bot: Bot; modo: string; texto: string | null; enviado: boolean; erro: string | null }>`

Regras de `rodarNotificacao`: lê o estado (exceto em dry-run lê também, mas não grava); busca dados (erro → grava `{texto:null, erro}` e devolve); monta; se `texto` null e estado igual ao anterior → não grava nada; se `texto` null e estado mudou → grava linha `{texto:null, enviado:false}` com o estado novo; se `texto`: em `real` envia pelo canal (erro → `enviado:false, erro`) e grava; em `sombra` grava `enviado:false`; em `dry-run` não grava nem envia.

- [ ] **Step 1: teste (falha primeiro)**:

```ts
import { describe, expect, it } from 'vitest';
import { CanalTelegram } from '../../src/worker/notificacoes/canal';
import { modoDoBot, rodarNotificacao, type LinhaNotif, type RegistroNotif } from '../../src/worker/notificacoes/motor';

function registroFake(inicial: Record<string, unknown> = {}) {
  const linhas: LinhaNotif[] = [];
  const reg: RegistroNotif = {
    async ultimoEstado(bot) { const l = [...linhas].reverse().find((x) => x.bot === bot && x.estado !== null); return l ? l.estado : (inicial[bot] ?? null); },
    async gravar(l) { linhas.push(l); },
  };
  return { reg, linhas };
}
const canalFake = () => { const enviados: string[] = []; return { enviados, canal: { async enviar(t: string) { enviados.push(t); } } }; };
const fat = [{ banco: 'B1', responsavel: 'X', valor: 100, venc: '15/10', venc_iso: '2026-10-15', dias: 2 }];
const fontes = (over: Partial<Record<string, () => Promise<unknown>>> = {}) => ({
  ritmo: async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, receitasAReceber: [] }),
  fatura: async () => fat, gasto: async () => [], saude: async () => ({}), backup: async () => ({}), ...over,
}) as any;

describe('modo por bot', () => {
  it('real só se está na lista e há canal', () => {
    expect(modoDoBot('ritmo', 'ritmo, fatura', true)).toBe('real');
    expect(modoDoBot('gasto', 'ritmo,fatura', true)).toBe('sombra');
    expect(modoDoBot('ritmo', 'ritmo', false)).toBe('sombra');
    expect(modoDoBot('ritmo', undefined, true)).toBe('sombra');
  });
});

describe('motor', () => {
  it('sombra grava sem enviar; o estado da sombra vale quando vira real (não repete o aviso)', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    expect((await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canal, modo: 'sombra' })).enviado).toBe(false);
    expect(linhas).toHaveLength(1);
    expect(enviados).toEqual([]);
    const r = await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canal, modo: 'real' });
    expect(r.texto).toBeNull();
    expect(enviados).toEqual([]);
  });
  it('real envia e grava enviado; Telegram recusando grava o erro e não lança', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    expect((await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canal, modo: 'real' })).enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    const ruim = { async enviar() { throw new Error('Telegram HTTP 400: Bad Request'); } };
    const r = await rodarNotificacao('ritmo', { fontes: fontes(), registro: reg, canal: ruim, modo: 'real' });
    expect(r).toMatchObject({ enviado: false, erro: 'Telegram HTTP 400: Bad Request' });
    expect(linhas.at(-1)).toMatchObject({ enviado: false, erro: 'Telegram HTTP 400: Bad Request' });
  });
  it('fonte falhando (painel fora): grava o erro, sem texto, sem lançar', async () => {
    const { reg, linhas } = registroFake(); const { canal } = canalFake();
    const r = await rodarNotificacao('ritmo', { fontes: fontes({ ritmo: async () => { throw new Error('fetch failed'); } }), registro: reg, canal, modo: 'real' });
    expect(r).toMatchObject({ texto: null, enviado: false, erro: 'fetch failed' });
    expect(linhas).toHaveLength(1);
  });
  it('gasto: primeira execução só grava a marca; dry-run não grava nem envia', async () => {
    const { reg, linhas } = registroFake(); const { canal, enviados } = canalFake();
    const g = fontes({ gasto: async () => [{ id_transacao: 'a', criado_em: '2026-10-10T10:00:00', valor: 600, descricao: 'X', banco: 'B', responsavel: 'Y', data: '10/10' }] });
    await rodarNotificacao('gasto', { fontes: g, registro: reg, canal, modo: 'real' });
    expect(linhas).toEqual([{ bot: 'gasto', modo: 'real', texto: null, enviado: false, erro: null, estado: { lastCriadoEm: '2026-10-10T10:00:00' } }]);
    await rodarNotificacao('fatura', { fontes: fontes(), registro: reg, canal, modo: 'dry-run' });
    expect(linhas).toHaveLength(1);
    expect(enviados).toEqual([]);
  });
});

describe('canal Telegram', () => {
  it('manda Markdown para o chat; erro não expõe o token', async () => {
    const chamadas: any[] = [];
    const ok = new CanalTelegram('TOKEN-FALSO', '123', (async (url: string, init: any) => { chamadas.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ ok: true }) }; }) as any);
    await ok.enviar('oi');
    expect(chamadas[0][1]).toEqual({ chat_id: '123', text: 'oi', parse_mode: 'Markdown' });
    const ruim = new CanalTelegram('TOKEN-FALSO', '123', (async () => ({ ok: false, status: 401, json: async () => ({ description: 'Unauthorized' }) })) as any);
    await expect(ruim.enviar('oi')).rejects.toThrow('Telegram HTTP 401: Unauthorized');
    await ruim.enviar('oi').catch((e) => expect(String(e)).not.toContain('TOKEN-FALSO'));
  });
});
```

Run → FAIL.

- [ ] **Step 2: implementar** `canal.ts` e `motor.ts` conforme as interfaces e regras acima (o `motor` despacha por bot: `ritmo → montarRitmo`, `fatura → montarFatura`, `gasto → montarGasto`, `saude → montarSaude`, `backup → montarBackup`; os sem estado devolvem `estado: null`; "estado mudou" = `JSON.stringify` diferente).

- [ ] **Step 3:** PASS. **Step 4: commit** — `feat(notificacoes): motor com sombra/real e canal Telegram (C2)`.

---

### Task 3: Fontes, registro e migração 008

**Files:** Create `db/migrations/008_notificacoes.sql`, `src/worker/notificacoes/fontes.ts`, `src/worker/notificacoes/registro.ts`; Test `test/integracao/notificacoes.test.ts`

**Interfaces:**
- Consumes: `Fontes`, `RegistroNotif`, `LinhaNotif`, `Bot` (Tasks 1–2)
- Produces: `criarFontes(pool: Pool, urlPrevisao = 'http://finance-dashboard:3000/api/previsao', fetcher = fetch): Fontes`; `class PgRegistroNotif implements RegistroNotif { constructor(pool: Pool) }`

- [ ] **Step 1: teste (falha primeiro)** — `test/integracao/notificacoes.test.ts` (beforeAll: `base.sql`, `001`, `008`; cria `financas_backup` se `base.sql` não tiver — conferir e, se faltar, `CREATE TABLE financas_backup (feito_em timestamptz, ok boolean, n8n_ok boolean, n8n_workflows int, puxado_em timestamptz, tamanho_bytes bigint, tabelas int, erro text)` no próprio teste):

```ts
  it('registro: grava e lê o último estado do bot, em qualquer modo', async () => {
    const reg = new PgRegistroNotif(pool);
    expect(await reg.ultimoEstado('gasto')).toBeNull();
    await reg.gravar({ bot: 'gasto', modo: 'sombra', texto: null, enviado: false, erro: null, estado: { lastCriadoEm: '2040-01-01T00:00:00' } });
    await reg.gravar({ bot: 'gasto', modo: 'real', texto: 'x', enviado: true, erro: null, estado: { lastCriadoEm: '2040-01-02T00:00:00' } });
    await reg.gravar({ bot: 'gasto', modo: 'real', texto: null, enviado: false, erro: 'falhou', estado: null }); // erro sem estado não apaga o estado
    expect(await reg.ultimoEstado('gasto')).toEqual({ lastCriadoEm: '2040-01-02T00:00:00' });
  });
  it('fontes: faturas na janela 0–3 dias e gastos ≥ 500 dos últimos 3 dias', async () => {
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, valor_fatura_atual, data_vencimento) VALUES
      ('fx1','B1','X',100,(now() AT TIME ZONE 'America/Sao_Paulo')::date + 2), ('fx2','B2','X',100,(now() AT TIME ZONE 'America/Sao_Paulo')::date + 9)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, classe, banco, responsavel, criado_em) VALUES
      ('gx1', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 700, 'COMPRA', 'despesa', 'B', 'X', now()),
      ('gx2', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 100, 'PEQUENA', 'despesa', 'B', 'X', now())`);
    const f = criarFontes(pool, 'http://x', (async () => ({ ok: true, json: async () => ({ mesLabel: 'm' }) })) as any);
    expect(((await f.fatura()) as any[]).map((x) => x.banco)).toEqual(['B1']);
    expect(((await f.gasto()) as any[]).map((x) => x.id_transacao)).toEqual(['gx1']);
    expect(await f.ritmo()).toEqual({ mesLabel: 'm' });
    expect(await f.saude()).toHaveProperty('h_lancamentos');
  });
```

Run → FAIL.

- [ ] **Step 2: migração** `db/migrations/008_notificacoes.sql`:

```sql
-- Notificações no worker (C2): o que cada bot mandou (ou mandaria, em sombra) e o estado dele.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_notificacoes (
  id        bigserial PRIMARY KEY,
  bot       text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  modo      text NOT NULL CHECK (modo IN ('sombra', 'real')),
  texto     text,
  enviado   boolean NOT NULL DEFAULT false,
  erro      text,
  estado    jsonb
);
CREATE INDEX IF NOT EXISTS financas_notificacoes_bot_idx ON financas_notificacoes (bot, id DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT, INSERT ON financas_notificacoes TO pluggy_worker;
    GRANT USAGE, SELECT ON SEQUENCE financas_notificacoes_id_seq TO pluggy_worker;
    IF to_regclass('financas_backup') IS NOT NULL THEN GRANT SELECT ON financas_backup TO pluggy_worker; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_notificacoes TO bot_readonly;
  END IF;
END $$;
COMMIT;
```

- [ ] **Step 3: `registro.ts`**: `ultimoEstado` = `SELECT estado FROM financas_notificacoes WHERE bot=$1 AND estado IS NOT NULL ORDER BY id DESC LIMIT 1`; `gravar` = INSERT. **`fontes.ts`**: as 4 consultas copiadas dos nós Postgres (Bot 08, 09, 05, 11 — o `json_agg`/`json_build_object` devolvem `faturas`/`txs`/`saude`/`st`; a fonte devolve o conteúdo), e `ritmo` = `fetcher(urlPrevisao)` → `json()` (não-ok → `throw new Error('painel HTTP <status>')`).

- [ ] **Step 4:** integração → PASS. **Step 5: commit** — `feat(notificacoes): fontes, registro e migracao 008 (C2)`.

---

### Task 4: Ligar no worker

**Files:** Modify `src/worker/cli.ts`, `src/worker/index.ts`; Test `test/worker/cli.test.ts`

**Interfaces:** Consumes Tasks 1–3. Produces: tarefas de linha de comando `notif-ritmo | notif-fatura | notif-gasto | notif-saude | notif-backup` (com `--dry-run`); `AGENDA_NOTIF: readonly [string, Bot][]`.

- [ ] **Step 1: teste (falha primeiro)** — em `test/worker/cli.test.ts`:

```ts
  it('notificações: aceita notif-<bot> com --dry-run; agenda no horário do n8n', async () => {
    const { lerArgs, AGENDA_NOTIF } = await import('../../src/worker/cli');
    expect(lerArgs(['notif-ritmo', '--dry-run'])).toEqual({ tarefa: 'notif-ritmo', dryRun: true });
    expect(() => lerArgs(['notif-xyz'])).toThrow('tarefa desconhecida');
    expect(AGENDA_NOTIF).toEqual([['0 8 * * *', 'ritmo'], ['0 9 * * *', 'fatura'], ['45 16,22 * * *', 'gasto'], ['30 12 * * *', 'saude'], ['0 10 * * *', 'backup']]);
  });
```

Run → FAIL.

- [ ] **Step 2: implementar**
  - `cli.ts`: `export const AGENDA_NOTIF = [['0 8 * * *','ritmo'],['0 9 * * *','fatura'],['45 16,22 * * *','gasto'],['30 12 * * *','saude'],['0 10 * * *','backup']] as const`; `Args.tarefa` aceita `` `notif-${Bot}` ``; `lerArgs` reconhece `notif-<bot>` para os 5 bots (só `--dry-run` como opção).
  - `index.ts`: montar `const notif = { fontes: criarFontes(pool), registro: new PgRegistroNotif(pool), canal }` com `canal = TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? new CanalTelegram(...) : null` (log "notificações em sombra: sem Telegram" se null); no `agendar`, para cada `[expr, bot]` de `AGENDA_NOTIF`, um `Cron` (mesmo `TZ`, `protect: true`) que chama `rodarNotificacao(bot, { ...notif, modo: modoDoBot(bot, process.env.NOTIF_REAL, !!canal) })` dentro de `try/catch` e loga `notif-<bot> <modo> enviado=<b>[ erro=...]`; na CLI `notif-<bot>`, roda com `modo: args.dryRun ? 'dry-run' : modoDoBot(...)` e imprime o resultado (texto incluído).
  - O pool do worker continua `max: 3`; as notificações rodam em horários fora da ingestão (8h, 9h, 10h, 12h30) exceto o gasto (16h45/22h45, depois da ingestão das 16h05–16h35).

- [ ] **Step 3:** `npx vitest run test/worker` → PASS; `npm run build:worker` ok; `tsc`. **Step 4: commit** — `feat(notificacoes): tarefas agendadas no worker (C2)`.

---

### Task 5: Produção — sombra e virada

- [ ] Suíte com integração, `tsc`, `build:worker`; varredura (token/chat id/valores) no diff e nas mensagens; revisão final independente.
- [ ] Produção (fora de 16h–16h40 e 22h–22h40): migração 008; worker com `docker tag finance-worker:1 finance-worker:pre-c2`, build `--target worker`, recriar **sem** `TELEGRAM_*` e sem `NOTIF_REAL` (tudo em sombra); `docker exec finance-worker node worker.js notif-<bot> --dry-run` para os 5 (texto impresso, nada gravado).
- [ ] Entregar ao Matheus o script `scripts/c2-telegram-env.sh` (no repo, sem segredo): pede o token e o chat id com `read -s`, grava em `/root/n8n-docker/.env.worker-telegram` (chmod 600) e mostra como referenciar no compose (`env_file`). Ele roda; Claude confere só a presença das variáveis (`printenv | grep -c TELEGRAM_`), nunca o valor.
- [ ] 2 dias de sombra: comparar `financas_notificacoes` (sombra) com as execuções do n8n (SQLite do n8n copiado com `-wal`/`-shm`, lido com `python3` na VPS: texto enviado pelo nó Telegram de cada workflow nas mesmas datas). Registrar a comparação no ledger.
- [ ] Troca, um bot por vez (skill `mexer-n8n`): export com nome único com timestamp, conferir o `id`, `update:workflow --id=<id> --active=false`, `docker restart n8n_financeiro` fora das janelas; incluir o bot em `NOTIF_REAL` e recriar o worker fora das janelas; conferir a primeira linha `modo='real' AND enviado` do bot.
- [ ] Push e PR com base `feat/f4b-trilha-ajustes`; roadmap no vault.
