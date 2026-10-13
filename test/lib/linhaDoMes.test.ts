import { describe, expect, it } from 'vitest';
import { serieDoMes } from '../../src/lib/linhaDoMes';

const base = { mes: '2026-10', hoje: '2026-10-10', saldoHoje: 1000, movimentos: {}, receitas: [], aindaSai: 0 };

describe('serieDoMes', () => {
  it('passado: desfaz os movimentos depois de cada dia até chegar no saldo de hoje', () => {
    const s = serieDoMes({ ...base, movimentos: { '2026-10-05': -300, '2026-10-08': 500 } });
    const at = (d: number) => s.pontos.find((p) => p.dia === d)!.saldo;
    expect(at(10)).toBe(1000);
    expect(at(8)).toBe(1000);
    expect(at(7)).toBe(500);
    expect(at(4)).toBe(800);
    expect(at(1)).toBe(800);
  });

  it('futuro: receita sobe no seu dia, o que sai desce por igual; último ponto = fechamento', () => {
    const s = serieDoMes({ ...base, receitas: [{ dia: 20, valor: 2100 }], aindaSai: 2100 });
    expect(s.pontos.filter((p) => p.futuro)).toHaveLength(21);
    expect(s.pontos.at(-1)!.dia).toBe(31);
    expect(s.fechamento).toBeCloseTo(1000);
    expect(s.pontos.at(-1)!.saldo).toBeCloseTo(s.fechamento);
    expect(s.pontos.find((p) => p.dia === 20)!.saldo - s.pontos.find((p) => p.dia === 19)!.saldo).toBeCloseTo(2000);
  });

  it('receita com dia já passado (atrasada) entra amanhã', () => {
    const s = serieDoMes({ ...base, receitas: [{ dia: 5, valor: 300 }] });
    expect(s.pontos.find((p) => p.dia === 11)!.saldo).toBe(1300);
    expect(s.fechamento).toBe(1300);
  });

  it('hoje é o último dia: sem futuro, sem divisão por zero', () => {
    const s = serieDoMes({ ...base, hoje: '2026-10-31', receitas: [{ dia: 31, valor: 50 }], aindaSai: 20 });
    // só o ponto do fechamento é futuro (F1: antes nenhum; o "fecha em" ficava fora do gráfico)
    expect(s.pontos.filter((p) => p.futuro)).toHaveLength(1);
    expect(s.fechamento).toBe(1030);
  });

  it('mês passado: tudo passado; fechamento = saldo no último dia daquele mês', () => {
    const s = serieDoMes({ ...base, mes: '2026-09', movimentos: { '2026-09-30': -100, '2026-10-02': 400 } });
    expect(s.passado).toBe(true);
    expect(s.pontos).toHaveLength(30);
    expect(s.pontos.some((p) => p.futuro)).toBe(false);
    expect(s.fechamento).toBe(600);
    expect(s.pontos.find((p) => p.dia === 29)!.saldo).toBe(700);
  });
});

describe('revisão final', () => {
  it('receita com dia típico além do fim do mês (31 em novembro) entra no último dia e o fechamento a inclui', () => {
    const s = serieDoMes({ ...base, mes: '2026-11', hoje: '2026-11-10', receitas: [{ dia: 31, valor: 500 }] });
    expect(s.fechamento).toBe(1500);
    expect(s.pontos.at(-1)).toMatchObject({ dia: 30, saldo: 1500 });
  });
});

// F1 (pendência): no último dia o "fecha em" ficava fora do gráfico (o último ponto era o saldo de agora)
describe('último dia do mês (F1)', () => {
  it('o gráfico termina no fechamento: um ponto final (futuro) no último dia com o "fecha em"', () => {
    const s = serieDoMes({ ...base, hoje: '2026-10-31', receitas: [{ dia: 31, valor: 50 }], aindaSai: 20 });
    expect(s.pontos.at(-1)).toEqual({ dia: 31, saldo: 1030, futuro: true });
    expect(s.pontos.filter((p) => !p.futuro).at(-1)).toEqual({ dia: 31, saldo: 1000, futuro: false });
  });
  it('sem nada a entrar nem sair: sem ponto repetido', () => {
    const s = serieDoMes({ ...base, hoje: '2026-10-31' });
    expect(s.pontos.filter((p) => p.dia === 31)).toHaveLength(1);
  });
});
