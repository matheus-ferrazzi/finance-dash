import { describe, expect, it } from 'vitest';
import { cartaoDestaque, contasResumo, topGrupos } from '../../src/lib/home';

describe('blocos da home', () => {
  it('topGrupos: 3 maiores com % sobre o total', () => {
    const g = [['A', 50], ['B', 30], ['C', 15], ['D', 5]].map(([nome, total]) => ({ nome, emoji: '', total, travado: false, pctRenda: 0 })) as any;
    expect(topGrupos(g)).toEqual([{ nome: 'A', total: 50, pct: 50 }, { nome: 'B', total: 30, pct: 30 }, { nome: 'C', total: 15, pct: 15 }]);
    expect(topGrupos([])).toEqual([]);
  });

  it('cartaoDestaque: maior uso do limite; soma das faturas; null sem cartão', () => {
    const f = (banco: string, valor: number, limite: number, disponivel: number) =>
      ({ id: banco, banco, responsavel: 'Ariane', valor, limite, disponivel, vencimento: null, fechamento: null });
    expect(cartaoDestaque([f('X', 100, 1000, 900), f('Y', 50, 200, 40)])).toEqual({ banco: 'Y', usoPct: 80, totalAberto: 150 });
    expect(cartaoDestaque([f('Z', 10, 0, 0)])).toEqual({ banco: 'Z', usoPct: 0, totalAberto: 10 });
    expect(cartaoDestaque([])).toBeNull();
  });

  it('contasResumo: pagas pelo banco, total e quanto falta; null sem contas', () => {
    const i = (status: string, previsto: number, pago: number | null) => ({ status, previsto, pago }) as any;
    expect(contasResumo([i('pago', 100, 100), i('a_confirmar', 50, null), i('falta', 30, null)])).toEqual({ pagas: 1, total: 3, falta: 80 });
    expect(contasResumo([])).toBeNull();
  });
});
