import { describe, expect, it } from 'vitest';
import { agruparDividas, avaliarTrilha, ehAtraso, ehDivida, mesesComContaNegativa, type DadosTrilha } from '../../src/lib/trilha';

describe('o que é dívida', () => {
  it('renegociação, parcelamento de fatura, empréstimo e financiamento são dívida', () => {
    expect(ehDivida('RENEGOCIAÇÃO DE PENDÊNCIAS 3/12', 'Transfers')).toBe(true);
    expect(ehDivida('Renegociacao de divida', null)).toBe(true);
    expect(ehDivida('PARCELAMENTO DE FATURA 2/6', 'Credit card payment')).toBe(true);
    expect(ehDivida('PARC.FATURA 01/04', null)).toBe(true);
    expect(ehDivida('PREST. DE EMPREST. FINANCIAMENTO PARC 3 10', 'Loans and financing')).toBe(true);
    expect(ehDivida('qualquer coisa', 'Loans')).toBe(true);
    expect(ehDivida('PAGAMENTO EMPRÉSTIMO PESSOAL', 'Transfers')).toBe(true); // com acento
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

const dados = (p: Partial<DadosTrilha> = {}): DadosTrilha => ({
  hoje: '2026-10-15', dividas: [], atrasos: [],
  passados: [{ mes: '2026-07', sobra: 100, receita: 1000 }, { mes: '2026-08', sobra: 50, receita: 1000 }, { mes: '2026-09', sobra: 10, receita: 1000 }],
  sobraPrevista: [{ mes: '2026-11', sobra: 10 }, { mes: '2026-12', sobra: 10 }, { mes: '2027-01', sobra: 10 }],
  textoMeta: 'meta do débito', gastoTravado: { fixos: 100, casa: 50, debitoTravado: 50 },
  aplicado: 0, aplicacaoMensal: [{ mes: '2026-07', valor: 100 }, { mes: '2026-08', valor: 100 }, { mes: '2026-09', valor: 100 }],
  ...p,
});

describe('avaliar a trilha', () => {
  it('com dívida: fase 1 atual, quando = última parcela, próximo passo cita o mês', () => {
    const t = avaliarTrilha(dados({ dividas: [{ nome: 'reneg', banco: 'B', valorParcela: 10, restantes: 3, fim: '2027-03' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases[0]).toMatchObject({ status: 'atual', quando: 'mar/27' });
    expect(t.fases[0].proximoPasso).toContain('mar/27');
    expect(t.fases[1].status).toBe('cumprida'); // sobra já cumprida aparece como cumprida mesmo depois da atual
  });
  it('dívida sem fim conhecido e atraso: quando sem data; atraso conta até 2 meses depois', () => {
    expect(avaliarTrilha(dados({ dividas: [{ nome: 'emp', banco: 'B', valorParcela: 10, restantes: null, fim: null }] })).fases[0].quando).toBe('sem data de fim conhecida');
    const t = avaliarTrilha(dados({ atrasos: [{ mes: '2026-09', motivo: 'juros' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases[0].quando).toBe('nov/26');
    expect(t.fases[0].proximoPasso).toContain('set/26');
  });
  it('sem dívida e sem atraso: fase 1 cumprida; com sobra negativa num dos 3 meses a fase 2 é a atual', () => {
    const t = avaliarTrilha(dados({ passados: [{ mes: '2026-07', sobra: 100, receita: 1000 }, { mes: '2026-08', sobra: -1, receita: 1000 }, { mes: '2026-09', sobra: 10, receita: 1000 }] }));
    expect(t.atual).toBe(2);
    expect(t.fases[0].status).toBe('cumprida');
    expect(t.sobra.cumpridos).toBe(2);
    expect(t.fases[1]).toMatchObject({ quando: 'jan/27', proximoPasso: 'meta do débito' });
  });
  it('previsão sem 3 sobras seguidas em 24 meses; menos de 3 meses fechados não cumpre', () => {
    const t = avaliarTrilha(dados({ passados: [], sobraPrevista: [{ mes: '2026-11', sobra: 1 }, { mes: '2026-12', sobra: -1 }, { mes: '2027-01', sobra: 1 }] }));
    expect(t.atual).toBe(2);
    expect(t.fases[1].quando).toBe('pela previsão, não acontece em 24 meses');
    expect(t.sobra.cumpridos).toBe(0);
  });
  it('reserva: meta = 6 × gasto travado; ritmo da aplicação dá a data; sem aplicação, sem previsão', () => {
    const t = avaliarTrilha(dados()); // meta 6 × 200 = 1200, aplicado 0, ritmo 100 → 12 meses
    expect(t.atual).toBe(3);
    expect(t.reserva).toEqual({ meta: 1200, aplicado: 0, ritmo: 100 });
    expect(t.fases[2].quando).toBe('out/27');
    expect(t.fases[2].proximoPasso).toContain('/mês completa a reserva em out/27');
    const resgate = avaliarTrilha(dados({ aplicacaoMensal: [{ mes: '2026-09', valor: -50 }] }));
    expect(resgate.fases[2].quando).toBe('sem previsão');
  });
  it('reserva completa: fase 4 é a atual; % da renda aplicada; receita zero não quebra', () => {
    const t = avaliarTrilha(dados({ aplicado: 5000 }));
    expect(t.atual).toBe(4);
    expect(t.fases[2]).toMatchObject({ status: 'cumprida', proximoPasso: 'Reserva completa: manter.' });
    expect(t.patrimonio).toEqual({ pct: 0.1, meta: 0.1 });
    const semRenda = avaliarTrilha(dados({ aplicado: 5000, passados: [] }));
    expect(semRenda.patrimonio.pct).toBe(0);
    expect(semRenda.fases[3].proximoPasso).not.toContain('NaN');
  });
  it('fase cumprida que volta a falhar reabre (dívida nova com sobra e reserva em dia)', () => {
    const t = avaliarTrilha(dados({ aplicado: 5000, dividas: [{ nome: 'nova', banco: 'B', valorParcela: 1, restantes: 1, fim: '2026-11' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases.map((f) => f.status)).toEqual(['atual', 'cumprida', 'cumprida', 'depois']);
  });
});
