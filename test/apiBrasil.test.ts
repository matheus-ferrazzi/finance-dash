import { describe, expect, it } from 'vitest';
import { consultarCredito, consultarSerasa, lerDossie, lerEndividamento, lerSerasa, numBR, ocorrenciaParaDivida } from '../src/lib/apiBrasil';

// 14/11: consulta de crédito na API Brasil. Valores e nomes inventados; CPF de exemplo da documentação.
const OK = { codigo: '1', descricao: 'CONSULTA CONCLUIDA COM SUCESSO' };
const CADASTRO = { dados_receita_federal: { nome: 'FULANO DE TAL', nome_mae: 'CICLANA' }, identificacao_pessoa_fisica: { end_logradouro: 'RUA X' } };

function dossie(ocorrencias: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    error: false, homolog: false, valor_consulta: '4,40', user: { email: 'x@y' },
    data: { credcadastral: {
      ...CADASTRO,
      pend_financeiras: { status_retorno: OK, quantidade_ocorrencia: String(ocorrencias.length), ocorrencias },
      protestos: { status_retorno: OK, quantidade_ocorrencia: '0', ocorrencias: [] },
      ch_sem_fundos_bacen: { status_retorno: OK, quantidade_ocorrencia: '0', ocorrencias: [] },
      somente_telefone: { dados: [{ num_telefone: '999' }] },
      ...extra,
    }, pdf: 'https://x/relatorio.pdf' },
  };
}
function endividamento(c: { prejuizo?: string; vencido?: string; score?: string } = {}) {
  return {
    error: false, homolog: false, valor_consulta: 4.8,
    data: { credcadastral: { relatorio_scr: {
      status_retorno: OK, nome_razao_social: 'FULANO', documento: '123', database_consultada: '9/2026',
      quantidade_instituicoes: '3', quantidade_operacoes: '5',
      consolidado: {
        credito_avencer: { valor_total: '12.345,67' }, credito_vencido: { valor_total: c.vencido ?? '0' },
        limite_credito: { valor_total: '1.000,00' }, prejuizo: { valor_total: c.prejuizo ?? '0' },
      },
      score: c.score === undefined ? { pontuacao: '432', faixa: 'BAIXO' } : { pontuacao: c.score, faixa: '' },
    } } },
  };
}

describe('numBR', () => {
  it('lê texto brasileiro e números', () => {
    expect(numBR('1.234,56')).toBe(1234.56);
    expect(numBR('R$ 99,90')).toBe(99.9);
    expect(numBR('100')).toBe(100);
    expect(numBR(4.8)).toBe(4.8);
    expect(numBR('')).toBe(0);
    expect(numBR(undefined)).toBe(0);
    expect(numBR('abc')).toBe(0);
  });
});

describe('ocorrenciaParaDivida', () => {
  it('acha credor, valor, contrato e data pelos nomes prováveis; chave sem o valor', () => {
    const a = ocorrenciaParaDivida({ credor: 'Banco Exemplo  S.A.', valor: '1.500,00', contrato: 'AB-1', data_vencimento: '10/03/2024' }, 'pend_financeiras')!;
    expect(a).toMatchObject({ credor: 'Banco Exemplo  S.A.', valor: 1500, negativada: true, chave: 'pend_financeiras|banco exemplo s.a.|ab-1|10/03/2024' });
    const b = ocorrenciaParaDivida({ credor: 'Banco Exemplo S.A.', valor: '1.900,00', contrato: 'AB-1', data_vencimento: '10/03/2024' }, 'pend_financeiras')!;
    expect(b.chave).toBe(a.chave);
    expect(ocorrenciaParaDivida({ informante: { descricao: 'LOJA Y' }, valor_pendencia: 80 }, 'pend_financeiras')?.credor).toBe('LOJA Y');
  });
  it('sem credor ou sem valor: null', () => {
    expect(ocorrenciaParaDivida({ valor: '10,00' }, 'protestos')).toBeNull();
    expect(ocorrenciaParaDivida({ credor: 'X', valor: '' }, 'protestos')).toBeNull();
    expect(ocorrenciaParaDivida(null, 'protestos')).toBeNull();
  });
});

