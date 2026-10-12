import { describe, expect, it } from 'vitest';
import {
  addMonths, aplicarCenario, computeProjecao, computeRitmo, diasNoMes, mediana, mesesBaseReceita, receitaAindaAEntrar, receitaRecorrente,
  type EntradaReceita, type ProjecaoBase,
} from '../../src/lib/previsao';

export function baseFake(p: Partial<ProjecaoBase> = {}): ProjecaoBase {
  return {
    patrimonioAtual: 0, saldoContasAtual: 1000, saldoContas: { total: 1000, contas: [] },
    fontesReceita: [{ fonte: 'empresa', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }], despesaVariavelMediaMensal: 3000, creditoNovoMedio: 1000,
    despesaCasaPorCategoria: { Housing: 1500 }, creditoPorVencimento: {}, faturaReal: {}, compromissosManuais: [],
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
    expect(r).toEqual([{ fonte: 'empresa|1', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }]);
  });
  it('salário em duas partes no mesmo mês: duas partes que somam o mês', () => {
    const r = receitaRecorrente([
      e('empresa', '2026-07', 5, 2000), e('empresa', '2026-07', 20, 3000),
      e('empresa', '2026-08', 5, 2000), e('empresa', '2026-08', 20, 3000),
    ], ['2026-07', '2026-08']);
    expect(r.map((f) => f.fonte).sort()).toEqual(['empresa|1', 'empresa|2']);
    expect(r.reduce((s, f) => s + f.valor, 0)).toBe(5000);
  });
  it('fonte fora dos meses-base é ignorada; com 1 mês-base, 1 aparição basta', () => {
    expect(receitaRecorrente([e('x', '2026-05', 1, 100)], ['2026-07'])).toEqual([]);
    expect(receitaRecorrente([e('x', '2026-07', 1, 100)], ['2026-07'])).toHaveLength(1);
  });
});

