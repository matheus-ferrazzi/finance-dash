import { describe, expect, it } from 'vitest';
import { agruparDividas, avaliarTrilha, chaveDivida, ehAtraso, ehDivida, marcaDinheiro, mesesComContaNegativa, partesDoTexto, validarMeta, type DadosTrilha } from '../../src/lib/trilha';

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
    // Onda 2: IOF do rotativo é encargo de atraso
    expect(ehAtraso('IOF ADIC ROTATIVO/ATRASO', 'Tax on financial operations')).toBe(true);
    expect(ehAtraso('JUROS ROTATIVO', null)).toBe(true);
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
      { chave: 'renegociação de pendências|B1', nome: 'renegociação de pendências', banco: 'B1', plano: null, valorParcela: 100, restantes: 2, fim: '2026-12' },
      { chave: 'prest de emprest financiamento parc|B2', nome: 'prest de emprest financiamento parc', banco: 'B2', plano: null, valorParcela: 50, restantes: null, fim: null },
    ]);
  });
  // auditoria 13/10 (N9): dois planos com a mesma descrição no mesmo banco (um de 3 e outro de 8 parcelas) viravam um só
  // (só a última parcela e "faltam 7"), escondendo os meses em que os dois se somam
  it('planos diferentes da mesma dívida (parcela_total) ficam separados; a chave da marcação é a mesma', () => {
    const p = (data: string, valor: number, parcelaTotal: number) => ({ ...l('Renegociação de pendências', data, valor, 'Crédito', 'Nubank', 'Loans and financing'), parcelaTotal });
    const r = agruparDividas([
      p('2026-11-07', 800.5, 3), p('2026-12-06', 800.5, 3),
      p('2026-11-07', 350.5, 8), p('2026-12-06', 350.5, 8), p('2027-01-10', 350.5, 8), p('2027-02-08', 350.5, 8), p('2027-03-06', 350.5, 8),
    ], '2026-10-13');
    expect(r.map((d) => [d.chave, d.plano, d.valorParcela, d.restantes, d.fim])).toEqual([
      ['renegociação de pendências|Nubank', 3, 800.5, 2, '2026-12'],
      ['renegociação de pendências|Nubank', 8, 350.5, 5, '2027-03'],
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
    const t = avaliarTrilha(dados({ dividas: [{ chave: 'reneg|B', nome: 'reneg', banco: 'B', plano: null, valorParcela: 10, restantes: 3, fim: '2027-03' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases[0]).toMatchObject({ status: 'atual', quando: 'mar/27' });
    expect(t.fases[0].proximoPasso).toContain('mar/27');
    expect(t.fases[1].status).toBe('cumprida'); // sobra já cumprida aparece como cumprida mesmo depois da atual
  });
  it('dívida sem fim conhecido e atraso: quando sem data; atraso conta até 2 meses depois', () => {
    expect(avaliarTrilha(dados({ dividas: [{ chave: 'emp|B', nome: 'emp', banco: 'B', plano: null, valorParcela: 10, restantes: null, fim: null }] })).fases[0].quando).toBe('sem data de fim conhecida');
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
    expect(t.reserva).toEqual({ meta: 1200, aplicado: 0, ritmo: 100, meses: 6 });
    expect(t.fases[2].quando).toBe('out/27');
    expect(t.fases[2].proximoPasso).toContain('/mês completa a reserva em out/27');
    const resgate = avaliarTrilha(dados({ aplicacaoMensal: [{ mes: '2026-09', valor: -50 }] }));
    expect(resgate.fases[2].quando).toBe('sem previsão');
  });
  // N18 (auditoria 13/10): o card dizia "Quando: ago/28" (ritmo de hoje) e "completa em out/27" (aplicando X/mês)
  // sem dizer que eram bases diferentes
  it('N18: quando o ritmo de hoje e o "aplicando X/mês" dão datas diferentes, o passo diz as duas bases', () => {
    const t = avaliarTrilha(dados({ aplicacaoMensal: [{ mes: '2026-09', valor: 40 }] })); // 1200 / 40 = 30 meses
    expect(t.fases[2].quando).toBe('abr/29');
    expect(t.fases[2].proximoPasso).toContain('No ritmo de hoje, abr/29.');
    expect(t.fases[2].proximoPasso).toContain('completa a reserva em out/27');
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
    const t = avaliarTrilha(dados({ aplicado: 5000, dividas: [{ chave: 'nova|B', nome: 'nova', banco: 'B', plano: null, valorParcela: 1, restantes: 1, fim: '2026-11' }] }));
    expect(t.atual).toBe(1);
    expect(t.fases.map((f) => f.status)).toEqual(['atual', 'cumprida', 'cumprida', 'depois']);
  });
});

describe('valor dentro do texto (para o olho de esconder valores)', () => {
  it('o próximo passo marca o valor em vez de formatá-lo; as partes separam texto e valor', () => {
    const t = avaliarTrilha(dados());
    expect(t.fases[2].proximoPasso).toBe(`Aplicar ${marcaDinheiro(100)}/mês completa a reserva em out/27.`);
    expect(partesDoTexto(t.fases[2].proximoPasso)).toEqual(['Aplicar ', 100, '/mês completa a reserva em out/27.']);
    expect(partesDoTexto('sem valor')).toEqual(['sem valor']);
    expect(partesDoTexto(`${marcaDinheiro(-12.5)} e ${marcaDinheiro(3)}`)).toEqual([-12.5, ' e ', 3]);
  });
});

describe('marcações de dívida', () => {
  const l = (descricao: string, data: string, valor: number, forma = 'Crédito', banco = 'B1', categoria: string | null = null) => ({ descricao, categoria, banco, forma, data, valor });
  const lancs = [
    l('RENEGOCIAÇÃO DE PENDÊNCIAS 6/12', '2026-11-10', 100),
    l('LOJA X 3/10', '2026-12-01', 40),
  ];
  it('chave = descrição sem números + banco; DividaAtiva traz a chave', () => {
    expect(chaveDivida('LOJA X 3/10', 'B1')).toBe('loja x|B1');
    expect(agruparDividas(lancs, '2026-10-15')[0].chave).toBe('renegociação de pendências|B1');
  });
  it('"não é dívida" tira um grupo detectado; "é dívida" inclui um não detectado', () => {
    expect(agruparDividas(lancs, '2026-10-15', { nao: new Set(['renegociação de pendências|B1']), sim: new Set() })).toEqual([]);
    const sim = agruparDividas(lancs, '2026-10-15', { nao: new Set(), sim: new Set(['loja x|B1']) });
    expect(sim.map((d) => d.nome)).toEqual(['renegociação de pendências', 'loja x']);
  });
});

describe('metas da trilha', () => {
  it('metas gravadas mudam a meta da reserva e o texto do patrimônio; sem metas, o padrão', () => {
    const t = avaliarTrilha(dados({ metas: { mesesReserva: 3, metaPatrimonio: 0.2 } }));
    expect(t.reserva).toMatchObject({ meta: 600, meses: 3 });
    expect(t.patrimonio.meta).toBe(0.2);
    expect(t.fases[3].proximoPasso).toContain('Aplicar 20% do que entra');
    expect(avaliarTrilha(dados()).reserva).toMatchObject({ meta: 1200, meses: 6 });
  });
  it('"não é dívida" não apaga atraso: a fase 1 continua aberta com juros', () => {
    expect(avaliarTrilha(dados({ dividas: [], atrasos: [{ mes: '2026-09', motivo: 'juros' }] })).atual).toBe(1);
  });
  it('validarMeta: limites, vírgula, vazio, chave desconhecida', () => {
    expect(validarMeta('meses_reserva', '6')).toEqual({ ok: true, chave: 'meses_reserva', valor: 6 });
    expect(validarMeta('meses_reserva', 25)).toEqual({ ok: false, erro: 'Meses da reserva: número inteiro de 1 a 24.' });
    expect(validarMeta('meses_reserva', 2.5)).toEqual({ ok: false, erro: 'Meses da reserva: número inteiro de 1 a 24.' });
    expect(validarMeta('meses_reserva', '0x10')).toEqual({ ok: false, erro: 'Meses da reserva: número inteiro de 1 a 24.' });
    expect(validarMeta('meta_patrimonio', '1e1')).toEqual({ ok: false, erro: 'Patrimônio: de 1% a 50%.' });
    expect(validarMeta('meta_patrimonio', '12,5')).toEqual({ ok: true, chave: 'meta_patrimonio', valor: 0.125 });
    expect(validarMeta('meta_patrimonio', '')).toEqual({ ok: false, erro: 'Patrimônio: de 1% a 50%.' });
    expect(validarMeta('meta_patrimonio', 60)).toEqual({ ok: false, erro: 'Patrimônio: de 1% a 50%.' });
    expect(validarMeta('outra', 1)).toEqual({ ok: false, erro: 'Meta desconhecida.' });
  });
});


describe('pendências do F3 (auditoria 13/10)', () => {
  // (b) mês sem dado nenhum (receita 0 e sobra 0) contava como "sobrou"
  it('mês vazio não conta como mês que sobrou', () => {
    const t = avaliarTrilha(dados({ passados: [{ mes: '2026-07', sobra: 100, receita: 1000 }, { mes: '2026-08', sobra: 0, receita: 0 }, { mes: '2026-09', sobra: 10, receita: 1000 }] }));
    expect(t.sobra.cumpridos).toBe(2);
    expect(t.fases[1].status).not.toBe('cumprida');
  });
  // (c) o "quando" da fase 2 ignorava os meses fechados que já sobraram (atrasava)
  it('"quando" da fase 2 continua a sequência dos meses fechados que sobraram', () => {
    const t = avaliarTrilha(dados({
      passados: [{ mes: '2026-07', sobra: -5, receita: 1000 }, { mes: '2026-08', sobra: 50, receita: 1000 }, { mes: '2026-09', sobra: 10, receita: 1000 }],
      sobraPrevista: [{ mes: '2026-10', sobra: 10 }, { mes: '2026-11', sobra: 10 }, { mes: '2026-12', sobra: 10 }],
    }));
    // ago e set sobraram; out (previsto) fecha a sequência de 3
    expect(t.fases[1].quando).toBe('out/26');
  });
  // (a) dívida no cartão sem as parcelas futuras lançadas ainda sumia da trilha
  it('parcela n de m sem as futuras lançadas: continua aberta, com o fim estimado', () => {
    const l = { descricao: 'Renegociação de pendências', categoria: 'Loans and financing', banco: 'B', forma: 'Crédito', valor: 100, parcelaTotal: 8 };
    const r = agruparDividas([{ ...l, data: '2026-09-06', parcelaNumero: 2 }, { ...l, data: '2026-10-06', parcelaNumero: 3 }], '2026-10-15');
    expect(r).toEqual([{ chave: 'renegociação de pendências|B', nome: 'renegociação de pendências', banco: 'B', plano: 8, valorParcela: 100, restantes: 5, fim: '2027-03' }]);
  });
});
