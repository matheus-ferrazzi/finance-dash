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
