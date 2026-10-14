import { describe, expect, it } from 'vitest';
import { calibrar, calibrarValidada, coberturaAnteriores, doRegime, faixaMes, faixaMesCorrente, percentil } from '../../src/lib/faixa';

describe('faixa', () => {
  it('percentil com interpolação linear', () => {
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10)).toBeCloseTo(2);
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 90)).toBeCloseTo(10);
  });
  it('calibrar: menos de 6 erros = sem faixa', () => {
    expect(calibrar([1, 2, 3, 4, 5], '2026-10-10')).toBeNull();
    expect(calibrar([0, 0, 0, 0, 0, 100, -100], '2026-10-10')).toMatchObject({ n: 7 });
  });
  // P2 (auditoria 13/10): a spec do F2a pedia "só ligar a faixa se ela acertar 70–90% dos meses" — fora da amostra
  it('P2: cobertura testa cada mês com a faixa dos meses ANTERIORES (mínimo 6), em ordem', () => {
    // 7º (0) cai dentro da faixa dos 6 anteriores; 8º (999) fora
    expect(coberturaAnteriores([10, -10, 20, -20, 5, -5, 0, 999])).toEqual({ dentro: 1, total: 2 });
    expect(coberturaAnteriores([1, 2, 3, 4, 5, 6])).toEqual({ dentro: 0, total: 0 });
  });
  it('P2: faixa da tela só liga com 70–90% de acerto fora da amostra; com 6 meses ainda não há teste', () => {
    const estavel = [10, -10, 20, -20, 5, -5, 0, 3, -3, 8, 30, -2];
    const { dentro, total } = coberturaAnteriores(estavel);
    expect(dentro / total).toBeGreaterThanOrEqual(0.7);
    expect(dentro / total).toBeLessThanOrEqual(0.9);
    expect(calibrarValidada(estavel, 'x')).toMatchObject({ n: 12, cobertura: Math.round((dentro / total) * 100) / 100 });
    expect(calibrarValidada([10, -10, 20, -20, 5, -5], 'x')).toBeNull();          // 6 meses: nada para testar
    expect(calibrarValidada([1, 2, 3, 4, 5, 6, 700, 800, 900, 1000], 'x')).toBeNull(); // tendência: a faixa não acerta
  });
  it('mês k: pior caso = projetado − p90·√k; melhor = projetado − p10·√k', () => {
    const c = { p10: -200, p90: 300, n: 12, calculadaEm: 'x' };
    expect(faixaMes(1000, 1, c)).toEqual({ piorCaso: 700, melhorCaso: 1200 });
    expect(faixaMes(1000, 4, c)).toEqual({ piorCaso: 400, melhorCaso: 1400 });
    expect(faixaMes(1000, 4, null)).toEqual({ piorCaso: 1000, melhorCaso: 1000 });
  });
  it('mês em andamento: proporcional aos dias que faltam; último dia = largura 0', () => {
    const c = { p10: -200, p90: 300, n: 12, calculadaEm: 'x' };
    expect(faixaMesCorrente(1000, 15, 30, c)).toEqual({ piorCaso: 850, melhorCaso: 1100 });
    expect(faixaMesCorrente(1000, 0, 31, c)).toEqual({ piorCaso: 1000, melhorCaso: 1000 });
  });
  it('só meses do regime atual (desde jul/2026) entram na calibração', () => {
    expect(doRegime(['2026-05', '2026-06', '2026-07', '2026-08'])).toEqual(['2026-07', '2026-08']);
  });
});

describe('revisão final F2a: faixa nunca inverte', () => {
  it('erro todo de um lado (previsão pessimista): pior caso não passa do provável, melhor caso não fica abaixo', () => {
    const c = { p10: -500, p90: -100, n: 6, calculadaEm: 'x' };
    const f = faixaMes(1000, 4, c);
    expect(f.piorCaso).toBeLessThanOrEqual(1000);
    expect(f.melhorCaso).toBeGreaterThanOrEqual(1000);
    const g = faixaMesCorrente(1000, 10, 30, c);
    expect(g.piorCaso).toBeLessThanOrEqual(1000);
  });
});
