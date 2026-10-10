import { describe, expect, it } from 'vitest';
import { detalheMesAtual, detalheMesFuturo, detalheMesPassado, indiceDoMes, linhasDaLista, semPassadosSeFalhar } from '../../src/lib/mesAMes';
import type { ProjecaoBase, ProjecaoMes } from '../../src/lib/previsao';

const mes = (p: Partial<ProjecaoMes>): ProjecaoMes => ({ mes: '2027-01', mesLabel: 'jan/27', receita: 5000, despesaFixa: 0, despesaManual: 1000, despesaCasa: 500, despesaVariavel: 2000, fatura: 1200, parcelas: 300, saldo: 300, saldoProjetado: 800, ...p });
const base = {
  fontesReceita: [{ fonte: 'a', nome: 'Salário A', valor: 3000, diaTipico: 5, responsavel: 'X' }, { fonte: 'b', nome: 'Salário B', valor: 2000, diaTipico: 20, responsavel: 'Y' }],
  compromissosManuais: [
    { id: 1, nome: 'Aluguel', categoria: 'Housing', valor: 1000, responsavel: 'casal', dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: null },
    { id: 2, nome: 'Encerrado', categoria: 'Other', valor: 50, responsavel: 'casal', dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: '2026-06-01' },
  ],
  despesaCasaPorCategoria: { Housing: 999, Electricity: 500 },
  despesaVariavelMediaMensal: 1600, despesaFixaDebitoMedia: 400,
  creditoPorVencimento: { '2027-01': 300 },
  mesCorrente: { recebidoPorFonte: { a: 3000 }, variavelJaGasto: 700, fixoJaGasto: 100, casaNoMesPorCategoria: { Housing: 1000 }, faturaJaPaga: 400, receitaAgendada: 0, receitasAReceber: [], agendadoRestante: 0 },
} as unknown as ProjecaoBase;
const parcelados = [{ chave: 'loja x', categoria: 'Shopping', banco: 'B1', responsavel: 'X', valorParcela: 300, restantes: 2, dataFim: '2027-02-10', parcelaAtual: 5, parcelaTotal: 6 }];

describe('detalhe do mês futuro', () => {
  it('quatro linhas cujos totais fecham com a sobra do mês', () => {
    const d = detalheMesFuturo(base, mes({}), parcelados);
    const t = Object.fromEntries(d.linhas.map((l) => [l.chave, l.total]));
    expect(t).toEqual({ entra: 5000, casa: 1500, debito: 2000, cartao: 1200 });
    expect(t.entra - t.casa - t.debito - t.cartao).toBe(d.sobra);
    expect(d.sobra).toBe(300);
    expect(d.saldoFim).toBe(800);
  });
  it('itens: salários com dia, fixos ativos + casa não cadastrada, débito livre/travado, cartão parcelas + compras novas', () => {
    const d = detalheMesFuturo(base, mes({}), parcelados);
    const it = (k: string) => d.linhas.find((l) => l.chave === k)!.itens;
    expect(it('entra')).toEqual([{ nome: 'Salário A', valor: 3000, nota: 'dia 5' }, { nome: 'Salário B', valor: 2000, nota: 'dia 20' }]);
    expect(it('casa')).toEqual([{ nome: 'Aluguel', valor: 1000 }, { nome: 'Energia', valor: 500, nota: 'média' }]);
    expect(it('debito')).toEqual([{ nome: 'Dia a dia (média)', valor: 1600 }, { nome: 'Contas travadas (média)', valor: 400 }]);
    expect(it('cartao')).toEqual([{ nome: 'loja x', valor: 300, nota: 'B1 · parcela 5/6' }, { nome: 'Compras novas (média)', valor: 900 }]);
  });
  it('parcelas lançadas sem compra parcelada conhecida viram "outras compras já lançadas" (itens fecham com o total)', () => {
    const d = detalheMesFuturo(base, mes({ parcelas: 500 }), parcelados);
    const itens = d.linhas.find((l) => l.chave === 'cartao')!.itens;
    expect(itens.map((i) => [i.nome, i.valor])).toEqual([['loja x', 300], ['Outras compras já lançadas', 200], ['Compras novas (média)', 700]]);
    expect(itens.reduce((s, i) => s + i.valor, 0)).toBe(1200);
  });
  it('fonte de receita de centavos (rendimento) não vira item', () => {
    const b = { ...base, fontesReceita: [...base.fontesReceita, { fonte: 'r', nome: 'rendimentos', valor: 0.01, diaTipico: 11, responsavel: 'X' }] } as ProjecaoBase;
    expect(detalheMesFuturo(b, mes({}), []).linhas[0].itens.map((i) => i.nome)).toEqual(['Salário A', 'Salário B']);
  });
  it('o número da parcela anda com o mês (conta a partir da última)', () => {
    const d = detalheMesFuturo(base, mes({ mes: '2027-02' }), parcelados);
    expect(d.linhas.find((l) => l.chave === 'cartao')!.itens[0].nota).toBe('B1 · parcela 6/6');
  });
  it('compras listadas que somam mais que as parcelas do mês viram uma linha só (itens nunca passam do total)', () => {
    const d = detalheMesFuturo(base, mes({ parcelas: 100 }), parcelados);
    const itens = d.linhas.find((l) => l.chave === 'cartao')!.itens;
    expect(itens.map((i) => [i.nome, i.valor])).toEqual([['Parcelas já lançadas', 100], ['Compras novas (média)', 1100]]);
  });
  it('parcela já encerrada no mês não aparece', () => {
    const d = detalheMesFuturo(base, mes({ mes: '2027-03', parcelas: 0 }), parcelados);
    expect(d.linhas.find((l) => l.chave === 'cartao')!.itens).toEqual([{ nome: 'Compras novas (média)', valor: 1200 }]);
  });
  it('sem parcela conhecida, o cartão é só compras novas; sem receita, Entra = 0 sem itens', () => {
    const d = detalheMesFuturo({ ...base, fontesReceita: [], creditoPorVencimento: {} } as ProjecaoBase, mes({ receita: 0, parcelas: 0, saldo: -4700 }), []);
    expect(d.linhas.find((l) => l.chave === 'cartao')!.itens).toEqual([{ nome: 'Compras novas (média)', valor: 1200 }]);
    const entra = d.linhas.find((l) => l.chave === 'entra')!;
    expect(entra.total).toBe(0);
    expect(entra.itens).toEqual([]);
  });
});

