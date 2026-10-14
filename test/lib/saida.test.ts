import { describe, expect, it } from 'vitest';
import { serieSaida } from '../../src/lib/saida';

const pm = (mes: string, saldoProjetado: number) => ({ mes, mesLabel: mes, saldoProjetado } as any);
// Onda 5 (Previsão): pontos do gráfico "saldo no fim de cada mês"
describe('série do gráfico da Previsão', () => {
  it('passados (real) + atual (hoje) + futuros; a meta acompanha a projeção a partir de hoje', () => {
    const s = serieSaida([{ mes: '2026-08', saldoFim: -900 }, { mes: '2026-09', saldoFim: -500 }],
      [pm('2026-10', -250), pm('2026-11', -4000)], [pm('2026-10', -250), pm('2026-11', -3000)]);
    expect(s.map((p) => [p.mes, p.saldo, p.meta, p.passado, p.hoje])).toEqual([
      ['2026-08', -900, null, true, false], ['2026-09', -500, null, true, false],
      ['2026-10', -250, -250, false, true], ['2026-11', -4000, -3000, false, false]]);
    expect(s[0].mesLabel).toBe('ago/26');
  });
  it('sem meta (visão individual ou já sai no ritmo de hoje): meta null em tudo', () => {
    expect(serieSaida([], [pm('2026-10', 10)], null).every((p) => p.meta === null)).toBe(true);
  });
});
