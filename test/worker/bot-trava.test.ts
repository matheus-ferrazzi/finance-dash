import { describe, expect, it } from 'vitest';
import { respostaConfere, valoresBRL } from '../../src/worker/bot/trava';

describe('valoresBRL', () => {
  it('lê R$ com milhar, centavos e sinal', () => {
    expect(valoresBRL('Gastaram R$ 1.234,56 e -R$ 50 e R$ -7,5; nada de 300 sem R$')).toEqual([1234.56, -50, -7.5]);
  });
});

describe('respostaConfere', () => {
  const res = [{ total: 1234.56, itens: [{ nome: 'Mercado', valor: 53.63 }] }];
  it('valor igual ou arredondado ao inteiro: confere; sinal ignorado', () => {
    expect(respostaConfere('🛒 Mercado: R$ 53,63 e total R$ 1.234,56', res)).toBe(true);
    expect(respostaConfere('Mercado deu R$ 54', res)).toBe(true);
    expect(respostaConfere('Faltou R$ 1.234,56', res)).toBe(true);
  });
  it('valor que não veio de ferramenta (soma, invenção): não confere', () => {
    expect(respostaConfere('Juntos dá R$ 1.288,19', res)).toBe(false);
  });
  it('sem R$: confere', () => {
    expect(respostaConfere('Vocês estão na fase 1.', res)).toBe(true);
  });
});
