# Zeca fase 2 (espera da cota): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quando o Groq devolver 429, o Zeca espera o tempo pedido e tenta de novo, avisa uma vez no grupo se a espera for longa e, se não der, diz claramente que não dá para responder agora.

**Architecture:** a espera mora no `ClienteGroq.chat`. Ele lê quanto esperar, dorme e tenta o mesmo modelo de novo. Quando nenhum modelo tem cota em até 10 min, lança `LimiteGroq`. O cliente avisa cada espera por um callback (`aoEsperar`). O agente soma as esperas e transforma o `LimiteGroq` em texto. O bot manda o "⏳" uma vez por pergunta e grava a espera em `financas_bot_conversas.espera_ms`.

**Tech Stack:** TypeScript, vitest, Postgres (migração 017), Groq (API compatível com OpenAI).

**Spec:** `docs/superpowers/specs/2026-10-27-zeca-analista-design.md`, seção "Fase 2 — Espera".

## Global Constraints

- Groq gratuito: a cota é por modelo (`GROQ_MODELOS=openai/gpt-oss-120b,openai/gpt-oss-20b`).
- O aviso de espera sai uma vez por pergunta, só quando uma espera passa de 10 s (`AVISO_MS = 10_000`).
- Espera acima de 10 min (`ESPERA_MAX_MS = 600_000`) ou limite diário: não espera, avisa que não dá para responder agora.
- A fila continua com uma pergunta por vez e no máximo 5 esperando (`FilaBot`, sem mudança).
- Tom contido nas mensagens, sem gíria técnica. Textos fixados abaixo.
- Os envios agendados não mudam.
- Repo público: nada de dado real nos testes.
- Deploy: `bash scripts/deploy.sh worker --migracao 017`, fora das janelas 16h–16h40, 22h–22h40 e do minuto :09.

## Decisões deste plano (o spec deixou para o construtor)

- **Mesmo modelo, até 3 esperas** (`ESPERAS_POR_MODELO = 3`). Depois disso, ou com limite diário, ou com espera acima de 10 min, passa ao próximo modelo da lista, que tem cota separada. Se nenhum servir, lança `LimiteGroq`. Custo se estiver errado: uma pergunta pode esperar até ~3 min antes de cair para o 20b.
- **Quanto esperar:** primeiro o "try again in …" da mensagem, que é mais preciso; senão o cabeçalho `retry-after` em segundos; senão 20 s (`ESPERA_PADRAO_MS`). Sempre soma 1 s de folga.
- **Limite diário:** a mensagem cita `per day`, `(TPD)` ou `(RPD)`.
- **Textos:**
  - aviso: `⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de N minuto(s).` (N = minutos arredondados para cima, mínimo 1)
  - limite diário: `⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo daqui a cerca de T.` Sem tempo conhecido, termina em `mais tarde.`
  - espera longa: `⚠️ O serviço de respostas está no limite e só libera daqui a cerca de T. Manda a pergunta de novo depois disso.`
  - T = `N minuto(s)` abaixo de 60 min; acima, `N hora(s)` arredondado para cima.

## Review Focus

1. 429 sem `retry-after` e sem "try again in" legível: espera os 20 s padrão, não estoura nem fica parado para sempre.
2. Duas esperas na mesma pergunta (rodada 1 e rodada 3, ou na refeita com todas as ferramentas): um único "⏳", e `esperaMs` soma as duas.
3. Erro que não é 429 (rede, 503, modelo sumido) continua indo ao próximo modelo sem esperar, como hoje.
4. `LimiteGroq` não pode vazar a chave da API na mensagem, igual aos erros de hoje.
5. Pergunta que chega durante a espera fica na fila e é respondida depois. A sexta recebe o aviso de fila cheia, como hoje.

---

### Task 1: espera no cliente do Groq

**Files:**
- Modify: `src/worker/bot/groq.ts`
- Test: `test/worker/bot-groq.test.ts`

