import { describe, expect, it } from 'vitest';
import { classificar, corrigirCategoria } from '../../src/worker/classificar';
import { compararClassificacao, extrairFuncoesAntigas } from '../../src/worker/equivalencia';
import { contaFake, txFake } from './fakes';

// jsCode no formato do nó do n8n: mapa, funções e o corpo com $input
const jsCode = (corpoCorrigir: string) => `const mapaContas = {};
function corrigirCategoria(cat, desc) { ${corpoCorrigir} }
${classificar.toString()}
const dadosBrutos = $input.all();
return [];`;

describe('equivalência', () => {
  const itens = [
    { t: txFake('1', '2026-09-01', { description: 'IFD*IFOOD', category: 'Restaurants' }), conta: contaFake() },
    { t: txFake('2', '2026-09-01', { description: 'PIX ARIANE', category: 'Transfer - PIX' }), conta: contaFake({ forma: 'Débito' }) },
  ];

  it('extrai as funções sem executar o corpo do nó', () => {
    const antigas = extrairFuncoesAntigas(jsCode(`return ${JSON.stringify('X')};`));
    expect(antigas.corrigirCategoria('a', 'b')).toBe('X');
  });

  it('zero divergência quando o código é o mesmo', () => {
    const corpo = corrigirCategoria.toString().replace(/^[^{]*\{/, '').replace(/\}\s*$/, '');
    const r = compararClassificacao(extrairFuncoesAntigas(jsCode(corpo)), itens);
    expect(r).toEqual({ total: 2, divergemCategoria: 0, divergemClasse: 0, exemplos: [] });
  });

  it('acusa divergência e dá o id como exemplo', () => {
    const r = compararClassificacao(extrairFuncoesAntigas(jsCode('return cat;')), itens);
    expect(r.divergemCategoria).toBe(1);
    expect(r.exemplos).toEqual(['1']);
  });
});
