import { describe, expect, it } from 'vitest';
import { computeProjecao, type ProjecaoBase } from '../../src/lib/previsao';

// auditoria 11/11: a fatura de um mês distante só tinha as parcelas já lançadas. O casal compra parcelado todo mês
// (medido: a soma das parcelas de compra fica estável), e a previsão caía para quase nada depois de 2–3 meses.
const base = (p: Partial<ProjecaoBase>): ProjecaoBase => ({
  saldoContasAtual: 0, fontesReceita: [], despesaVariavelMediaMensal: 0, creditoNovoMedio: 1000,
  despesaCasaPorCategoria: {}, creditoPorVencimento: {}, faturaReal: {}, compromissosManuais: [], compromissosCadastrados: [],
  mesCorrente: { recebidoPorFonte: {}, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0, agendadoRestante: 0, faturaJaPaga: 0, casaNoMesPorCategoria: {} },
  ...p,
} as unknown as ProjecaoBase);

describe('parcelas de compras futuras na fatura prevista', () => {
  const b = base({
    creditoPorVencimento: { '2041-08': 900, '2041-09': 450, '2041-10': 100 },
    parcelasCompraMedia: 600,
    parcelasCompraPorVencimento: { '2041-08': 650, '2041-09': 400, '2041-10': 100 },
  });
  const p = computeProjecao(b, 4, '2041-07-31');

  it('mês em que as parcelas já lançadas passam da média: nada a acrescentar', () => {
    expect(p[1].fatura).toBe(900); // 31/07: não falta dia no mês para compra nova à vista
  });
  it('2 meses à frente a fatura já está quase definida pelas compras feitas: nada a acrescentar (medido no backtest)', () => {
    expect(p[2].fatura).toBe(450 + 1000);
  });
  it('de 3 meses em diante, parcelas lançadas abaixo da média: entra a diferença (as que ainda vão ser contratadas)', () => {
    expect(p[3].fatura).toBe(100 + 1000 + 500);
  });
  it('mês sem nenhuma parcela lançada: a média inteira', () => {
    expect(p[4].fatura).toBe(1000 + 600);
  });
  it('fatura real conhecida manda: nada é acrescentado', () => {
    const q = computeProjecao({ ...b, faturaReal: { '2041-09': 777 } }, 2, '2041-07-31');
    expect(q[2].fatura).toBe(777);
  });
  it('sem a média medida (base antiga), a fatura fica como era', () => {
    const q = computeProjecao(base({ creditoPorVencimento: { '2041-09': 450 } }), 2, '2041-07-31');
    expect(q[2].fatura).toBe(1450);
  });
});
