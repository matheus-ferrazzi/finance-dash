import { describe, expect, it } from 'vitest';
import { CanalWhatsApp } from '../../src/worker/notificacoes/whatsapp';

describe('canal WhatsApp', () => {
  it('manda texto para o destino com a chave no cabeçalho; erro não expõe a chave', async () => {
    const chamadas: any[] = [];
    const ok = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'GRUPO@g.us', (async (url: string, init: any) => {
      chamadas.push([url, init.headers.apikey, JSON.parse(init.body)]);
      return { ok: true, json: async () => ({}) };
    }) as any);
    await ok.enviar('oi');
    expect(chamadas[0]).toEqual(['http://evo:8080/message/sendText/financas', 'CHAVE-FALSA', { number: 'GRUPO@g.us', text: 'oi' }]);
    const ruim = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'G', (async () => ({
      ok: false, status: 401, json: async () => ({ response: { message: ['Unauthorized CHAVE-FALSA'] } }),
    })) as any);
    const e = await ruim.enviar('oi').catch((x) => String(x));
    expect(e).toContain('WhatsApp HTTP 401');
    expect(e).not.toContain('CHAVE-FALSA');
    const fora = new CanalWhatsApp('http://evo:8080', 'CHAVE-FALSA', 'financas', 'G', (async () => { throw new Error('connect ECONNREFUSED apikey=CHAVE-FALSA'); }) as any);
    const e2 = await fora.enviar('oi').catch((x) => String(x));
    expect(e2).toContain('WhatsApp:');
    expect(e2).not.toContain('CHAVE-FALSA');
  });
});
