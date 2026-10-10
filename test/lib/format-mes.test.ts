import { describe, expect, it } from 'vitest';
import { currentMonthSP, normalizeMes } from '../../src/lib/format';

describe('normalizeMes (revisão final)', () => {
  it('mês 13 (link errado) cai no mês atual em vez de quebrar a consulta', () => {
    expect(normalizeMes('2026-13')).toBe(currentMonthSP());
    expect(normalizeMes('2026-00')).toBe(currentMonthSP());
    expect(normalizeMes('2026-09')).toBe('2026-09');
  });
});
