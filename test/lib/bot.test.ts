import { describe, expect, it } from 'vitest';
import { montarComparar, montarGasto } from '../../src/lib/bot';

const m = (o: Record<string, number>) => new Map(Object.entries(o));

describe('montarGasto', () => {
  it('sem grupo: por grupo do painel, maiores primeiro, total de tudo', () => {
    const r = montarGasto(m({ Groceries: 300, 'Eating out': 100, 'Food delivery': 50 }), null);
    expect(r).toEqual({ total: 450, itens: [{ nome: 'Mercado', valor: 300 }, { nome: 'Comer fora', valor: 150 }] });
  });
  it('com grupo: por categoria só daquele grupo', () => {
    const r = montarGasto(m({ Groceries: 300, 'Eating out': 100, 'Food delivery': 50 }), 'Comer fora');
    expect(r).toEqual({ total: 150, itens: [{ nome: 'Eating out', valor: 100 }, { nome: 'Food delivery', valor: 50 }] });
  });
});

describe('montarComparar', () => {
  it('diferença e % prontos, maiores mudanças primeiro', () => {
    const r = montarComparar(m({ Groceries: 500, 'Eating out': 100 }), m({ Groceries: 400, 'Eating out': 300 }));
    expect(r.totalA).toBe(600); expect(r.totalB).toBe(700);
    expect(r.diferenca).toBe(-100); expect(r.pct).toBe(-14.3);
    expect(r.grupos[0]).toEqual({ nome: 'Comer fora', a: 100, b: 300, diferenca: -200 });
  });
  it('base zero: pct null', () => {
    expect(montarComparar(m({ Groceries: 10 }), m({})).pct).toBeNull();
  });
});