**Interfaces:**
- Produces:
  - `export function esperaDoErro(retryAfter: string | null, mensagem: string): number`. Devolve ms com 1 s de folga e usa o padrão quando não acha nada.
  - `export class LimiteGroq extends Error { constructor(readonly diario: boolean, readonly esperaMs: number | null) }`
  - `chat(msgs, tools, opcoes?: { aoEsperar?: (ms: number) => void })`, com o mesmo retorno de hoje.
  - O construtor ganha um quinto parâmetro, `dormir: (ms: number) => Promise<void>`, cujo padrão é `setTimeout`.
  - O tipo `Fetcher` passa a ter `headers?: { get(nome: string): string | null }` na resposta.

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('esperaDoErro', () => {
  it('lê o "try again in" da mensagem (s, m+s, ms) com 1 s de folga', () => {
    expect(esperaDoErro(null, 'Rate limit reached ... Please try again in 7.5s.')).toBe(8500);
    expect(esperaDoErro(null, 'Please try again in 1m2.5s.')).toBe(63500);
    expect(esperaDoErro(null, 'Please try again in 450ms.')).toBe(1450);
  });
  it('sem mensagem legível: retry-after em segundos; sem nada: 20 s', () => {
    expect(esperaDoErro('12', 'rate limited')).toBe(13000);
    expect(esperaDoErro(null, 'rate limited')).toBe(21000);
  });
});

// helper: respostas em sequência, com cabeçalho
const r429 = (msg: string, ra: string | null = null) => ({ ok: false, status: 429, headers: { get: (n: string) => (n === 'retry-after' ? ra : null) }, json: async () => ({ error: { code: 'rate_limit_exceeded', message: msg } }) });

describe('ClienteGroq: 429', () => {
  it('por minuto: espera o tempo pedido, avisa e tenta o MESMO modelo', async () => {
    const vistos: string[] = []; const dormidas: number[] = []; const avisos: number[] = [];
    const seq = [r429('Please try again in 7.5s. (TPM)'), resp(200, okChat)];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => { vistos.push(JSON.parse(i.body).model); return seq.shift(); }) as any,
      undefined, async (ms) => { dormidas.push(ms); });
    expect((await g.chat([], [], { aoEsperar: (ms) => avisos.push(ms) })).modelo).toBe('m1');
    expect([vistos, dormidas, avisos]).toEqual([['m1', 'm1'], [8500], [8500]]);
  });
  it('3 esperas no mesmo modelo sem cota: passa ao próximo', async () => {
    const vistos: string[] = [];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => { const m = JSON.parse(i.body).model; vistos.push(m); return m === 'm1' ? r429('try again in 2s') : resp(200, okChat); }) as any,
      undefined, async () => {});
    expect((await g.chat([], [])).modelo).toBe('m2');
    expect(vistos).toEqual(['m1', 'm1', 'm1', 'm1', 'm2']);
  });
  it('limite diário: não espera, vai ao próximo; nenhum sobra → LimiteGroq diário com o tempo', async () => {
    const dormidas: number[] = [];
    const g = new ClienteGroq('K-FALSA', ['m1', 'm2'], (async () => r429('Limit 200000 tokens per day (TPD) K-FALSA. Please try again in 30m0s.')) as any,
      undefined, async (ms) => { dormidas.push(ms); });
    const e = await g.chat([], []).catch((x) => x);
    expect(e).toBeInstanceOf(LimiteGroq);
    expect([e.diario, e.esperaMs, dormidas]).toEqual([true, 1_801_000, []]);
    expect(e.message).not.toMatch(/K-FALSA/);
  });
  it('espera acima de 10 min: LimiteGroq não diário', async () => {
    const g = new ClienteGroq('K', ['m1'], (async () => r429('try again in 12m0s')) as any, undefined, async () => {});
    const e = await g.chat([], []).catch((x) => x);
    expect([e instanceof LimiteGroq, e.diario, e.esperaMs]).toEqual([true, false, 721_000]);
  });
  it('503 e erro de rede continuam indo ao próximo sem dormir', async () => {
    const dormidas: number[] = [];
    const seq = [resp(503, {}), resp(200, okChat)];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async () => seq.shift()) as any, undefined, async (ms) => { dormidas.push(ms); });
    expect((await g.chat([], [])).modelo).toBe('m2');
    expect(dormidas).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-groq.test.ts`
Expected: FAIL. `esperaDoErro` e `LimiteGroq` não existem.

- [ ] **Step 3: Implementar em `src/worker/bot/groq.ts`**

O 429 sai do conjunto `TROCA` e passa a ter um tratamento próprio dentro do laço de modelos:
- Limite diário, ou espera acima de `ESPERA_MAX_MS`: guarda `{diario, esperaMs}` para o `LimiteGroq` e passa ao próximo modelo.
- Senão, se ainda houver esperas para esse modelo: chama `aoEsperar(ms)`, depois `dormir(ms)`, e repete o mesmo modelo.
- Senão: próximo modelo.

Quando os modelos acabam e algum deles deu 429 de limite, lança `LimiteGroq`. Escolhe o menor `esperaMs` e marca `diario` só se todos foram diários. A mensagem passa por `semChave`. Nos outros casos, mantém o `throw new Error('Groq: …')` de hoje.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/worker/bot-groq.test.ts`
Expected: PASS, todos, inclusive os antigos.

