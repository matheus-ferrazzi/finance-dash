import { describe, expect, it } from 'vitest';
import {
  addMonths, aplicarCenario, cenarioMudanca, lerMudanca, resumoMudanca, avisosDeCadastro, computeProjecao, computeRitmo, diasNoMes, mediana, mesesBaseReceita, receitaAindaAEntrar, receitaRecorrente,
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
  // N11 (auditoria 13/10): "dá pra gastar hoje" dividia pelos dias DEPOIS de hoje (hoje ficava sem parte) e
  // no último dia do mês era sempre 0
  it('N11: o que sobra para o dia a dia se divide entre hoje e os dias que faltam; último dia = tudo hoje', () => {
    const base = baseFake({ saldoContasAtual: 20000 });
    const m = computeProjecao(base, 1, '2026-08-10')[0];
    const r = computeRitmo(base, m, '2026-08-10');
    expect(r.ritmoSeguroDia).toBeCloseTo(Math.max(0, r.sobraParaODiaADia) / 22, 6);
    const u = computeProjecao(base, 1, '2026-08-31')[0];
    const ru = computeRitmo(base, u, '2026-08-31');
    expect(ru.diasRestantes).toBe(0);
    expect(ru.ritmoSeguroDia).toBeCloseTo(Math.max(0, ru.sobraParaODiaADia), 6);
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
  it('N3: fatura que falta vista por cartão manda no mês corrente (vencida/parcelada não sai de novo)', () => {
    const b = baseFake({ faturaReal: { '2026-10': 3000 }, creditoPorVencimento: {} });
    b.mesCorrente.faturaJaPaga = 2500;
    b.mesCorrente.faturaRestante = 0;
    expect(computeProjecao(b, 0, '2026-10-13')[0].fatura).toBe(0);
  });
  it('N1: cartão sem histórico — o pagamento mensal repetido sai todo mês; no corrente, só se ainda não saiu', () => {
    const b = baseFake({ faturaReal: {}, creditoPorVencimento: {}, creditoNovoMedio: 0, cartaoSemFatura: { mensal: 123.45, pagoNoMes: 0 } });
    const p = computeProjecao(b, 2, '2026-11-03');
    expect([p[0].fatura, p[1].fatura, p[2].fatura]).toEqual([123.45, 123.45, 123.45]);
    b.cartaoSemFatura = { mensal: 123.45, pagoNoMes: 123.45 };
    expect(computeProjecao(b, 1, '2026-11-10')[0].fatura).toBe(0);
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

describe('débito do mês em andamento: contas fixas à parte e perfil do mês (10/10/2026)', () => {
  const mc = (p: Partial<ProjecaoBase['mesCorrente']>) => ({ ...baseFake().mesCorrente, ...p });

  it('meses seguintes: débito = livre + fixo (o total de antes)', () => {
    const p = computeProjecao(baseFake({ despesaVariavelMediaMensal: 2500, despesaFixaDebitoMedia: 500 }), 1, '2026-08-11');
    expect(p[1].despesaVariavel).toBe(3000);
  });

  it('conta fixa que ainda não saiu entra como compromisso, não no ritmo; a já paga não conta de novo', () => {
    const b = baseFake({ despesaFixaDebitoMedia: 500, fracaoRestanteDebito: 0.4, mesCorrente: mc({ fixoJaGasto: 300 }) });
    expect(computeProjecao(b, 0, '2026-08-03')[0].despesaFixa).toBe(200);
    const paga = baseFake({ despesaFixaDebitoMedia: 500, fracaoRestanteDebito: 0.4, mesCorrente: mc({ fixoJaGasto: 500 }) });
    expect(computeProjecao(paga, 0, '2026-08-03')[0].despesaFixa).toBe(0);
  });

  // N12 (auditoria 13/10): com consórcio, seguro e MEI já pagos, "média total − pago total" ainda esperava dinheiro saindo
  it('N12: conta travada vista por categoria: a que já saiu no mês está paga (mesmo abaixo da média); a que não saiu espera a média', () => {
    const b = baseFake({ despesaFixaDebitoMedia: 1100, mesCorrente: mc({
      fixoJaGasto: 1050,
      fixoPorCategoria: {
        Consortium: { media: 500, pago: 500 }, Insurance: { media: 300, pago: 300 }, Taxes: { media: 250, pago: 230 },
      },
    }) });
    expect(computeProjecao(b, 0, '2026-10-13')[0].despesaFixa).toBe(0);
    const falta = baseFake({ despesaFixaDebitoMedia: 1100, mesCorrente: mc({
      fixoJaGasto: 500, fixoPorCategoria: { Consortium: { media: 500, pago: 500, ativa: true }, Insurance: { media: 300, pago: 0, ativa: true } },
    }) });
    expect(computeProjecao(falta, 0, '2026-10-13')[0].despesaFixa).toBeCloseTo(300, 2);
  });
  it('N12: conta travada que não apareceu no mês passado acabou (empréstimo de julho): não é esperada', () => {
    const b = baseFake({ despesaFixaDebitoMedia: 120, mesCorrente: mc({
      fixoJaGasto: 0, fixoPorCategoria: { 'Loans and financing': { media: 120, pago: 0, ativa: false } },
    }) });
    expect(computeProjecao(b, 0, '2026-10-13')[0].despesaFixa).toBe(0);
  });

  it('antes do dia 7: gasto livre que falta = média × fração histórica que sai depois de hoje', () => {
    const b = baseFake({ despesaVariavelMediaMensal: 3000, fracaoRestanteDebito: 0.7, mesCorrente: mc({ variavelJaGasto: 2000 }) });
    expect(computeProjecao(b, 0, '2026-08-03')[0].despesaVariavel).toBeCloseTo(2100);
  });

  it('do dia 7 em diante: metade pela média, metade pelo observado escalado pelo perfil', () => {
    // média 3000 × 0.4 = 1200; observado 1500 até hoje, perfil diz que 60% já saiu → resto 1500 × 0.4/0.6 = 1000
    const b = baseFake({ despesaVariavelMediaMensal: 3000, fracaoRestanteDebito: 0.4, mesCorrente: mc({ variavelJaGasto: 1500 }) });
    expect(computeProjecao(b, 0, '2026-08-10')[0].despesaVariavel).toBeCloseTo(1100);
  });

  it('sem perfil (pouco histórico), a fração é a dos dias que faltam', () => {
    const b = baseFake({ despesaVariavelMediaMensal: 3100, fracaoRestanteDebito: null, mesCorrente: mc({ variavelJaGasto: 0 }) });
    expect(computeProjecao(b, 0, '2026-08-01')[0].despesaVariavel).toBeCloseTo(3000); // 30 de 31 dias
  });

  it('conta fixa que ainda vai sair é descontada do que sobra para o dia a dia (é compromisso)', () => {
    const b = baseFake({ saldoContasAtual: 3000, despesaFixaDebitoMedia: 500, fracaoRestanteDebito: 0.4, despesaCasaPorCategoria: {},
      fontesReceita: [], mesCorrente: mc({ fixoJaGasto: 0 }) });
    const p = computeProjecao(b, 0, '2026-08-11');
    expect(computeRitmo(b, p[0], '2026-08-11').sobraParaODiaADia).toBe(2500);
  });
});

// auditoria 13/10 (N13): o cadastro manda na previsão; aluguel cadastrado bem abaixo do que saiu no mês
describe('aviso de cadastro desatualizado (N13)', () => {
  const c = (nome: string, categoria: string, valor: number) =>
    ({ id: 1, nome, categoria, valor, responsavel: 'casal', dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: null });
  it('categoria cadastrada que saiu mais de 10% acima do cadastro no mês avisa; dentro de 10% ou sem cadastro, não', () => {
    expect(avisosDeCadastro([c('Aluguel', 'Housing', 1000), c('Luz', 'Electricity', 200)], { Housing: 1300, Electricity: 215, Water: 500 }, '2026-10'))
      .toEqual([{ categoria: 'Housing', nomes: ['Aluguel'], cadastro: 1000, realizado: 1300 }]);
  });
  it('compromisso que já acabou não conta', () => {
    expect(avisosDeCadastro([{ ...c('Velho', 'Housing', 100), dataFim: '2026-05-01' }], { Housing: 2000 }, '2026-10')).toEqual([]);
  });
});

// auditoria 13/10 (P1): "e se mudarmos em mar/27?" — aluguel novo a partir do mês + custo da mudança só nele
describe('cenarioMudanca', () => {
  const aluguel = { id: 1, nome: 'Aluguel', categoria: 'Housing', valor: 2000, responsavel: 'casal',
    dataInicio: '2026-09-01', mesesTotais: null, observacao: null, dataFim: null };
  const base = () => baseFake({ compromissosManuais: [aluguel], despesaCasaPorCategoria: {} });
  it('troca o aluguel a partir do mês e cobra o custo da mudança uma vez, no próprio mês', () => {
    const p = computeProjecao(cenarioMudanca(base(), { mes: '2027-03', aluguel: 1200, custo: 3000 }), 8, '2026-10-09');
    const mes = (ym: string) => p.find((m) => m.mes === ym)!.despesaManual;
    expect([mes('2027-02'), mes('2027-03'), mes('2027-04')]).toEqual([2000, 4200, 1200]);
  });
  it('sem custo: só o aluguel muda', () => {
    const p = computeProjecao(cenarioMudanca(base(), { mes: '2027-03', aluguel: 2500, custo: 0 }), 8, '2026-10-09');
    expect(p.find((m) => m.mes === '2027-03')!.despesaManual).toBe(2500);
  });
  it('lê o cenário do link: mês válido e valores ≥ 0; o resto é ignorado', () => {
    expect(lerMudanca({ mudanca: '2027-03', aluguel: '1800', custo: '4000,50' })).toEqual({ mes: '2027-03', aluguel: 1800, custo: 4000.5 });
    expect(lerMudanca({ mudanca: '2027-03', aluguel: '1800' })).toEqual({ mes: '2027-03', aluguel: 1800, custo: 0 });
    expect(lerMudanca({ mudanca: '2027-13', aluguel: '1800' })).toBeNull();
    expect(lerMudanca({ mudanca: '2027-03', aluguel: '-5' })).toBeNull();
    expect(lerMudanca({})).toBeNull();
  });
});

describe('resumoMudanca (P1)', () => {
  const pm = (mes: string, saldoProjetado: number) => ({ mes, mesLabel: mes, saldoProjetado } as any);
  const sem = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((m, i) => pm(m, 1000 + i * 100));
  const com = ['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map((m, i) => pm(m, i < 2 ? 1000 + i * 100 : -200 * i));
  it('linhas do mês anterior à mudança em diante; primeiro mês no vermelho e diferença no fim do horizonte', () => {
    const r = resumoMudanca(sem, com, '2026-12');
    expect(r.linhas.map((l) => [l.mes, l.sem, l.com])).toEqual([
      ['2026-11', 1100, 1100], ['2026-12', 1200, -400], ['2027-01', 1300, -600], ['2027-02', 1400, -800]]);
    expect(r.vermelhoPorCausa).toBe('2026-12');
    expect(r.diferencaFim).toBe(-2200);
    expect(r.mesFim).toBe('2027-02');
  });
  it('nenhum mês no vermelho: null', () => {
    expect(resumoMudanca(sem, sem, '2026-12').vermelhoPorCausa).toBeNull();
  });
  it('mês que já fecha no vermelho sem a mudança não é culpa dela (visto em produção em 14/10)', () => {
    const jaVermelho = sem.map((m, i) => (i === 0 ? { ...m, saldoProjetado: -300 } : m));
    const comVermelho = com.map((m, i) => (i === 0 ? { ...m, saldoProjetado: -300 } : m));
    const r = resumoMudanca(jaVermelho, comVermelho, '2026-12');
    expect(r.vermelhoPorCausa).toBe('2026-12');
    expect(r.vermelhoSemMudar).toBe(true);
    expect(resumoMudanca(jaVermelho, jaVermelho, '2026-12')).toMatchObject({ vermelhoPorCausa: null, vermelhoSemMudar: true });
  });
});

// auditoria 17/10 (M6), 22/10: conta da casa agendada (débito com data futura) abatia o compromisso como paga, mas o
// saldo de hoje ainda não a descontou e o "agendado restante" exclui a casa: o boleto não saía de lugar nenhum e o
// "fecha em" ficava alto pelo valor dele. Agora o agendado da casa entra como saída que ainda falta no mês
describe('M6: conta da casa agendada', () => {
  const compromisso = { id: 1, nome: 'Aluguel', categoria: 'Housing', valor: 1900, responsavel: 'Matheus', dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: null };
  const com = (casaNoMes: Record<string, number>, agendado: number) => computeProjecao(baseFake({
    despesaCasaPorCategoria: {}, compromissosManuais: [compromisso], fontesReceita: [],
    mesCorrente: { recebidoPorFonte: {}, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0, agendadoRestante: 0, faturaJaPaga: 0,
      casaNoMesPorCategoria: casaNoMes, casaAgendadoRestante: agendado } as any,
    despesaVariavelMediaMensal: 0, saldoContasAtual: 3000,
  }), 1, '2026-08-05')[0];
  it('agendado: abate o compromisso e sai como saída restante (conta uma vez)', () => {
    expect(com({}, 0).saldoProjetado).toBeCloseTo(1100, 2);           // não pago nem agendado: falta o compromisso
    expect(com({ Housing: 1900 }, 1900).saldoProjetado).toBeCloseTo(1100, 2); // agendado: sai uma vez
    expect(com({ Housing: 1900 }, 0).saldoProjetado).toBeCloseTo(3000, 2);    // já pago: o saldo já descontou
  });
});