describe('detalhe do mês atual e passado', () => {
  it('atual: já aconteceu × ainda falta', () => {
    const d = detalheMesAtual(base, mes({ receita: 2000, despesaVariavel: 900, despesaFixa: 100, despesaManual: 0, despesaCasa: 200, fatura: 800, saldoProjetado: -50 }));
    expect(d.linhas).toEqual([
      { chave: 'entra', titulo: 'Entra', jaAconteceu: 3000, aindaFalta: 2000 },
      { chave: 'casa', titulo: 'Casa e fixos', jaAconteceu: 1000, aindaFalta: 200 },
      { chave: 'debito', titulo: 'Débito', jaAconteceu: 800, aindaFalta: 1000 },
      { chave: 'cartao', titulo: 'Cartão', jaAconteceu: 400, aindaFalta: 800 },
    ]);
    expect(d.fechaCom).toBe(-50);
  });
  it('passado: previsto × real × diferença (real − previsto); mês vazio dá diferença = −previsto', () => {
    const z = { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: 0 };
    const d = detalheMesPassado({ mes: '2026-09', previsto: { receita: 100, debito: 50, casa: 20, fatura: 10, saldo: 20 }, real: z, saldoFim: 5 });
    expect(d.linhas.map((l) => l.chave)).toEqual(['receita', 'casa', 'debito', 'fatura', 'saldo']);
    expect(d.linhas.find((l) => l.chave === 'saldo')).toMatchObject({ previsto: 20, real: 0, diferenca: -20 });
    expect(d.saldoFim).toBe(5);
  });
});

describe('lista de meses', () => {
  const passados = [{ mes: '2026-09', previsto: { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: -100 }, real: { receita: 0, debito: 0, casa: 0, fatura: 0, saldo: 50 }, saldoFim: 900 }];
  const proj = [mes({ mes: '2026-10', saldo: -20, saldoProjetado: 880 }), mes({ mes: '2026-11', saldo: -30, saldoProjetado: 850 })];
  it('passados com real e previsto, atual, futuros; sem calibração o pior caso é null', () => {
    expect(linhasDaLista(proj, passados, null, 20, 31)).toEqual([
      { tipo: 'passado', mes: '2026-09', sobra: 50, previsto: -100, saldoFim: 900, piorCaso: null },
      { tipo: 'atual', mes: '2026-10', sobra: -20, previsto: null, saldoFim: 880, piorCaso: null },
      { tipo: 'futuro', mes: '2026-11', sobra: -30, previsto: null, saldoFim: 850, piorCaso: null },
    ]);
  });
  it('com calibração: pior caso do futuro por √k e do atual pelos dias que faltam', () => {
    const c = { p10: -100, p90: 100, n: 6, calculadaEm: 'x' };
    const l = linhasDaLista(proj, [], c, 31, 31);
    expect(l[0].piorCaso).toBe(780);
    expect(l[1].piorCaso).toBe(750);
  });
});

describe('mês aberto pelo ?mes', () => {
  const l = [{ mes: '2026-09' }, { mes: '2026-10' }, { mes: '2026-11' }] as any;
  it('mês da lista abre; inválido, ausente ou fora do intervalo dá -1 (mostra a lista)', () => {
    expect(indiceDoMes(l, '2026-10')).toBe(1);
    expect(indiceDoMes(l, '2020-01')).toBe(-1);
    expect(indiceDoMes(l, '2029-01')).toBe(-1);
    expect(indiceDoMes(l, '2026-13')).toBe(-1);
    expect(indiceDoMes(l, 'x')).toBe(-1);
    expect(indiceDoMes(l, undefined)).toBe(-1);
  });
});

describe('meses passados opcionais', () => {
  it('falha ao buscar os passados vira lista sem passados, não derruba a tela', async () => {
    expect(await semPassadosSeFalhar(Promise.reject(new Error('banco fora')))).toEqual([]);
    const ok = [{ mes: '2026-09' }] as any;
    expect(await semPassadosSeFalhar(Promise.resolve(ok))).toBe(ok);
  });
});
