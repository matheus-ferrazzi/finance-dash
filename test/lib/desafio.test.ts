import { describe, expect, it } from 'vitest';
import { andamentoDesafio, desafioDoMes } from '../../src/lib/desafio';
import type { GrupoGasto } from '../../src/lib/grupos';

const g = (nome: string, total: number, travado = false): GrupoGasto => ({ nome, emoji: '•', total, travado, pctRenda: 0 });

// P7 (decisão de 13/10: "fazer simples"): um desafio por mês, do maior grupo livre, meta = média − 10%
describe('desafio do mês', () => {
  it('maior grupo livre dos 3 meses anteriores; meta = média −10%, para baixo em R$ 10', () => {
    // 3 meses somados: Mercado 4.500 (média 1.500), Comer fora 2.400; Casa é maior mas é travada
    const d = desafioDoMes('2026-11', [g('Casa', 9000, true), g('Mercado', 4500), g('Comer fora', 2400)]);
    expect(d).toEqual({ mes: '2026-11', grupo: 'Mercado', emoji: '•', media: 1500, meta: 1350 });
    expect(desafioDoMes('2026-11', [g('Mercado', 3333)])!.meta).toBe(990); // média 1.111 → 999,9 → 990
  });
  it('"Resto" (sem categoria) não vira desafio: não dá pra agir sobre ele', () => {
    expect(desafioDoMes('2026-11', [g('Resto', 9000), g('Pet', 600)])!.grupo).toBe('Pet');
  });
  it('média abaixo de R$ 100 por mês ou nenhum grupo livre: sem desafio', () => {
    expect(desafioDoMes('2026-11', [g('Pet', 240)])).toBeNull();
    expect(desafioDoMes('2026-11', [g('Casa', 9000, true)])).toBeNull();
    expect(desafioDoMes('2026-11', [])).toBeNull();
  });
  it('andamento: gasto do grupo no mês × meta; cumpriu = ficou na meta ou abaixo', () => {
    const d = { mes: '2026-11', grupo: 'Mercado', emoji: '🛒', media: 1500, meta: 1350 };
    expect(andamentoDesafio(d, [g('Mercado', 675.5), g('Pet', 80)])).toEqual({ gasto: 675.5, pct: 50, cumpriu: true });
    expect(andamentoDesafio(d, [g('Mercado', 1351)])).toEqual({ gasto: 1351, pct: 100, cumpriu: false });
    expect(andamentoDesafio(d, [])).toEqual({ gasto: 0, pct: 0, cumpriu: true });
  });
});
