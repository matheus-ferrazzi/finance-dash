import { describe, expect, it } from 'vitest';
import { compraCabe, saiDoVermelho, sobraPorMes } from '../../src/lib/decisoes';

const proj = (saldos: number[]) => saldos.map((s, i) => ({ mes: `2027-${String(i + 1).padStart(2, '0')}`, saldoProjetado: s, saldo: i ? s - saldos[i - 1] : s }) as any);
const c = { p10: -100, p90: 100, n: 12, calculadaEm: 'x' };

describe('saiDoVermelho', () => {
  it('primeiro mês que fica ≥ 0 e continua; pior caso mais tarde', () => {
    expect(saiDoVermelho(proj([-500, -200, 50, 300, 600]), c)).toEqual({ provavel: '2027-03', piorCaso: '2027-04' });
  });
  it('sai e volta a entrar não conta; nunca sai = null', () => {
    expect(saiDoVermelho(proj([-100, 50, -20, 80, 90]), null).provavel).toBe('2027-04');
    expect(saiDoVermelho(proj([-500, -400, -300]), c)).toEqual({ provavel: null, piorCaso: null });
  });
  it('já está positivo desde o mês 0', () => {
    expect(saiDoVermelho(proj([100, 200]), null).provavel).toBe('2027-01');
  });
});

describe('compraCabe', () => {
  it('cabe quando nenhum mês fica negativo pelo pior caso', () => {
    expect(compraCabe(proj([500, 2000, 4000]), c, 100, 2)).toMatchObject({ cabe: true, mesQueFura: null });
  });
  it('fura no primeiro mês que estava ≥ 0 e passa a < 0', () => {
    expect(compraCabe(proj([500, 300, 900]), c, 300, 3)).toMatchObject({ cabe: false, mesQueFura: '2027-02' });
  });
  it('mês já negativo sem a compra não é culpa da compra; informa o mais negativo', () => {
    const r = compraCabe(proj([500, -800, -300, 2000]), c, 50, 1);
    expect(r).toMatchObject({ cabe: true, mesQueFura: null, maisNegativo: '2027-02' });
  });
});

describe('sobraPorMes', () => {
  it('sobra provável e pior caso de cada mês futuro (sem o mês 0)', () => {
    expect(sobraPorMes(proj([0, 300, 500]), c)).toEqual([
      { mes: '2027-02', provavel: 300, piorCaso: 200 }, { mes: '2027-03', provavel: 200, piorCaso: 100 },
    ]);
  });
});

describe('textoVeredito', () => {
  it('texto do veredito do simulador', async () => {
    const { textoVeredito } = await import('../../src/lib/decisoes');
    const ml = (m: string) => m;
    expect(textoVeredito({ cabe: true, mesQueFura: null, maisNegativo: null }, ml)).toBe('Cabe: nenhum mês vai para o vermelho por causa dela, nem pelo pior caso.');
    expect(textoVeredito({ cabe: false, mesQueFura: '2027-02', maisNegativo: '2027-02' }, ml)).toBe('Não cabe: pelo pior caso, 2027-02 vai para o vermelho por causa dela.');
    expect(textoVeredito({ cabe: true, mesQueFura: null, maisNegativo: '2027-03' }, ml)).toBe('Cabe, mas 2027-03 já estava no vermelho sem ela.');
  });
});