describe('lerDossie', () => {
  it('guarda só os blocos de dívida (nada de cadastro nem telefone) e conta o que não leu', () => {
    const r = lerDossie(dossie([{ credor: 'Loja A', valor: '200,00' }, { campo_estranho: 'x' }]));
    expect(Object.keys(r.pendencias).sort()).toEqual(['ch_sem_fundos_bacen', 'pend_financeiras', 'protestos']);
    expect(JSON.stringify(r.pendencias)).not.toMatch(/FULANO|CICLANA|RUA X|999/);
    expect(r.dividas.map((d) => [d.credor, d.valor])).toEqual([['Loja A', 200]]);
    expect(r.naoLidas).toBe(1);
  });
  it('quantidade declarada maior que a lista: as que faltam contam como não lidas', () => {
    const d = dossie([{ credor: 'Loja A', valor: '200,00' }]);
    (d.data.credcadastral.pend_financeiras as any).quantidade_ocorrencia = '3';
    expect(lerDossie(d).naoLidas).toBe(2);
  });
  it('a mesma dívida repetida soma numa linha só', () => {
    const r = lerDossie(dossie([{ credor: 'Loja A', valor: '200,00', contrato: '1' }, { credor: 'Loja A', valor: '50,00', contrato: '1' }]));
    expect(r.dividas).toHaveLength(1);
    expect(r.dividas[0].valor).toBe(250);
  });
  // protesto só no sintético, sem credor nem cedente
  const sintetico = (valor: string) => ({ protesto_sintetico: { status_retorno: OK, quantidade_ocorrencia: '1', valor_total: valor, ocorrencias: [
    { uf: 'SP', valor, credor: '', cedente: '', comarca: 'CIDADE X', cartorio: '007', data_ocorrencia: '01/02/2025', endereco: '', telefone: '' },
  ] } });
  it('protesto só no sintético vira dívida negativada, com o cartório no lugar do credor', () => {
    const r = lerDossie(dossie([], sintetico('1234,5')));
    expect(r.dividas).toEqual([{
      credor: 'Protesto em cartório 7º de CIDADE X/SP', valor: 1234.5, negativada: true,
      chave: 'protesto_sintetico|protesto em cartorio 7º de cidade x/sp||01/02/2025', observacao: 'protesto na consulta · data 01/02/2025',
    }]);
    expect(r.naoLidas).toBe(0);
  });
  it('com o protesto detalhado preenchido, o sintético não conta de novo', () => {
    const d = dossie([], sintetico('1234,5'));
    (d.data.credcadastral as any).protestos = { status_retorno: OK, quantidade_ocorrencia: '1', ocorrencias: [{ cedente: 'Loja Z', valor: '1234,50', cartorio: '7' }] };
    expect(lerDossie(d).dividas.map((x) => x.credor)).toEqual(['Loja Z']);
  });

  it('fonte de pendências sem sucesso é erro (não "nada consta")', () => {
    const d = dossie();
    (d.data.credcadastral.pend_financeiras as any).status_retorno = { codigo: '9', descricao: 'FONTE INDISPONIVEL' };
    expect(() => lerDossie(d)).toThrow(/FONTE INDISPONIVEL/);
  });
});

describe('lerEndividamento', () => {
  it('resume o SCR com score; o bruto vai sem nome nem documento', () => {
    const r = lerEndividamento(endividamento({ prejuizo: '3.210,00' }));
    expect(r.scr).toEqual({ aVencer: 12345.67, vencido: 0, prejuizo: 3210, limite: 1000, instituicoes: 3, operacoes: 5, database: '9/2026' });
    expect([r.score, r.faixa]).toEqual([432, 'BAIXO']);
    expect(r.bruto).not.toHaveProperty('nome_razao_social');
    expect(r.bruto).not.toHaveProperty('documento');
    expect(r.bruto).toHaveProperty('consolidado');
  });
  it('consolidado zerado com operações de valor: "a vencer" é a soma delas, marcado', () => {
    const e = endividamento();
    const rel = (e.data.credcadastral.relatorio_scr as any);
    rel.consolidado.credito_avencer.valor_total = '0';
    rel.operacoes = [{ total: '700,00' }, { total: '1.300,00' }];
    const r = lerEndividamento(e);
    expect(r.scr).toMatchObject({ aVencer: 2000, porOperacao: true });
  });
  it('score vazio vira null', () => {
    expect(lerEndividamento(endividamento({ score: '' })).score).toBeNull();
  });
});

