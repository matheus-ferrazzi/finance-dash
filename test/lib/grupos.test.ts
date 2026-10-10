import { describe, expect, it } from 'vitest';
import { agruparGastos, grupoDaCategoria } from '../../src/lib/grupos';

describe('grupoDaCategoria', () => {
  it('categorias que caíam no Resto agora têm grupo', () => {
    expect(grupoDaCategoria('Pet supplies and vet')?.nome).toBe('Pet');
    expect(grupoDaCategoria('Services')?.nome).toBe('Compras');
    expect(grupoDaCategoria('Late payment and overdraft costs')?.nome).toBe('Dívida e seguro');
    expect(grupoDaCategoria('Tax on financial operations')?.nome).toBe('Dívida e seguro');
    expect(grupoDaCategoria('Internet')?.nome).toBe('Lazer e digital');
    expect(grupoDaCategoria('Bookstore')?.nome).toBe('Lazer e digital');
    expect(grupoDaCategoria('Gambling')?.nome).toBe('Lazer e digital');
    expect(grupoDaCategoria('Wellness')?.nome).toBe('Saúde');
  });

  it('Pet não é travado; juros e IOF são', () => {
    expect(grupoDaCategoria('Pet supplies and vet')?.travado).toBe(false);
    expect(grupoDaCategoria('Late payment and overdraft costs')?.travado).toBe(true);
  });

  it('toda categoria de despesa vista em jul–out/2026 tem grupo, menos PIX/transferência vaga', () => {
    const vistas = [
      'Housing', 'Groceries', 'Loans and financing', 'Eating out', 'Food delivery', 'Shopping', 'Digital services',
      'Healthcare', 'Services', 'Telecommunications', 'Insurance', 'Gaming', 'Pharmacy', 'Clothing',
      'Pet supplies and vet', 'Electricity', 'Taxes', 'Bookstore', 'Water', 'Loans', 'Food and drinks', 'Tickets',
      'Late payment and overdraft costs', 'Gas stations', 'Cinema, theater and concerts', 'Internet',
      'Taxi and ride-hailing', 'Parking', 'Bank fees', 'Houseware', 'Transportation', 'Electronics',
      'Tax on financial operations', 'Public transportation', 'Wellness', 'Interests charged',
    ];
    expect(vistas.filter((c) => !grupoDaCategoria(c))).toEqual([]);
    expect(grupoDaCategoria('Transfer - PIX')).toBeNull();
    expect(grupoDaCategoria('Transfers')).toBeNull();
  });
});

describe('agruparGastos', () => {
  it('soma por grupo, joga o sem grupo no Resto e ordena do maior para o menor', () => {
    const porCat = new Map([
      ['Groceries', 500], ['Pet supplies and vet', 300], ['Services', 100], ['Shopping', 50], ['Transfer - PIX', 200],
    ]);
    expect(agruparGastos(porCat, 1000)).toEqual([
      { nome: 'Mercado', emoji: '🛒', total: 500, travado: false, pctRenda: 50 },
      { nome: 'Pet', emoji: '🐾', total: 300, travado: false, pctRenda: 30 },
      { nome: 'Resto', emoji: '❓', total: 200, travado: false, pctRenda: 20 },
      { nome: 'Compras', emoji: '🛍️', total: 150, travado: false, pctRenda: 15 },
    ]);
  });

  it('renda zero não divide por zero', () => {
    expect(agruparGastos(new Map([['Groceries', 10]]), 0)[0].pctRenda).toBe(0);
  });
});

describe('consórcio', () => {
  it('entra em Dívida e seguro (travado) e tem nome em português', async () => {
    const { traduzCategoria } = await import('../../src/lib/format');
    expect(agruparGastos(new Map([['Consortium', 575]]), 1000)[0]).toMatchObject({ nome: 'Dívida e seguro', travado: true });
    expect(traduzCategoria('Consortium')).toBe('Consórcio');
  });
});
