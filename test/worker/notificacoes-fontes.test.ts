import { describe, expect, it } from 'vitest';
import { criarFontes } from '../../src/worker/notificacoes/fontes';

// Auditoria 13/10 (D): as rotas /api/resumo/* exigem o token interno quando configurado
describe('fontes do painel com o token interno', () => {
  it('com token: cabeçalho x-interno em cada chamada ao painel; sem token: sem cabeçalho', async () => {
    const vistos: any[] = [];
    const f = async (_u: string, init: any) => { vistos.push(init?.headers ?? {}); return { ok: true, json: async () => ({}) }; };
    await criarFontes({} as any, 'http://painel', f as any, undefined, 'tok').diario();
    await criarFontes({} as any, 'http://painel', f as any).diario();
    expect(vistos).toEqual([{ 'x-interno': 'tok' }, {}]);
  });
});
