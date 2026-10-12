import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { criarServidor } from '../../src/worker/bot/servidor';

let s: Server | null = null;
afterEach(() => new Promise<void>((r) => (s ? s.close(() => r()) : r())));
const subir = async (aoReceber: (c: unknown) => void) => {
  s = criarServidor('TOKEN-FALSO', aoReceber);
  await new Promise<void>((r) => s!.listen(0, '127.0.0.1', () => r()));
  return `http://127.0.0.1:${(s!.address() as any).port}`;
};

describe('servidor do webhook', () => {
  it('token certo: 200 e entrega o JSON; token errado: 403 e nada entregue', async () => {
    const recebidos: unknown[] = [];
    const u = await subir((c) => recebidos.push(c));
    expect((await fetch(`${u}/whatsapp?t=errado`, { method: 'POST', body: '{"a":1}' })).status).toBe(403);
    expect((await fetch(`${u}/whatsapp?t=TOKEN-FALSO`, { method: 'POST', body: '{"a":1}' })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(recebidos).toEqual([{ a: 1 }]);
  });
  it('corpo inválido: 200 sem entregar; /saude: 200; outra rota: 404', async () => {
    const recebidos: unknown[] = [];
    const u = await subir((c) => recebidos.push(c));
    expect((await fetch(`${u}/whatsapp?t=TOKEN-FALSO`, { method: 'POST', body: 'xx' })).status).toBe(200);
    expect((await fetch(`${u}/saude`)).status).toBe(200);
    expect((await fetch(`${u}/outra`)).status).toBe(404);
    expect(recebidos).toEqual([]);
  });
});

describe('servidor: requisição mal formada (revisão E1)', () => {
  it('alvo de URL inválido não derruba o processo: 400 e o servidor segue de pé', async () => {
    const u = await subir(() => {});
    const porta = Number(new URL(u).port);
    const net = await import('node:net');
    const resposta = await new Promise<string>((ok) => {
      const c = net.connect(porta, '127.0.0.1', () => c.write('POST //x:99999 HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\n\r\n'));
      let b = ''; c.on('data', (d) => { b += d; c.end(); }); c.on('close', () => ok(b)); c.on('error', () => ok(b));
    });
    expect(resposta).toMatch(/^HTTP\/1\.1 400/);
    expect((await fetch(`${u}/saude`)).status).toBe(200);
  });
});
