import { describe, expect, it } from 'vitest';
import { ClienteGroq } from '../../src/worker/bot/groq';

const resp = (status: number, json: unknown) => ({ ok: status < 400, status, json: async () => json });
const okChat = { choices: [{ message: { content: 'oi', tool_calls: [{ id: 'c1', function: { name: 'trilha', arguments: '{}' } }] } }] };

describe('ClienteGroq', () => {
  it('usa o primeiro modelo; devolve conteúdo e chamadas', async () => {
    const corpos: any[] = [];
    const g = new ClienteGroq('K-FALSA', ['m1', 'm2'], (async (_u: string, i: any) => { corpos.push(JSON.parse(i.body)); return resp(200, okChat); }) as any);
    expect(await g.chat([{ role: 'user', content: 'x' }], [])).toEqual({ content: 'oi', toolCalls: [{ id: 'c1', nome: 'trilha', args: '{}' }], modelo: 'm1', tokens: 0 });
    expect(corpos[0].model).toBe('m1');
  });
  it('27/10: devolve os tokens do usage; sem usage, 0', async () => {
    const com = new ClienteGroq('K', ['m1'], (async () => resp(200, { ...okChat, usage: { total_tokens: 1234 } })) as any);
    expect((await com.chat([], [])).tokens).toBe(1234);
    const sem = new ClienteGroq('K', ['m1'], (async () => resp(200, okChat)) as any);
    expect((await sem.chat([], [])).tokens).toBe(0);
  });
  it('modelo descontinuado (404/400 de modelo/503): tenta o próximo', async () => {
    const vistos: string[] = [];
    const g = new ClienteGroq('K', ['velho', 'novo'], (async (_u: string, i: any) => {
      const m = JSON.parse(i.body).model; vistos.push(m);
      return m === 'velho' ? resp(400, { error: { code: 'model_decommissioned', message: 'gone' } }) : resp(200, okChat);
    }) as any);
    expect((await g.chat([], [])).modelo).toBe('novo');
    expect(vistos).toEqual(['velho', 'novo']);
  });
  it('todos falham: erro sem a chave', async () => {
    const g = new ClienteGroq('K-FALSA', ['a'], (async () => resp(503, { error: { message: 'K-FALSA indisponível' } })) as any);
    await expect(g.chat([], [])).rejects.toThrow(/Groq/);
    await expect(g.chat([], [])).rejects.not.toThrow(/K-FALSA/);
  });
  it('modelosSumidos: os da lista que não estão em /models', async () => {
    const g = new ClienteGroq('K', ['a', 'b'], (async () => resp(200, { data: [{ id: 'a' }] })) as any);
    expect(await g.modelosSumidos()).toEqual(['b']);
  });
});
