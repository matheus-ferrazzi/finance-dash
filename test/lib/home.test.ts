import { describe, expect, it } from 'vitest';
import { cartaoDestaque, contasResumo, topGrupos } from '../../src/lib/home';

describe('blocos da home', () => {
  it('topGrupos: 3 maiores com % sobre o total', () => {
    const g = [['A', 50], ['B', 30], ['C', 15], ['D', 5]].map(([nome, total]) => ({ nome, emoji: '', total, travado: false, pctRenda: 0 })) as any;
    expect(topGrupos(g)).toEqual([{ nome: 'A', total: 50, pct: 50 }, { nome: 'B', total: 30, pct: 30 }, { nome: 'C', total: 15, pct: 15 }]);
    expect(topGrupos([])).toEqual([]);
  });

  it('cartaoDestaque: maior uso do limite; "a pagar" = o que falta das faturas fechadas (N4), não o limite usado; null sem cartão', () => {
    const ult = (situacao: any, falta: number) => ({ total: 100, pago: 0, parcelado: 0, vencimento: '2026-10-20', situacao, falta });
    const f = (banco: string, usado: number, limite: number, disponivel: number, ultima: any) =>
      ({ id: banco, banco, responsavel: 'Ariane', usado, limite, disponivel, fechamento: null, ultima });
    expect(cartaoDestaque([f('X', 100, 1000, 900, ult('a_vencer', 70)), f('Y', 160, 200, 40, ult('parcelada', 0))]))
      .toEqual({ banco: 'Y', responsavel: 'Ariane', usoPct: 80, aPagar: 70 });
    expect(cartaoDestaque([f('Z', 10, 0, 0, null)])).toEqual({ banco: 'Z', responsavel: 'Ariane', usoPct: 0, aPagar: 0 });
    expect(cartaoDestaque([])).toBeNull();
  });

  it('contasResumo: pagas pelo banco, total e quanto falta; null sem contas', () => {
    const i = (status: string, previsto: number, pago: number | null) => ({ status, previsto, pago }) as any;
    expect(contasResumo([i('pago', 100, 100), i('a_confirmar', 50, null), i('falta', 30, null)])).toEqual({ pagas: 1, total: 3, falta: 80 });
    expect(contasResumo([])).toBeNull();
  });
});
