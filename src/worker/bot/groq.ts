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
