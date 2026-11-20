import { describe, expect, it } from 'vitest';
import { lerSaldoServerspace } from '../../src/worker/serverspace';

// 20/11: a VPS saiu da Hostinger para a Serverspace, que cobra por hora de um crédito pré-pago: sem saldo, a máquina
// para. O worker lê o saldo do projeto para o aviso técnico. Valores inventados.
const resposta = (status: number, corpo: unknown) => async (url: string, init?: any) => {
  resposta.ultima = { url, init };
  return { ok: status >= 200 && status < 300, status, json: async () => corpo } as any;
};
resposta.ultima = null as any;

describe('lerSaldoServerspace', () => {
  it('lê saldo e moeda do projeto, mandando a chave no cabeçalho X-API-KEY', async () => {
    const f = resposta(200, { project: { id: 1, balance: 37.5, currency: 'BRL', state: 'Active' } });
    expect(await lerSaldoServerspace({ url: 'https://api.exemplo.test', chave: 'chave-falsa', fetcher: f })).toEqual({ saldo: 37.5, moeda: 'BRL' });
    expect(resposta.ultima.url).toBe('https://api.exemplo.test/api/v1/project');
    expect(resposta.ultima.init.headers['X-API-KEY']).toBe('chave-falsa');
  });
  it('erro HTTP vira exceção com o status (401 = chave recusada)', async () => {
    await expect(lerSaldoServerspace({ url: 'https://x.test', chave: 'k', fetcher: resposta(401, {}) })).rejects.toThrow('HTTP 401');
  });
  it('resposta sem saldo numérico vira exceção, não saldo zero', async () => {
    await expect(lerSaldoServerspace({ url: 'https://x.test', chave: 'k', fetcher: resposta(200, { project: { currency: 'BRL' } }) })).rejects.toThrow('sem saldo');
  });
});
