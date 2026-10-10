import { describe, expect, it } from 'vitest';
import { estimarDebito, type MesDebito } from '../../src/lib/debito';

const m = (mes: string, livre: number, fixo = 0): MesDebito => ({ mes, livre, fixo });
const seis = [m('2026-04', 600, 60), m('2026-05', 500, 50), m('2026-06', 400, 40), m('2026-07', 300, 30), m('2026-08', 200, 20), m('2026-09', 100, 10)];

describe('estimarDebito', () => {
  it('media3: média dos 3 últimos meses', () => {
    expect(estimarDebito(seis, 'media3')).toEqual({ livre: 200, fixo: 20 });
  });
  it('mediana3: mediana dos 3 últimos', () => {
    expect(estimarDebito([...seis.slice(0, 5), m('2026-09', 900, 90)], 'mediana3')).toEqual({ livre: 300, fixo: 30 });
  });
  it('ponderada6: peso cai pela metade a cada mês para trás', () => {
    // pesos 1, 1/2, 1/4, 1/8, 1/16, 1/32 do mais recente ao mais antigo
    const w = [1, 0.5, 0.25, 0.125, 0.0625, 0.03125];
    const esperado = [100, 200, 300, 400, 500, 600].reduce((s, v, i) => s + v * w[i], 0) / w.reduce((a, b) => a + b, 0);
    expect(estimarDebito(seis, 'ponderada6').livre).toBeCloseTo(esperado, 1);
  });
  it('confiaveis: média só dos meses da lista', () => {
    expect(estimarDebito(seis, 'confiaveis', ['2026-04', '2026-09'])).toEqual({ livre: 350, fixo: 35 });
  });
  it('mês sem débito conta como 0; menos meses que a janela usa os que houver; nenhum mês dá 0', () => {
    expect(estimarDebito([m('2026-08', 0), m('2026-09', 300)], 'media3')).toEqual({ livre: 150, fixo: 0 });
    expect(estimarDebito([], 'ponderada6')).toEqual({ livre: 0, fixo: 0 });
    expect(estimarDebito(seis, 'confiaveis', [])).toEqual({ livre: 0, fixo: 0 });
  });
});
