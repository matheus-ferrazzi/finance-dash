import { describe, expect, it } from 'vitest';
import { creditoPorVencimentoDe, mediaMensalPorCategoria, type CicloCartao } from '../../src/lib/faturaPrevista';
import { saldoNaoPago, somaDoCiclo } from '../../src/lib/faturas';

const ciclo = (p: Partial<CicloCartao> & { conta: string; venc: string }): CicloCartao =>
  ({ compras: 0, abate: 0, outrosCreditos: 0, temHistorico: true, ...p });

// auditoria 11/11: a fatura fecha como saldo não pago da anterior + compras − todos os créditos do ciclo
describe('creditoPorVencimentoDe — fatura prevista por vencimento', () => {
  it('plano antigo encerrado: as parcelas antecipadas entram como compra e o crédito de parcelamento as anula', () => {
    const r = creditoPorVencimentoDe(
      [ciclo({ conta: 'nu', venc: '2041-04', compras: 2100, abate: 60, outrosCreditos: 2400 })],
      [{ conta: 'nu', venc: '2041-04', valor: 500 }],
    );
    expect(r['2041-04']).toBe(140); // 500 + 2100 − 60 − 2400
  });

  it('fatura paga em parte e parcelada: o crédito cobre só o saldo anterior e a fatura fica igual às compras', () => {
    const r = creditoPorVencimentoDe(
      [ciclo({ conta: 'nu', venc: '2041-04', compras: 1000, outrosCreditos: 300 })],
      [{ conta: 'nu', venc: '2041-04', valor: 300 }],
    );
    expect(r['2041-04']).toBe(1000);
  });

  it('fatura paga em parte sem parcelar (rotativo): o saldo não pago vem na próxima', () => {
    const r = creditoPorVencimentoDe([ciclo({ conta: 'nu', venc: '2041-04', compras: 1000 })], [{ conta: 'nu', venc: '2041-04', valor: 250 }]);
    expect(r['2041-04']).toBe(1250);
  });

  it('saldo anterior sem nenhuma compra no ciclo ainda vira fatura', () => {
    expect(creditoPorVencimentoDe([], [{ conta: 'nu', venc: '2041-04', valor: 250 }])['2041-04']).toBe(250);
  });

  it('crédito maior que tudo não deixa a fatura do cartão negativa nem abate a de outro cartão', () => {
    const r = creditoPorVencimentoDe(
      [ciclo({ conta: 'nu', venc: '2041-04', compras: 100, outrosCreditos: 900 }), ciclo({ conta: 'sant', venc: '2041-04', compras: 70 })], [],
    );
    expect(r['2041-04']).toBe(70);
  });

  it('cartão sem histórico de fatura (Bradesco): só estorno de compra abate, como antes', () => {
    const r = creditoPorVencimentoDe([ciclo({ conta: 'brad', venc: '2041-04', compras: 200, abate: 20, outrosCreditos: 999, temHistorico: false })], []);
    expect(r['2041-04']).toBe(180);
  });

  it('soma os cartões por mês de vencimento', () => {
    const r = creditoPorVencimentoDe(
      [ciclo({ conta: 'a', venc: '2041-04', compras: 100 }), ciclo({ conta: 'b', venc: '2041-04', compras: 50.5 }), ciclo({ conta: 'a', venc: '2041-05', compras: 30 })], [],
    );
    expect(r).toEqual({ '2041-04': 150.5, '2041-05': 30 });
  });
});

describe('mediaMensalPorCategoria — casa', () => {
  it('mês sem a conta conta como zero: um botijão em três meses não vira gasto de todo mês', () => {
    const r = mediaMensalPorCategoria([
      { categoria: 'Gas', total: 120 },
      { categoria: 'Housing', total: 2000 }, { categoria: 'Housing', total: 2000 }, { categoria: 'Housing', total: 2300 },
    ], 3);
    expect(r).toEqual({ Gas: 40, Housing: 2100 });
  });

  it('sem mês-base não divide por zero', () => {
    expect(mediaMensalPorCategoria([{ categoria: 'Gas', total: 120 }], 0)).toEqual({ Gas: 120 });
  });
});

describe('ciclo em curso da tela de Faturas', () => {
  const ult = (p: object) => ({ total: 900, pago: 400, parcelado: 0, vencimento: '2041-03-06', situacao: 'atrasada' as const, falta: 500, ...p });

  it('saldoNaoPago: o que faltou da última fatura já vencida; a que ainda vai vencer não conta', () => {
    expect(saldoNaoPago(ult({}), '2041-03-10')).toBe(500);
    expect(saldoNaoPago(ult({}), '2041-03-06')).toBe(0);
    expect(saldoNaoPago(ult({ pago: 950 }), '2041-03-10')).toBe(0);
    expect(saldoNaoPago(null, '2041-03-10')).toBe(0);
  });

  it('somaDoCiclo: compras e créditos do ciclo mais o saldo não pago, nunca negativo', () => {
    expect(somaDoCiclo([300, 200.5, -450], 500)).toBe(550.5);
    expect(somaDoCiclo([100, -900], 500)).toBe(0);
  });
});
