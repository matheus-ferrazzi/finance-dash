import { describe, expect, it } from 'vitest';
import { contasDoDia, gruposDaSemana, semanaAnterior } from '../../src/lib/resumos';

const item = (nome: string, dia: number | null, status: 'pago' | 'a_confirmar' | 'falta', previsto = 100) =>
  ({ contaId: 1, marcaId: null, nome, responsavel: 'X', previsto, pago: null, status, dia, parcela: null, avulsa: false, origem: null }) as any;

describe('contas do dia', () => {
  it('vencendo hoje e amanhã, não pagas', () => {
    expect(contasDoDia([item('Luz', 10, 'falta'), item('Agua', 11, 'a_confirmar', 80), item('Net', 11, 'pago'), item('Aluguel', 15, 'falta'), item('Sem dia', null, 'falta')], 10, 31))
      .toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }]);
  });
  it('último dia do mês: "amanhã" não existe neste mês', () => {
    expect(contasDoDia([item('Luz', 31, 'falta'), item('Gás', 1, 'falta')], 31, 31)).toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }]);
  });
});

describe('grupos da semana', () => {
  const g = (nome: string, total: number) => ({ nome, emoji: '•', total, pctRenda: 0, travado: false });
  it('os 3 que mais mudaram em relação à média semanal das 4 semanas', () => {
    const r = gruposDaSemana([g('Mercado', 500), g('Comer fora', 50), g('Casa', 0), g('Transporte', 210)], [g('Mercado', 1200), g('Comer fora', 1600), g('Casa', 800), g('Transporte', 840)]);
    expect(r.map((x) => [x.nome, x.semana, x.media])).toEqual([['Comer fora', 50, 400], ['Mercado', 500, 300], ['Casa', 0, 200]]);
  });
  it('sem gasto e sem média: lista vazia, sem NaN', () => {
    expect(gruposDaSemana([], [])).toEqual([]);
  });
});

describe('semana anterior', () => {
  it('segunda a domingo antes de hoje', () => {
    expect(semanaAnterior('2026-10-12')).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' }); // segunda
    expect(semanaAnterior('2026-10-15')).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' }); // quinta
    expect(semanaAnterior('2026-10-18')).toEqual({ inicio: '2026-10-05', fim: '2026-10-11' }); // domingo
  });
});
