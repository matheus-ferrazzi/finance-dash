// Canal de envio (C2): Telegram hoje; o D acrescenta o WhatsApp sem mexer nos bots.

export interface Canal { enviar(texto: string): Promise<void> }

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean; status?: number; json: () => Promise<any>;
}>;

export class CanalTelegram implements Canal {
  constructor(private readonly token: string, private readonly chatId: string, private readonly fetcher: Fetcher = fetch as unknown as Fetcher) {}

  /** O token nunca aparece em mensagem de erro (vai parar no log e na tabela). */
  private semToken(s: string): string {
    return this.token ? s.split(this.token).join('***') : s;
  }

  async enviar(texto: string): Promise<void> {
    let r;
    try {
      r = await this.fetcher(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: texto, parse_mode: 'Markdown' }),
      });
    } catch (e) {
      throw new Error(this.semToken(`Telegram: ${e instanceof Error ? e.message : String(e)}`));
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(this.semToken(`Telegram HTTP ${r.status}: ${j?.description ?? 'erro'}`));
    }
  }
}