describe('consultarCredito', () => {
  function fetchFalso(respostas: { status: number; body: unknown }[]) {
    const corpos: any[] = [];
    const fn = (async (_u: unknown, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body)));
      const r = respostas.shift()!;
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch;
    return { fn, corpos };
  }
  const base = { cpf: '12345678909', token: 't', homolog: false };

  it('dossiê e SCR: soma o custo, junta as dívidas e põe prejuízo/vencido do SCR sem negativar', async () => {
    const f = fetchFalso([{ status: 200, body: dossie([{ credor: 'Loja A', valor: '200,00' }]) }, { status: 200, body: endividamento({ prejuizo: '3.210,00', vencido: '10,00' }) }]);
    const r = await consultarCredito({ ...base, fetchFn: f.fn });
    expect(f.corpos.map((c) => c.tipo)).toEqual(['dossie-credito-pf', 'endividamento-pf']);
    expect(f.corpos[0]).toMatchObject({ cpf: '12345678909', homolog: false });
    expect(r.custo).toBe(9.2);
    expect(r.dividas.map((d) => [d.chave.split('|')[0], d.valor, d.negativada])).toEqual([
      ['pend_financeiras', 200, true], ['scr', 3210, false], ['scr', 10, false],
    ]);
    expect(r.avisos).toEqual([]);
  });

  it('erro com HTTP 200 (error: true) vira erro com a mensagem', async () => {
    const f = fetchFalso([{ status: 200, body: { error: true, message: 'algo' } }]);
    await expect(consultarCredito({ ...base, fetchFn: f.fn })).rejects.toThrow('algo');
  });

  it('402: sem saldo, mensagem clara', async () => {
    const f = fetchFalso([{ status: 402, body: { error: true, message: 'saldo' } }]);
    await expect(consultarCredito({ ...base, fetchFn: f.fn })).rejects.toMatchObject({ status: 402, message: expect.stringMatching(/Sem saldo/) });
  });

  it('resposta em homologação quando se pediu produção é erro (nada fictício vira dívida)', async () => {
    const f = fetchFalso([{ status: 200, body: { ...dossie(), homolog: true } }]);
    await expect(consultarCredito({ ...base, fetchFn: f.fn })).rejects.toThrow(/homologação/);
  });

  it('SCR falha depois do dossiê já cobrado: o resultado sai sem SCR, com aviso', async () => {
    const f = fetchFalso([{ status: 200, body: dossie([{ credor: 'Loja A', valor: '200,00' }]) }, { status: 503, body: { error: true } }]);
    const r = await consultarCredito({ ...base, fetchFn: f.fn });
    expect(r.scr).toBeNull();
    expect(r.custo).toBe(4.4);
    expect(r.dividas).toHaveLength(1);
    expect(r.avisos[0]).toMatch(/SCR e score ficaram de fora/);
    expect(r.fontes).toEqual(['pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico']);
  });

  it('soScr: só o endividamento; sem dossiê nas fontes; SCR que falha é erro', async () => {
    const f = fetchFalso([{ status: 200, body: endividamento({ prejuizo: '10,00' }) }]);
    const r = await consultarCredito({ ...base, soScr: true, fetchFn: f.fn });
    expect(f.corpos.map((c) => c.tipo)).toEqual(['endividamento-pf']);
    expect(r).toMatchObject({ custo: 4.8, fontes: ['scr'], pendencias: {} });
    expect(r.dividas.map((d) => d.chave)).toEqual(['scr|prejuizo']);
    const g = fetchFalso([{ status: 503, body: { error: true } }]);
    await expect(consultarCredito({ ...base, soScr: true, fetchFn: g.fn })).rejects.toThrow();
  });
});

