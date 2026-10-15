import { describe, expect, it } from 'vitest';
import { currentMonthSP, escaparLike, faltamMeses, normalizeMes } from '../../src/lib/format';

describe('normalizeMes (revisão final)', () => {
  it('mês 13 (link errado) cai no mês atual em vez de quebrar a consulta', () => {
    expect(normalizeMes('2026-13')).toBe(currentMonthSP());
    expect(normalizeMes('2026-00')).toBe(currentMonthSP());
    expect(normalizeMes('2026-09')).toBe('2026-09');
  });
});

// E2-M6: "50%" ou "a_b" na busca viravam curinga do ILIKE
describe('texto literal no ILIKE', () => {
  it('% _ e a barra viram literais', () => {
    expect(escaparLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
    expect(escaparLike('pix joão')).toBe('pix joão');
  });
});

// auditoria 13/10 (N9): "faltam 7 mêses"
describe('faltam N meses', () => {
  it('singular e plural certos', () => {
    expect([faltamMeses(1), faltamMeses(7)]).toEqual(['falta 1 mês', 'faltam 7 meses']);
  });
});
