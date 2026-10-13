import { describe, expect, it } from 'vitest';
import { estadoDaSessao, vigiarWhatsApp } from '../../src/worker/notificacoes/vigia';

// Onda 2 / S1 (auditoria 13/10): o aviso técnico sai pelo próprio WhatsApp — se a sessão cai, ninguém fica sabendo.
// O vigia pergunta o estado à Evolution e avisa por OUTRO canal (Telegram).
const tg = () => { const enviados: string[] = []; return { enviados, canal: { enviar: async (t: string) => { enviados.push(t); } } }; };

describe('vigia da sessão do WhatsApp', () => {
  it('sessão aberta: nada enviado', async () => {
    const t = tg();
    expect(await vigiarWhatsApp(async () => 'open', t.canal)).toBe('open');
    expect(t.enviados).toEqual([]);
  });
  it('sessão fechada: avisa no Telegram com o estado e o que fazer', async () => {
    const t = tg();
    expect(await vigiarWhatsApp(async () => 'close', t.canal)).toBe('close');
    expect(t.enviados[0]).toContain('⚠️ A sessão do WhatsApp do Finanças não está conectada (estado: close)');
    expect(t.enviados[0]).toContain('d-whatsapp-conectar.sh');
  });
  it('Evolution fora do ar: avisa também (com o erro, sem chave)', async () => {
    const t = tg();
    expect(await vigiarWhatsApp(async () => { throw new Error('fetch failed'); }, t.canal)).toBe('erro');
    expect(t.enviados[0]).toContain('estado: erro — fetch failed');
  });
  it('sem Telegram: só devolve o estado (o log registra)', async () => {
    expect(await vigiarWhatsApp(async () => 'close', null)).toBe('close');
  });
});

describe('estado da sessão na Evolution', () => {
  it('GET /instance/connectionState/<instância> com a chave no cabeçalho; lê instance.state', async () => {
    const chamadas: any[] = [];
    const f = async (url: string, init: any) => { chamadas.push([url, init.headers.apikey, init.method]); return { ok: true, json: async () => ({ instance: { instanceName: 'fin', state: 'open' } }) }; };
    expect(await estadoDaSessao('http://evo:8080', 'K', 'fin', f as any)).toBe('open');
    expect(chamadas).toEqual([['http://evo:8080/instance/connectionState/fin', 'K', 'GET']]);
  });
  it('HTTP de erro: lança sem a chave no texto', async () => {
    const f = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await expect(estadoDaSessao('http://evo:8080', 'SEGREDO', 'fin', f as any)).rejects.toThrow(/^Evolution HTTP 401$/);
  });
});
