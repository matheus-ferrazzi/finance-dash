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

describe('trava: revisão E1', () => {
  it('número grande sem separador de milhar é lido inteiro', () => {
    expect(valoresBRL('R$ 12345 e R$1234,56 e R$ 1.500')).toEqual([12345, 1234.56, 1500]);
  });
  it('sinal: resultado negativo dito como positivo sem "-"/negativo/vermelho na linha não confere', () => {
    const res = [{ fechaCom: -1500 }];
    expect(respostaConfere('📈 out/26 fecha com sobra de R$ 1.500', res)).toBe(false);
    expect(respostaConfere('📉 out/26 fecha em -R$ 1.500', res)).toBe(true);
    expect(respostaConfere('📉 fecha no vermelho em R$ 1.500', res)).toBe(true);
    expect(respostaConfere('Sobra de R$ 200', [{ total: -200 }])).toBe(false);
  });
  it('só campos de dinheiro valem como R$ (parcelas, fase, dias, pct não)', () => {
    expect(respostaConfere('Parcela de R$ 10', [{ parcelas: 10, fase: 1, diasRestantes: 10, pct: 10 }])).toBe(false);
    expect(respostaConfere('Parcela de R$ 300', [{ parcelas: 10, parcela: 300 }])).toBe(true);
  });
  it('R$ dentro de texto da ferramenta vale (próximo passo da trilha)', () => {
    expect(respostaConfere('➡️ Aplicar R$ 1.975,00 por mês', [{ proximoPasso: 'Aplicar R$ 1.975,00/mês completa a reserva.' }])).toBe(true);
  });
  it('percentual tem que vir de um pct da ferramenta', () => {
    expect(respostaConfere('🔺 subiu 30%', [{ pct: 14.3 }])).toBe(false);
    expect(respostaConfere('🔺 subiu 14,3%', [{ pct: 14.3 }])).toBe(true);
    expect(respostaConfere('🔻 caiu 14%', [{ pct: -14.3 }])).toBe(true);
  });
});