- [ ] **Step 5: Commit**

`feat(zeca): espera o tempo pedido no 429 e tenta o mesmo modelo (fase 2)`

---

### Task 2: o agente soma a espera e explica o limite

**Files:**
- Modify: `src/worker/bot/agente.ts`
- Test: `test/worker/bot-agente.test.ts`

**Interfaces:**
- Consumes: `LimiteGroq` e `chat(..., { aoEsperar })` da Task 1.
- Produces:
  - `RespostaBot.esperaMs: number`, a soma de todas as esperas da pergunta, inclusive a da refeita.
  - `DepsResponder.aoEsperar?: (ms: number) => void`, repassado a cada `chat`.
  - `export function textoLimite(e: LimiteGroq): string` e `export function textoEspera(ms: number): string`, com os textos da seção de decisões.

- [ ] **Step 1: Escrever os testes que falham**

```ts
it('fase 2: esperas de várias rodadas somam em esperaMs e cada uma chega ao aoEsperar', async () => {
  // fake: rodada 1 chama aoEsperar(15000) e pede ferramenta; rodada 2 chama aoEsperar(5000) e responde
  // espera: r.esperaMs === 20000; avisos === [15000, 5000]
});
it('fase 2: LimiteGroq vira o texto do limite, com erro registrado e sem a refeita', async () => {
  // fake lança new LimiteGroq(true, 1_801_000) → r.texto === textoLimite(...) contém "limite diário" e "31 minutos";
  // r.erro começa com 'limite do Groq'; chat chamado 1 vez
});
it('textoEspera e textoLimite', () => {
  expect(textoEspera(15_000)).toBe('⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de 1 minuto.');
  expect(textoEspera(150_000)).toBe('⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de 3 minutos.');
  expect(textoLimite(new LimiteGroq(false, 721_000))).toBe('⚠️ O serviço de respostas está no limite e só libera daqui a cerca de 13 minutos. Manda a pergunta de novo depois disso.');
  expect(textoLimite(new LimiteGroq(true, 7_200_000))).toBe('⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo daqui a cerca de 2 horas.');
  expect(textoLimite(new LimiteGroq(true, null))).toBe('⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo mais tarde.');
});
```

Os dois primeiros seguem o estilo dos fakes de Groq que já existem em `bot-agente.test.ts`. O fake recebe `(msgs, tools, opcoes)` e chama `opcoes?.aoEsperar?.(ms)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-agente.test.ts`
Expected: FAIL. `esperaMs` vem undefined e `textoEspera`/`textoLimite` não existem.

- [ ] **Step 3: Implementar em `src/worker/bot/agente.ts`**

- Em `tentar`: passa `{ aoEsperar: (ms) => { esperaMs += ms; d.aoEsperar?.(ms); } }` ao `chat`.
- No `catch`: se `e instanceof LimiteGroq`, devolve `fimCom(textoLimite(e), { erro: \`limite do Groq (${e.diario ? 'diário' : 'por minuto'})\`, svg: null })`.
- Em `responder`: soma `esperaMs` como já soma `tokens`. Um resultado com erro de limite não tem `semFerramenta`, então não dispara a refeita.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/worker/bot-agente.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`feat(zeca): soma a espera e explica o limite do Groq na resposta (fase 2)`

---

### Task 3: aviso único no grupo e registro da espera

