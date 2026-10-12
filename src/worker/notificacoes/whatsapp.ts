// Canal WhatsApp (D): Evolution API na rede interna da VPS. Envio de texto e de imagem (D2).
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
}