describe('receitaAindaAEntrar', () => {
  it('só entra o que ainda não caiu, pelo valor típico', () => {
    const fontes = [{ fonte: 'empresa|2', nome: 'empresa', valor: 1600, diaTipico: 19, responsavel: 'Matheus' },
                    { fonte: 'outra|1', nome: 'outra', valor: 1000, diaTipico: 2, responsavel: 'Ariane' }];
    const r = receitaAindaAEntrar(fontes, { 'outra|1': 1000 });
    expect(r.map((f) => [f.fonte, f.valor])).toEqual([['empresa|2', 1600]]);
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
  it('fonte que parou (emprego antigo) não entra, mesmo recorrente na janela', () => {
    const base = mesesBaseReceita('2026-08-01'); // jul, jun, mai, abr, mar, fev
    const r = receitaRecorrente([
      ...['2026-02', '2026-03', '2026-04'].map((m) => e('emprego-antigo', m, 5, 5000)),
      ...['2026-05', '2026-06', '2026-07'].map((m) => e('emprego-novo', m, 5, 5500)),
    ], base);
    expect(r.map((f) => f.fonte)).toEqual(['emprego-novo|1']);
  });
  it('renda que alterna entre dois patamares: a mediana de 6 meses fica no meio', () => {
    const alterna = [4700, 6400, 4500, 6100, 4600, 4400].map((v, i) => e('empresa', mesesBaseReceita('2026-08-01')[i], 1, v));
    expect(receitaRecorrente(alterna, mesesBaseReceita('2026-08-01'))[0].valor).toBe(4650);
  });
});

describe('fatura', () => {
  const base = baseFake({
    creditoNovoMedio: 1000,
    faturaReal: { '2026-08': 2500 },
    creditoPorVencimento: { '2026-08': 2400, '2026-09': 600, '2026-10': 300 },
  });
  base.mesCorrente.faturaJaPaga = 500;
  const p = computeProjecao(base, 3, '2026-08-11');
  it('mês corrente: fatura real que vence nele menos o já pago', () => {
    expect(p[0].fatura).toBe(2000);
  });
  it('mês seguinte: compras já lançadas + média pela fração do mês que falta', () => {
    expect(p[1].fatura).toBeCloseTo(600 + 1000 * 20 / 31, 2);
  });
  it('meses depois: parcelas já lançadas + média; sem nada lançado, só a média', () => {
    expect(p[2].fatura).toBe(1300);
    expect(p[3].fatura).toBe(1000);
  });
  it('fatura real conhecida manda (teste contra o passado)', () => {
    const q = computeProjecao(baseFake({ faturaReal: { '2026-09': 999 }, creditoPorVencimento: {} }), 1, '2026-08-11');
    expect(q[1].fatura).toBe(999);
  });
  it('sem nada conhecido no mês corrente, não dá NaN', () => {
    const q = computeProjecao(baseFake({ faturaReal: {}, creditoPorVencimento: {} }), 0, '2026-08-11');
    expect(q[0].fatura).toBe(0);
  });
});

describe('aplicarCenario', () => {
  const aluguel = { id: 1, nome: 'Aluguel', categoria: 'Housing', valor: 2000, responsavel: 'casal',
    dataInicio: '2026-09-01', mesesTotais: null, observacao: null, dataFim: null };
  it('encerra o atual no mês anterior e entra o novo a partir da data', () => {
    const base = baseFake({ compromissosManuais: [aluguel], despesaCasaPorCategoria: {} });
    const p = computeProjecao(aplicarCenario(base, { aPartirDe: '2027-03', categoria: 'Housing', valor: 1200 }), 8, '2026-10-09');
    const mes = (ym: string) => p.find((m) => m.mes === ym)!;
    expect([mes('2027-02').despesaManual, mes('2027-03').despesaManual]).toEqual([2000, 1200]);
    expect(base.compromissosManuais).toEqual([aluguel]); // não muta
  });
  it('categoria sem compromisso: a média vale até a data, o cenário depois', () => {
    const base = baseFake({ compromissosManuais: [], despesaCasaPorCategoria: { Housing: 1500 } });
    const p = computeProjecao(aplicarCenario(base, { aPartirDe: '2026-12', categoria: 'Housing', valor: 900 }), 3, '2026-10-09');
    expect(p.slice(1).map((m) => m.despesaCasa + m.despesaManual)).toEqual([1500, 900, 900]);
  });
});

describe('receita em partes (quinzena)', () => {
  const base6 = mesesBaseReceita('2026-10-09'); // set..abr
  const entradas = base6.flatMap((m) => [e('empresa', m, 4, 3900), e('empresa', m, 19, 1600)]);
  it('cada quinzena da mesma fonte vira uma parte com o seu valor típico; o mês soma as partes', () => {
    const r = receitaRecorrente(entradas, base6);
    expect(r.map((f) => [f.fonte, f.valor, f.diaTipico])).toEqual([['empresa|1', 3900, 4], ['empresa|2', 1600, 19]]);
  });
  it('primeira parte veio maior (plantão): a segunda continua prevista no valor de sempre', () => {
    const fontes = receitaRecorrente(entradas, base6);
    const falta = receitaAindaAEntrar(fontes, { 'empresa|1': 5939 });
    expect(falta.map((f) => [f.fonte, f.valor])).toEqual([['empresa|2', 1600]]);
  });
  it('parte que já caiu sai do "ainda entra", mesmo com valor menor que o típico', () => {
    const fontes = receitaRecorrente(entradas, base6);
    expect(receitaAindaAEntrar(fontes, { 'empresa|1': 3000, 'empresa|2': 900 })).toEqual([]);
  });
});

describe('extra (plantão, bônus) não vira valor típico', () => {
  it('mês com extra acima de 1,5x o típico da parte fica fora do típico', () => {
    const base = mesesBaseReceita('2026-09-10'); // ago..mar
    const r = receitaRecorrente([
      e('empresa', '2026-05', 19, 2461), e('empresa', '2026-06', 19, 3949), e('empresa', '2026-07', 19, 1544), e('empresa', '2026-08', 19, 1569),
    ], base);
    expect(r[0].valor).toBe(1569);
  });
  it('renda que só alterna de patamar (sem extra) continua pela mediana', () => {
    const base = mesesBaseReceita('2026-08-01');
    const r = receitaRecorrente([4700, 6400, 4500, 6100, 4600, 4400].map((v, i) => e('x', base[i], 1, v)), base);
    expect(r[0].valor).toBe(4650);
  });
});
