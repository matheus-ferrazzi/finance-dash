import { describe, expect, it } from 'vitest';
import { comExtras, computeProjecao, receitaExtraMediana, type EntradaReceita, type ProjecaoBase, type ReceitaPrevista } from '../../src/lib/previsao';

const e = (mes: string, valor: number, fonte = 'empresa'): EntradaReceita => ({ fonte, nome: fonte, mes, dia: 5, valor, responsavel: 'Matheus' });
const fontes: ReceitaPrevista[] = [{ fonte: 'empresa|1', nome: 'salário', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }];
const meses = ['2041-06', '2041-05', '2041-04', '2041-03', '2041-02', '2041-01'];

// decisão do Matheus (11/11): a previsão principal segue só com o salário típico; os extras de sempre (plantão, PIX
// recebidos) entram numa segunda linha, pela mediana do que entrou além do típico nos 6 meses-base
describe('receitaExtraMediana', () => {
  it('extra do mês = o que entrou além do típico; mediana dos 6 meses-base', () => {
    const entradas = [
      e('2041-01', 5000), e('2041-02', 5000), e('2041-02', 800, 'pix'), e('2041-03', 6200), e('2041-04', 5000),
      e('2041-04', 400, 'pix'), e('2041-05', 5000), e('2041-05', 1000, 'pix'), e('2041-06', 5600),
    ];
    // extras por mês: 0, 800, 1200, 400, 1000, 600 → mediana (600 + 800) / 2
    expect(receitaExtraMediana(entradas, meses, fontes)).toBe(700);
  });

  it('mês abaixo do típico conta como zero (não vira extra negativo) e mês sem entrada também', () => {
    const entradas = [e('2041-01', 4000), e('2041-02', 5300), e('2041-03', 5300), e('2041-04', 5300)];
    // extras: 0, 300, 300, 300, 0 (mai), 0 (jun) → mediana (0 + 300) / 2
    expect(receitaExtraMediana(entradas, meses, fontes)).toBe(150);
  });

  it('entrada fora dos meses-base (o mês em andamento) não conta; sem meses-base dá zero', () => {
    expect(receitaExtraMediana([e('2041-07', 9000)], meses, fontes)).toBe(0);
    expect(receitaExtraMediana([e('2041-01', 9000)], [], fontes)).toBe(0);
  });
});

describe('comExtras', () => {
  const base = {
    saldoContasAtual: 0, fontesReceita: fontes, receitaExtraMediana: 700,
    despesaVariavelMediaMensal: 0, creditoNovoMedio: 0, despesaCasaPorCategoria: {}, creditoPorVencimento: {}, faturaReal: {},
    compromissosManuais: [], compromissosCadastrados: [],
    mesCorrente: { recebidoPorFonte: {}, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0, agendadoRestante: 0, faturaJaPaga: 0, casaNoMesPorCategoria: {} },
  } as unknown as ProjecaoBase;

  it('os extras entram na receita dos meses futuros; o mês em andamento não muda', () => {
    const sem = computeProjecao(base, 2, '2041-07-10'), com = computeProjecao(comExtras(base), 2, '2041-07-10');
    expect(com[0].receita).toBe(sem[0].receita);
    expect(com[1].receita).toBe(sem[1].receita + 700);
    expect(com[2].saldoProjetado).toBe(sem[2].saldoProjetado + 1400);
  });

  it('sem extra medido, devolve a própria base', () => {
    const b = { ...base, receitaExtraMediana: 0 };
    expect(comExtras(b)).toBe(b);
  });
});
