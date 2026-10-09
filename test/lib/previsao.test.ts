import { describe, expect, it } from 'vitest';
import { addMonths, computeProjecao, computeRitmo, diasNoMes, mediana, type ProjecaoBase } from '../../src/lib/previsao';

export function baseFake(p: Partial<ProjecaoBase> = {}): ProjecaoBase {
  return {
    patrimonioAtual: 0, saldoContasAtual: 1000, saldoContas: { total: 1000, contas: [] },
    receitaMediaMensal: 5000, despesaVariavelMediaMensal: 3000, creditoNovoMedio: 1000,
    despesaCasaPorCategoria: { Housing: 1500 }, despesaFixaPorMes: {}, compromissosManuais: [],
    mesCorrente: {
      receitaJaRecebida: 0, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0,
      agendadoRestante: 0, faturaJaPaga: 0, casaNoMesPorCategoria: {},
    },
    ...p,
  } as ProjecaoBase;
}

describe('utilidades', () => {
  it('addMonths, diasNoMes e mediana', () => {
    expect([addMonths('2026-12', 1), addMonths('2026-01', -1)]).toEqual(['2027-01', '2025-12']);
    expect([diasNoMes('2026-02'), diasNoMes('2026-10')]).toEqual([28, 31]);
    expect([mediana([3, 1, 2]), mediana([1, 2, 3, 10]), mediana([])]).toEqual([2, 2.5, 0]);
  });
});

describe('computeProjecao com hoje explícito', () => {
  it('o mês de referência e os dias vêm de hoje, não do relógio', () => {
    const p = computeProjecao(baseFake(), 2, '2026-08-01');
    expect(p.map((m) => m.mes)).toEqual(['2026-08', '2026-09', '2026-10']);
    // dia 1, antes do dia 7: gasto do dia a dia pela média, 30 dos 31 dias ainda faltam
    expect(p[0].despesaVariavel).toBeCloseTo(3000 * 30 / 31, 2);
  });
  it('computeRitmo usa o dia de hoje', () => {
    const base = baseFake();
    const r = computeRitmo(base, computeProjecao(base, 1, '2026-08-10')[0], '2026-08-10');
    expect([r.diaHoje, r.diasRestantes]).toEqual([10, 21]);
  });
});
