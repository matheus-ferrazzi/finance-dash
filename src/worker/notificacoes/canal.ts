// Canal de envio (C2): Telegram hoje; o D acrescenta o WhatsApp sem mexer nos bots.

export interface Canal {
  enviar(texto: string): Promise<void>;
  /** D2: imagem com legenda (só o WhatsApp); sem isto, o motor manda só o texto */
  enviarImagem?(png: Buffer, legenda: string): Promise<void>;
}

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean; status?: number; json: () => Promise<any>;
}>;

export class CanalTelegram implements Canal {
  constructor(private readonly token: string, private readonly chatId: string, private readonly fetcher: Fetcher = fetch as unknown as Fetcher) {}

  /** O token nunca aparece em mensagem de erro (vai parar no log e na tabela). */
  private semToken(s: string): string {
    return this.token ? s.split(this.token).join('***') : s;
  }

  async enviar(texto: string, markdown = true): Promise<void> {
    let r;
    try {
      r = await this.fetcher(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: texto, ...(markdown ? { parse_mode: 'Markdown' } : {}) }),
        signal: AbortSignal.timeout(15000), // Telegram que não responde não segura a tarefa por minutos
      });
    } catch (e) {
      throw new Error(this.semToken(`Telegram: ${e instanceof Error ? e.message : String(e)}`));
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const desc = String(j?.description ?? 'erro');
      // D-M8: um _ ou * num nome quebra o Markdown e o Telegram recusa tudo: vai de novo como texto puro
      if (markdown && r.status === 400 && /can't parse entities/i.test(desc)) return this.enviar(texto, false);
      throw new Error(this.semToken(`Telegram HTTP ${r.status}: ${desc}`));
    }
  }
}
