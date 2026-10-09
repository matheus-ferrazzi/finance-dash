import { describe, expect, it } from 'vitest';
import {
  addMonths, computeProjecao, computeRitmo, diasNoMes, mediana, mesesBaseReceita, receitaAindaAEntrar, receitaRecorrente,
  type EntradaReceita, type ProjecaoBase,
} from '../../src/lib/previsao';

export function baseFake(p: Partial<ProjecaoBase> = {}): ProjecaoBase {
  return {
    patrimonioAtual: 0, saldoContasAtual: 1000, saldoContas: { total: 1000, contas: [] },
    fontesReceita: [{ fonte: 'empresa', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }], despesaVariavelMediaMensal: 3000, creditoNovoMedio: 1000,
    despesaCasaPorCategoria: { Housing: 1500 }, despesaFixaPorMes: {}, compromissosManuais: [],
    mesCorrente: {
      recebidoPorFonte: {}, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0,
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

const e = (fonte: string, mes: string, dia: number, valor: number): EntradaReceita =>
  ({ fonte, nome: fonte, mes, dia, valor, responsavel: 'Matheus' });

describe('receitaRecorrente', () => {
  it('mediana por fonte; entrada avulsa não entra', () => {
    const r = receitaRecorrente([
      e('empresa', '2026-06', 5, 5000), e('empresa', '2026-07', 5, 5000), e('empresa', '2026-08', 5, 7000),
      e('avulsa', '2026-07', 12, 2000),
    ], ['2026-06', '2026-07', '2026-08']);
    expect(r).toEqual([{ fonte: 'empresa', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }]);
  });
  it('salário em duas partes no mesmo mês soma por mês', () => {
    const r = receitaRecorrente([
      e('empresa', '2026-07', 5, 2000), e('empresa', '2026-07', 20, 3000),
      e('empresa', '2026-08', 5, 2000), e('empresa', '2026-08', 20, 3000),
    ], ['2026-07', '2026-08']);
    expect(r[0].valor).toBe(5000);
  });
  it('fonte fora dos meses-base é ignorada; com 1 mês-base, 1 aparição basta', () => {
    expect(receitaRecorrente([e('x', '2026-05', 1, 100)], ['2026-07'])).toEqual([]);
    expect(receitaRecorrente([e('x', '2026-07', 1, 100)], ['2026-07'])).toHaveLength(1);
  });
});

describe('receitaAindaAEntrar', () => {
  it('depois da primeira parte, a segunda ainda entra; recebido inteiro some', () => {
    const fontes = [{ fonte: 'empresa', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' },
                    { fonte: 'outra', nome: 'outra', valor: 1000, diaTipico: 10, responsavel: 'Ariane' }];
    const r = receitaAindaAEntrar(fontes, { empresa: 2000, outra: 1000 });
    expect(r.map((f) => [f.fonte, f.valor])).toEqual([['empresa', 3000]]);
  });
});

describe('receita na projeção', () => {
  it('meses futuros: soma das fontes; mês corrente: o que falta entrar + agendado', () => {
    const base = baseFake({
      fontesReceita: [{ fonte: 'a', nome: 'a', valor: 4000, diaTipico: 5, responsavel: 'Matheus' },
                      { fonte: 'b', nome: 'b', valor: 1000, diaTipico: 20, responsavel: 'Ariane' }],
    });
    base.mesCorrente.receitasAReceber = [{ fonte: 'b', nome: 'b', valor: 1000, diaTipico: 20, responsavel: 'Ariane' }];
    base.mesCorrente.receitaAgendada = 50;
    const p = computeProjecao(base, 1, '2026-08-10');
    expect([p[0].receita, p[1].receita]).toEqual([1050, 5000]);
  });
});

describe('mesesBaseReceita', () => {
  it('os 6 últimos meses fechados antes de hoje, do mais recente ao mais antigo', () => {
    expect(mesesBaseReceita('2026-08-01')).toEqual(['2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02']);
    expect(mesesBaseReceita('2026-01-31')[0]).toBe('2025-12');
  });
  it('renda que alterna entre dois patamares: a mediana de 6 meses fica no meio', () => {
    const alterna = [4700, 6400, 4500, 6100, 4600, 4400].map((v, i) => e('empresa', mesesBaseReceita('2026-08-01')[i], 1, v));
    expect(receitaRecorrente(alterna, mesesBaseReceita('2026-08-01'))[0].valor).toBe(4650);
  });
});
