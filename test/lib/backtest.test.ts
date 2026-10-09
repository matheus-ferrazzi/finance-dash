import { describe, expect, it } from 'vitest';
import { avaliarMes, componentesPrevistos, LIMITES } from '../../src/lib/backtest';
import type { ProjecaoMes } from '../../src/lib/previsao';

const mes: ProjecaoMes = {
  mes: '2026-08', mesLabel: 'ago/26', receita: 10000, despesaFixa: 200, despesaManual: 2000, despesaCasa: 500,
  despesaVariavel: 4000, fatura: 3000, parcelas: 0, saldo: 300, saldoProjetado: 1300, emAndamento: true,
};

describe('backtest', () => {
  it('agrupa a previsão nos componentes que dá para medir', () => {
    expect(componentesPrevistos(mes)).toEqual({ receita: 10000, debito: 4200, casa: 2500, fatura: 3000, saldo: 300 });
  });

  it('erro = previsto − real; aprova dentro dos limites do spec', () => {
    const r = avaliarMes(componentesPrevistos(mes), { receita: 9700, debito: 4000, casa: 2400, fatura: 3300, saldo: 0 });
    expect(r.erros).toEqual({ receita: 300, debito: 200, casa: 100, fatura: -300, saldo: 300 });
    expect(r.ok).toBe(true);
  });

  it('reprova quando receita, fatura ou saldo passam do limite', () => {
    const real = { receita: 10000, debito: 4200, casa: 2500, fatura: 3000, saldo: 300 };
    expect(avaliarMes(componentesPrevistos(mes), { ...real, receita: 10000 - LIMITES.receita - 1 }).ok).toBe(false);
    expect(avaliarMes(componentesPrevistos(mes), { ...real, fatura: 3000 + LIMITES.fatura + 1 }).ok).toBe(false);
    expect(avaliarMes(componentesPrevistos(mes), { ...real, saldo: 300 - LIMITES.saldo - 1 }).ok).toBe(false);
  });
});
