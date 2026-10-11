import { describe, expect, it } from 'vitest';
import { agruparDividas, ehAtraso, ehDivida, mesesComContaNegativa } from '../../src/lib/trilha';

describe('o que é dívida', () => {
  it('renegociação, parcelamento de fatura, empréstimo e financiamento são dívida', () => {
    expect(ehDivida('RENEGOCIAÇÃO DE PENDÊNCIAS 3/12', 'Transfers')).toBe(true);
    expect(ehDivida('Renegociacao de divida', null)).toBe(true);
    expect(ehDivida('PARCELAMENTO DE FATURA 2/6', 'Credit card payment')).toBe(true);
    expect(ehDivida('PARC.FATURA 01/04', null)).toBe(true);
    expect(ehDivida('PREST. DE EMPREST. FINANCIAMENTO PARC 3 10', 'Loans and financing')).toBe(true);
    expect(ehDivida('qualquer coisa', 'Loans')).toBe(true);
  });
  it('compra parcelada comum não é dívida, mesmo com "PARC" na descrição', () => {
    expect(ehDivida('LOJA X 3/10', 'Shopping')).toBe(false);
    expect(ehDivida('PARC LOJA DE MOVEIS 2/5', 'Houseware')).toBe(false);
    expect(ehDivida('CRÉDITO DE PARCELAMENTO', 'Transfers')).toBe(false);
  });
  it('juros e encargos de atraso são atraso', () => {
    expect(ehAtraso('JUROS DE MORA', 'Late payment and overdraft costs')).toBe(true);
    expect(ehAtraso('ENCARGOS DE ATRASO', 'Bank fees')).toBe(true);
    expect(ehAtraso('ENC ATRASO PARC FATURA', 'Automotive')).toBe(true);
    expect(ehAtraso('juros', 'Interests charged')).toBe(true);
    expect(ehAtraso('TARIFA PACOTE', 'Bank fees')).toBe(false);
  });
});

describe('dívidas ativas', () => {
  const l = (descricao: string, data: string, valor: number, forma = 'Crédito', banco = 'B1', categoria: string | null = null) => ({ descricao, categoria, banco, forma, data, valor });
  it('parcelas futuras: quantas faltam, valor e fim; débito sem data futura fica sem fim; cartão já acabado não aparece', () => {
    const r = agruparDividas([
      l('RENEGOCIAÇÃO DE PENDÊNCIAS 5/12', '2026-10-10', 100), l('RENEGOCIAÇÃO DE PENDÊNCIAS 6/12', '2026-11-10', 100), l('RENEGOCIAÇÃO DE PENDÊNCIAS 7/12', '2026-12-10', 100),
      l('PREST. DE EMPREST. FINANCIAMENTO PARC 3 10', '2026-10-02', 50, 'Débito', 'B2', 'Loans and financing'),
      l('PARCELAMENTO DE FATURA 6/6', '2026-10-05', 80),
      l('LOJA X 3/10', '2026-12-01', 40),
    ], '2026-10-15');
    expect(r).toEqual([
      { nome: 'renegociação de pendências', banco: 'B1', valorParcela: 100, restantes: 2, fim: '2026-12' },
      { nome: 'prest de emprest financiamento parc', banco: 'B2', valorParcela: 50, restantes: null, fim: null },
    ]);
  });
  it('sem lançamento de dívida: lista vazia', () => {
    expect(agruparDividas([l('LOJA X 3/10', '2026-12-01', 40)], '2026-10-15')).toEqual([]);
  });
});

describe('conta negativa', () => {
  it('meses em que o saldo de fim de dia ficou abaixo de zero', () => {
    // hoje 100; em 05/09 saiu 300 e em 20/09 entrou 250 → início de set = 100 − (−300 + 250) = 150
    expect(mesesComContaNegativa(100, { '2026-09-05': -300, '2026-09-20': 250 }, '2026-09-01', '2026-10-15')).toEqual(['2026-09']);
    expect(mesesComContaNegativa(500, { '2026-09-05': -100 }, '2026-09-01', '2026-10-15')).toEqual([]);
  });
  it('já começa negativo: conta o mês do início', () => {
    expect(mesesComContaNegativa(-10, {}, '2026-09-01', '2026-10-15')).toEqual(['2026-09']);
  });
});