**Files:**
- Create: `db/migrations/017_bot_espera.sql`, com `ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS espera_ms integer NOT NULL DEFAULT 0;` dentro de BEGIN/COMMIT, no formato da 016.
- Modify:
  - `src/worker/bot/bot.ts`
  - `src/worker/bot/registro.ts`: `LinhaBot.esperaMs` e a coluna `espera_ms` no INSERT.
  - `src/worker/index.ts`: o `bot-perguntar` imprime `esperaMs` e mostra cada espera com `console.log`.
- Test:
  - `test/worker/bot-bot.test.ts`
  - `test/integracao/bot-registro.test.ts`: aplica a 017 e grava `esperaMs`.
  - `test/worker/bot-acoes-fluxo.test.ts`, se o tipo exigir.

**Interfaces:**
- Consumes: `DepsResponder.aoEsperar`, `RespostaBot.esperaMs`, `textoEspera` da Task 2.

- [ ] **Step 1: Escrever os testes que falham**

Em `bot-bot.test.ts`, o fake de groq do `montar` passa a aceitar uma lista de esperas por chamada e chama `opcoes?.aoEsperar?.(ms)` antes de responder.

```ts
it('fase 2: espera longa → um "⏳" antes da resposta, mesmo com duas esperas; espera gravada', async () => {
  // esperas [15000, 12000] na mesma pergunta
  // enviados === [textoEspera(15000), <resposta>]; gravados[0].esperaMs === 27000
});
it('fase 2: espera curta (≤ 10 s) não avisa, mas grava', async () => {
  // espera [8000] → enviados === [<resposta>]; gravados[0].esperaMs === 8000
});
it('fase 2: o id do "⏳" entra em enviados (o bot não se responde)', async () => { /* bot.enviados.has('R1') */ });
```

No teste de integração, `gravar({...base, esperaMs: 1500})` e um `SELECT espera_ms` devolvendo 1500.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-bot.test.ts`
Expected: FAIL. Nenhum "⏳" é enviado e `esperaMs` não é gravado.

- [ ] **Step 3: Implementar**

- `bot.ts`: por pergunta, um `avisou = false`. Passa `aoEsperar: (ms) => { if (!avisou && ms > AVISO_MS) { avisou = true; void mandar(textoEspera(ms), null).catch(() => {}); } d.log(\`bot: aguardando cota do Groq (${Math.round(ms / 1000)} s)\`); }` ao `responder` e grava `esperaMs: r.esperaMs`.
- `registro.ts`: o INSERT ganha `espera_ms`.
- `index.ts`: o `bot-perguntar` passa `aoEsperar` com um `console.log` e inclui `esperaMs` no JSON.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo passa, com cerca de 775 testes, os 763 de hoje mais os novos.

- [ ] **Step 5: Commit**

`feat(zeca): avisa uma vez no grupo quando espera a cota e registra a espera (fase 2)`

---

### Task 4: deploy e prova em produção

- [ ] **Step 1: Deploy**

Run: `bash scripts/deploy.sh worker --migracao 017`
Expected: os testes passam, a migração é aplicada e o worker sobe saudável.

- [ ] **Step 2: Forçar um 429 real e medir**

Disparar 4 `bot-perguntar` ao mesmo tempo na VPS, com cerca de 2,6 mil tokens cada, contra o limite de 8 mil por minuto:

```bash
for i in 1 2 3 4; do docker exec finance-worker node worker.js bot-perguntar "quanto gastei com mercado mes passado?" & done; wait
```

Expected:
- Pelo menos uma execução mostra a linha de espera e termina com a resposta certa, sem `erro`.
- O JSON dela traz `esperaMs > 0` e o modelo `openai/gpt-oss-120b`.
- Nenhuma termina em `FALHA`.

Se o Groq não der 429, rodar 6 em vez de 4. Se mesmo assim não der, registrar que a prova em produção ficou só no caminho sem espera.

- [ ] **Step 3: Conferir o registro**

`SELECT espera_ms, erro FROM financas_bot_conversas ORDER BY id DESC LIMIT 5`. A coluna existe. O `bot-perguntar` não grava, então o valor aparece na primeira pergunta real do grupo.

- [ ] **Step 4: PR**

Abrir o PR para `main` com os números medidos.
