import { describe, expect, it } from 'vitest';
import { comTentativas, lerPrecosTesouro, precoDoTitulo, tituloDoNome } from '../../src/worker/tesouro';

// 17/10: título do Tesouro de conexão desligada (o Inter saiu do Meu Pluggy) — valor bruto pelo preço público
const CSV = [
  'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
  'Tesouro Selic;01/03/2027;14/10/2026;0,01;0,02;20087,72;20076,71;20076,71',
  'Tesouro Selic;01/03/2027;15/10/2026;0,01;0,02;20097,80;20086,80;20086,80',
  'Tesouro IPCA+;15/05/2035;15/10/2026;6,84;6,96;2713,48;2686,72;2686,72',
  'Tesouro IPCA+;15/05/2035;14/10/2026;6,74;6,86;2734,26;2706,76;2706,76',
  'Tesouro Prefixado;01/01/2029;15/10/2026;13,1;13,2;0,00;700,10;700,10',
  'Tesouro IPCA+ com Juros Semestrais;15/05/2035;15/10/2026;6,5;6,6;4400,00;4380,00;4380,00',
  // dois vencimentos do mesmo tipo no mesmo ano: ambíguo pelo nome
  'Tesouro Renda+ Aposentadoria Extra;15/01/2030;15/10/2026;6;6,1;1000,00;990,00;990,00',
  'Tesouro Renda+ Aposentadoria Extra;15/12/2030;15/10/2026;6;6,1;1100,00;1090,00;1090,00',
  '',
].join('\r\n');

describe('tituloDoNome', () => {
  it('nome da Pluggy (código - nome comercial ano) vira o tipo da planilha e o ano', () => {
    expect(tituloDoNome('LFT - Tesouro Selic 2027')).toEqual({ tipo: 'Tesouro Selic', ano: 2027 });
    expect(tituloDoNome('NTN-B Princ - Tesouro IPCA 2035')).toEqual({ tipo: 'Tesouro IPCA+', ano: 2035 });
    expect(tituloDoNome('NTN-B - Tesouro IPCA com Juros 2035')).toEqual({ tipo: 'Tesouro IPCA+ com Juros Semestrais', ano: 2035 });
    expect(tituloDoNome('LTN - Tesouro Prefixado 2029')).toEqual({ tipo: 'Tesouro Prefixado', ano: 2029 });
    expect(tituloDoNome('NTN-F - Tesouro Prefixado com Juros 2035')).toEqual({ tipo: 'Tesouro Prefixado com Juros Semestrais', ano: 2035 });
  });
  it('fora do Tesouro ou sem ano: null', () => {
    expect(tituloDoNome('INTER CONSERVADOR PLUS FIRF LP')).toBeNull();
    expect(tituloDoNome('LFT - Tesouro Selic')).toBeNull();
  });
});

describe('lerPrecosTesouro / precoDoTitulo', () => {
  const precos = lerPrecosTesouro(CSV);
  it('o preço de resgate (PU venda) da data mais recente de cada título', () => {
    expect(precoDoTitulo(precos, { tipo: 'Tesouro Selic', ano: 2027 })).toEqual({ data: '2026-10-15', pu: 20086.8 });
    expect(precoDoTitulo(precos, { tipo: 'Tesouro IPCA+', ano: 2035 })).toEqual({ data: '2026-10-15', pu: 2686.72 });
    expect(precoDoTitulo(precos, { tipo: 'Tesouro IPCA+ com Juros Semestrais', ano: 2035 })).toEqual({ data: '2026-10-15', pu: 4380 });
  });
  it('sem preço ou ambíguo (dois vencimentos no ano): null', () => {
    expect(precoDoTitulo(precos, { tipo: 'Tesouro Selic', ano: 2031 })).toBeNull();
    expect(precoDoTitulo(precos, { tipo: 'Tesouro Renda+ Aposentadoria Extra', ano: 2030 })).toBeNull();
  });
});

// 22/10: o download do Tesouro falhou uma vez às 23h ("fetch failed", rede) e a rodada inteira se perdeu
describe('comTentativas', () => {
  it('tenta de novo depois de esperar; devolve a primeira que dá certo', async () => {
    let n = 0; const esperas: number[] = [];
    const r = await comTentativas(async () => { n++; if (n < 3) throw new Error('fetch failed'); return 'ok'; }, 3, 30000, async (ms) => { esperas.push(ms); });
    expect(r).toBe('ok');
    expect(esperas).toEqual([30000, 30000]);
  });
  it('todas falham: lança o último erro, dizendo quantas tentativas', async () => {
    await expect(comTentativas(async () => { throw new Error('fetch failed'); }, 3, 1, async () => {})).rejects.toThrow('fetch failed (3 tentativas)');
  });
});
