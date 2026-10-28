// E1: cliente da Groq (API compatível com OpenAI). Lista de modelos em ordem: modelo sumido → próximo.
// 28/10 (fase 2): no 429 espera o tempo pedido e tenta o mesmo modelo; sem cota em até 10 min em nenhum, LimiteGroq.
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers?: { get(nome: string): string | null }; json: () => Promise<any> }>;
export type MsgChat = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: unknown[]; tool_call_id?: string };

const TROCA = new Set([404, 503]);
const ESPERA_MAX_MS = 600_000;
const ESPERA_PADRAO_MS = 20_000;
const ESPERAS_POR_MODELO = 3;
const FOLGA_MS = 1000;
const DIARIO = /per day|\(TPD\)|\(RPD\)/i;

/** Quanto esperar num 429: o "try again in 1m2.5s" da mensagem; senão o retry-after (s); senão 20 s. Mais 1 s de folga. */
export function esperaDoErro(retryAfter: string | null, mensagem: string): number {
  const m = /try again in ([\d.]+ms|(?:\d+h)?(?:\d+m)?(?:[\d.]+s)?)/i.exec(mensagem);
  let ms: number | null = null;
  if (m && m[1]) {
    if (/^[\d.]+ms$/.test(m[1])) ms = Number(m[1].slice(0, -2));
    else {
      const h = /(\d+)h/.exec(m[1]), mi = /(\d+)m(?!s)/.exec(m[1]), se = /([\d.]+)s/.exec(m[1]);
      ms = ((Number(h?.[1] ?? 0) * 60 + Number(mi?.[1] ?? 0)) * 60 + Number(se?.[1] ?? 0)) * 1000;
    }
  }
  if (ms === null || !Number.isFinite(ms) || ms <= 0) {
    const ra = Number(retryAfter);
    ms = retryAfter && Number.isFinite(ra) && ra > 0 ? ra * 1000 : ESPERA_PADRAO_MS;
  }
  return Math.round(ms) + FOLGA_MS;
}

/** Nenhum modelo tem cota em até 10 min (ou só sobrou limite diário): não dá para responder agora. */
export class LimiteGroq extends Error {
  constructor(readonly diario: boolean, readonly esperaMs: number | null, msg = 'Groq: sem cota') { super(msg); this.name = 'LimiteGroq'; }
}

export class ClienteGroq {
  constructor(
    private readonly apiKey: string, private readonly modelos: string[],
    private readonly fetcher: Fetcher = fetch as unknown as Fetcher, private readonly base = 'https://api.groq.com/openai/v1',
    private readonly dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private semChave(s: string) { return this.apiKey ? s.split(this.apiKey).join('***') : s; }

  /** 27/10: `tokens` = usage.total_tokens da chamada (0 se o Groq não mandar), para medir o gasto por pergunta */
  async chat(msgs: MsgChat[], tools: object[], opcoes: { aoEsperar?: (ms: number) => void } = {}): Promise<{ content: string | null; toolCalls: { id: string; nome: string; args: string }[]; modelo: string; tokens: number }> {
    let ultimo = 'sem modelo';
    const limites: { diario: boolean; ms: number }[] = [];
    for (let i = 0, esperas = 0; i < this.modelos.length; ) {
      const modelo = this.modelos[i];
      const proximo = () => { i++; esperas = 0; };
      let r;
      try {
        r = await this.fetcher(`${this.base}/chat/completions`, {
          method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: modelo, messages: msgs, ...(tools.length ? { tools, tool_choice: 'auto' } : {}), temperature: 0.2 }),
          signal: AbortSignal.timeout(20000),
        });
      } catch (e) {
        ultimo = `${modelo}: ${e instanceof Error ? e.message : String(e)}`;
        proximo();
        continue;
      }
      if (r.ok) {
        const j = await r.json();
        const m = j?.choices?.[0]?.message ?? {};
        return {
          content: m.content ?? null, modelo, tokens: Number(j?.usage?.total_tokens) || 0,
          toolCalls: (m.tool_calls ?? []).map((t: any) => ({ id: t.id, nome: t.function?.name, args: t.function?.arguments ?? '{}' })),
        };
      }
      const j = await r.json().catch(() => ({}));
      ultimo = `${modelo}: HTTP ${r.status} ${j?.error?.code ?? ''} ${j?.error?.message ?? ''}`.trim();
      if (r.status === 429) {
        const texto = String(j?.error?.message ?? '');
        const ms = esperaDoErro(r.headers?.get('retry-after') ?? null, texto);
        const diario = DIARIO.test(texto);
        if (diario || ms > ESPERA_MAX_MS) { limites.push({ diario, ms }); proximo(); continue; }
        if (esperas >= ESPERAS_POR_MODELO) { limites.push({ diario: false, ms }); proximo(); continue; }
        esperas++;
        opcoes.aoEsperar?.(ms);
        await this.dormir(ms);
        continue;
      }
      const deModelo = /model/i.test(`${j?.error?.code ?? ''} ${j?.error?.message ?? ''}`);
      if (!(TROCA.has(r.status) || (r.status === 400 && deModelo))) break;
      proximo();
    }
    if (limites.length) {
      const diario = limites.every((l) => l.diario);
      throw new LimiteGroq(diario, Math.min(...limites.map((l) => l.ms)), this.semChave(`Groq: sem cota (${ultimo})`));
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
