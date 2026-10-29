import { describe, expect, it } from 'vitest';
import { calcular } from '../../src/worker/bot/calculo';
import { respostaConfere } from '../../src/worker/bot/trava';

// 28/10 (fase 3): a calculadora do Zeca — ele não faz conta de cabeça
describe('calcular', () => {
  it('as quatro operações, parênteses, menos unário e %', () => {
    expect(calcular('190.69 / 27.03')).toEqual({ ok: true, dados: { expressao: '190.69 / 27.03', resultado: 7.05 } });
    expect(calcular('(1086.14 - 950) / 950 * 100')).toEqual({ ok: true, dados: { expressao: '(1086.14 - 950) / 950 * 100', resultado: 14.33 } });
    const r = calcular('-2 * (3 + 4)');
    expect(r.ok && r.dados.resultado).toBe(-14);
    const p = calcular('200 * 10%');
    expect(p.ok && p.dados.resultado).toBe(20);
  });
  it('entrada ruim: erro em texto, sem lançar', () => {
    for (const ruim of ['1/0', '', 'abc', '2 +', 'process.exit()', '(1+2', '1'.repeat(201)]) {
      const r = calcular(ruim);
      expect(r.ok, ruim).toBe(false);
      if (!r.ok) expect(typeof r.dados.erro).toBe('string');
    }
  });
  it('trava: o resultado vale como R$ e como %', () => {
    expect(respostaConfere('🔥 R$ 7,05 por real que cabia; 14,33% acima', [{ expressao: 'x', resultado: 7.05 }, { expressao: 'y', resultado: 14.33 }])).toBe(true);
    expect(respostaConfere('🔥 R$ 7,06', [{ expressao: 'x', resultado: 7.05 }])).toBe(false);
  });
});
