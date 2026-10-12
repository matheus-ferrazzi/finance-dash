// Canal WhatsApp (D): Evolution API na rede interna da VPS. Só envio de texto.
import type { Canal } from './canal';

type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  ok: boolean; status?: number; json: () => Promise<any>;
}>;

export class CanalWhatsApp implements Canal {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instancia: string,
    private readonly destino: string,
    private readonly fetcher: Fetcher = fetch as unknown as Fetcher,
  ) {}

  /** A chave nunca aparece em mensagem de erro (vai parar no log e na tabela). */
  private semChave(s: string): string {
    return this.apiKey ? s.split(this.apiKey).join('***') : s;
  }

  async enviar(texto: string): Promise<void> {
    let r;
    try {
      r = await this.fetcher(`${this.baseUrl}/message/sendText/${this.instancia}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
        body: JSON.stringify({ number: this.destino, text: texto }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new Error(this.semChave(`WhatsApp: ${e instanceof Error ? e.message : String(e)}`));
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const m = j?.response?.message ?? j?.message ?? 'erro';
      throw new Error(this.semChave(`WhatsApp HTTP ${r.status}: ${Array.isArray(m) ? m.join('; ') : String(m)}`));
    }
  }
}