// 14/11: a consulta do botão passou a ser a Serasa (o dossiê pode não trazer o que a Serasa traz). Valores inventados.
describe('Serasa (restricoes-serasa)', () => {
  const serasa = (p: Record<string, unknown> = {}) => ({
    error: false, homolog: false, valor_consulta: 16.88,
    data: {
      titular: { nome: 'FULANO DE TAL', data_nascimento: '1990-01-01' }, documento: '12345678909', tipo_documento: 'cpf',
      possui_restricao: true, bases_com_restricao: ['serasa', 'protestos'], bases_sem_resposta: [],
      resumo: { total_ocorrencias: 2, valor_total: 1300 },
      ocorrencias: [
        { avalista: false, base: 'serasa', credor: 'FUNDO EXEMPLO', contrato: null, data_inclusao: '2024-01-15', data_ocorrencia: '2024-01-15', modalidade: 'CRED CARTAO', tipo: 'PEFIN', valor: 1000 },
        { avalista: null, base: 'protestos', credor: 'Cartório 09 - CIDADE X/SP', contrato: null, data_inclusao: null, data_ocorrencia: '2025-05-02', modalidade: null, tipo: null, valor: 300 },
      ],
      scores: [{ base: 'serasa', valor: 480 }], classificacao_risco: null,
      ...p,
    },
  });

  it('negativação e protesto viram dívidas negativadas; score da Serasa; nada do titular', () => {
    const r = lerSerasa(serasa());
    expect(r.dividas).toEqual([
      { credor: 'FUNDO EXEMPLO', valor: 1000, negativada: true, chave: 'serasa|fundo exemplo||2024-01-15', observacao: 'Serasa: pefin, cred cartao · desde 15/01/2024' },
      { credor: 'Cartório 09 - CIDADE X/SP', valor: 300, negativada: true, chave: 'protestos|cartorio 09 - cidade x/sp||2025-05-02', observacao: 'protesto (Serasa) · desde 02/05/2025' },
    ]);
    expect(r.score).toBe(480);
    expect(r.fontes).toEqual(['serasa', 'pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico']);
    expect(JSON.stringify(r.pendencias)).not.toMatch(/FULANO|1990-01-01|12345678909/);
    expect(r.naoLidas).toBe(0);
  });

  it('base sem resposta sai das fontes (o que veio dela antes não é dado por limpo) e gera aviso', () => {
    const r = lerSerasa(serasa({ bases_sem_resposta: ['protestos'] }));
    expect(r.fontes).toEqual(['serasa', 'pend_financeiras', 'pend_refin']);
    expect(r.avisos[0]).toMatch(/protestos/);
    expect(() => lerSerasa(serasa({ bases_sem_resposta: ['serasa', 'protestos'] }))).toThrow(/nem a Serasa/);
  });

  it('ocorrência sem credor ou valor conta como não lida; total declarado maior também', () => {
    const r = lerSerasa(serasa({ ocorrencias: [{ base: 'serasa', credor: '', valor: 10 }], resumo: { total_ocorrencias: 3 } }));
    expect(r.dividas).toEqual([]);
    expect(r.naoLidas).toBe(3);
  });

  it('consultarSerasa: endereço próprio, CPF em "documento", custo da resposta', async () => {
    let url = '';
    let corpo: any = null;
    const fn = (async (u: unknown, init?: RequestInit) => {
      url = String(u); corpo = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(serasa()), { status: 200 });
    }) as typeof fetch;
    const r = await consultarSerasa({ cpf: '12345678909', token: 't', homolog: false, fetchFn: fn });
    expect(url).toBe('https://gateway.apibrasil.io/api/v2/consulta/restricoes-serasa/credits');
    expect(corpo).toEqual({ tipo: 'restricoes-serasa', documento: '12345678909', homolog: false });
    expect(r.custo).toBe(16.88);
    expect(r.dividas).toHaveLength(2);
  });
});
