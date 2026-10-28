import { describe, expect, it } from 'vitest';
import { ClienteGroq, esperaDoErro, LimiteGroq } from '../../src/worker/bot/groq';

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

// 28/10 (fase 2): no 429 o Zeca espera a cota em vez de cair para o próximo modelo e falhar
describe('esperaDoErro', () => {
  it('lê o "try again in" da mensagem (s, m+s, ms) com 1 s de folga', () => {
    expect(esperaDoErro(null, 'Rate limit reached ... Please try again in 7.5s.')).toBe(8500);
    expect(esperaDoErro(null, 'Please try again in 1m2.5s.')).toBe(63500);
    expect(esperaDoErro(null, 'Please try again in 450ms.')).toBe(1450);
  });
  it('sem mensagem legível: retry-after em segundos; sem nada: 20 s', () => {
    expect(esperaDoErro('12', 'rate limited')).toBe(13000);
    expect(esperaDoErro(null, 'rate limited')).toBe(21000);
  });
});

const r429 = (msg: string, ra: string | null = null) => ({
  ok: false, status: 429, headers: { get: (n: string) => (n === 'retry-after' ? ra : null) },
  json: async () => ({ error: { code: 'rate_limit_exceeded', message: msg } }),
});

describe('ClienteGroq: 429', () => {
  it('por minuto: espera o tempo pedido, avisa e tenta o MESMO modelo', async () => {
    const vistos: string[] = []; const dormidas: number[] = []; const avisos: number[] = [];
    const seq: any[] = [r429('Please try again in 7.5s. (TPM)'), resp(200, okChat)];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => { vistos.push(JSON.parse(i.body).model); return seq.shift(); }) as any,
      undefined, async (ms) => { dormidas.push(ms); });
    expect((await g.chat([], [], { aoEsperar: (ms) => avisos.push(ms) })).modelo).toBe('m1');
    expect([vistos, dormidas, avisos]).toEqual([['m1', 'm1'], [8500], [8500]]);
  });
  it('3 esperas no mesmo modelo sem cota: passa ao próximo', async () => {
    const vistos: string[] = [];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => {
      const m = JSON.parse(i.body).model; vistos.push(m); return m === 'm1' ? r429('try again in 2s') : resp(200, okChat);
    }) as any, undefined, async () => {});
    expect((await g.chat([], [])).modelo).toBe('m2');
    expect(vistos).toEqual(['m1', 'm1', 'm1', 'm1', 'm2']);
  });
  it('limite diário: não espera, vai ao próximo; nenhum sobra → LimiteGroq diário com o tempo', async () => {
    const dormidas: number[] = [];
    const g = new ClienteGroq('K-FALSA', ['m1', 'm2'], (async () => r429('Limit 200000 tokens per day (TPD) K-FALSA. Please try again in 30m0s.')) as any,
      undefined, async (ms) => { dormidas.push(ms); });
    const e = await g.chat([], []).catch((x) => x);
    expect(e).toBeInstanceOf(LimiteGroq);
    expect([e.diario, e.esperaMs, dormidas]).toEqual([true, 1_801_000, []]);
    expect(e.message).not.toMatch(/K-FALSA/);
  });
  it('espera acima de 10 min: LimiteGroq não diário', async () => {
    const g = new ClienteGroq('K', ['m1'], (async () => r429('try again in 12m0s')) as any, undefined, async () => {});
    const e = await g.chat([], []).catch((x) => x);
    expect([e instanceof LimiteGroq, e.diario, e.esperaMs]).toEqual([true, false, 721_000]);
  });
  it('revisão: a soma das esperas na mesma chamada também respeita os 10 min', async () => {
    const dormidas: number[] = [];
    const g = new ClienteGroq('K', ['m1'], (async () => r429('try again in 4m0s')) as any, undefined, async (ms) => { dormidas.push(ms); });
    const e = await g.chat([], []).catch((x) => x);
    expect(e).toBeInstanceOf(LimiteGroq);
    expect(dormidas).toEqual([241000, 241000]);
  });
  it('503 e erro de rede continuam indo ao próximo sem dormir', async () => {
    const dormidas: number[] = [];
    const seq: any[] = [resp(503, {}), resp(200, okChat)];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async () => seq.shift()) as any, undefined, async (ms) => { dormidas.push(ms); });
    expect((await g.chat([], [])).modelo).toBe('m2');
    const g2 = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => {
      if (JSON.parse(i.body).model === 'm1') throw new Error('rede caiu'); return resp(200, okChat);
    }) as any, undefined, async (ms) => { dormidas.push(ms); });
    expect((await g2.chat([], [])).modelo).toBe('m2');
    expect(dormidas).toEqual([]);
  });
});

// 28/10 (fase 3): o conferente escolhe o modelo da chamada
describe('ClienteGroq: modelos da chamada', () => {
  it('opcoes.modelos troca a lista do construtor', async () => {
    const vistos: string[] = [];
    const g = new ClienteGroq('K', ['m1', 'm2'], (async (_u: string, i: any) => { vistos.push(JSON.parse(i.body).model); return resp(200, okChat); }) as any);
    expect((await g.chat([], [], { modelos: ['m2'] })).modelo).toBe('m2');
    expect(vistos).toEqual(['m2']);
    expect(g.modelosDaLista).toEqual(['m1', 'm2']);
  });
});
