import { describe, expect, it } from 'vitest';
import { seta } from '../../src/lib/seta';
import { ateODia, cabeNoMes, diaADia, gruposDoPeriodo, mediaPorGrupo, noCredito, separarDivida, type LancGasto } from '../../src/lib/gastosTela';

const l = (categoria: string, valor: number, extra: Partial<LancGasto> = {}): LancGasto =>
  ({ id: `${categoria}-${valor}`, data: '2026-10-05', valor, descricao: 'x', categoria, banco: 'B', responsavel: 'Matheus', forma: 'Débito', ...extra });

// Onda 5 (Gastos): a tela abre com o dia a dia × o que cabe e lista grupos com seta vs média
describe('Gastos (Onda 5)', () => {
  it('seta: mesma régua do semanal', () => {
    expect([seta(200, 100), seta(120, 100), seta(100, 100), seta(80, 100), seta(40, 100)]).toEqual(['⏫', '⬆️', '➖', '⬇️', '⏬']);
  });
  it('dia a dia = débito/PIX fora de Casa e Dívida, sem dinheiro vivo', () => {
    const ls = [l('Groceries', 100), l('Housing', 900), l('Loans', 300), l('Groceries', 50, { forma: 'Crédito' }), l('Eating out', 30, { dinheiroId: 1 })];
    expect(diaADia(ls)).toBe(100);
  });
  it('no crédito: soma só forma Crédito', () => {
    expect(noCredito([l('Groceries', 100), l('Shopping', 70, { forma: 'Crédito' }), l('Travel', 30.5, { forma: 'Crédito' })])).toBe(100.5);
  });
  it('até o dia: corta pelo dia do mês', () => {
    expect(ateODia([l('Groceries', 1, { data: '2026-09-05' }), l('Groceries', 2, { data: '2026-09-20' })], 14).map((x) => x.valor)).toEqual([1]);
  });
  it('grupos ordenados por total, categorias dentro, seta vs média; sem média = sem seta', () => {
    const ls = [l('Groceries', 300), l('Eating out', 80), l('Food delivery', 40), l('Housing', 900)];
    const gs = gruposDoPeriodo(ls, new Map([['Mercado', 100], ['Casa', 900]]));
    expect(gs.map((g) => [g.nome, g.total, g.seta])).toEqual([['Casa', 900, '➖'], ['Mercado', 300, '⏫'], ['Comer fora', 120, null]]);
    expect(gs[2].categorias.map((c) => c.categoria)).toEqual(['Eating out', 'Food delivery']);
    expect(gs[2].cats).toEqual(['Eating out', 'Food delivery']);
    expect(gruposDoPeriodo(ls, null).every((g) => g.seta === null)).toBe(true);
  });
  it('categoria sem grupo vai para "Resto"', () => {
    expect(gruposDoPeriodo([l('Coisa nova', 10)], null)[0]).toMatchObject({ nome: 'Resto', emoji: '❓' });
  });
  it('média por grupo: soma dos meses ÷ número de meses', () => {
    expect(mediaPorGrupo([[l('Groceries', 300)], [l('Groceries', 100)], []]).get('Mercado')).toBeCloseTo(133.33, 2);
  });
  it('cabe no mês = gasto + sobra, nunca abaixo do gasto', () => {
    expect(cabeNoMes(2000, 500)).toBe(2500);
    expect(cabeNoMes(2000, -300)).toBe(2000);
  });
});

// visto em produção em 15/10: o pg devolve a coluna date como Date (o tipo diz string) e /gastos deu 500
describe('data vinda do banco como Date', () => {
  it('ateODia aceita Date (meia-noite local, como o pg entrega)', () => {
    const d = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    const ls = [l('Groceries', 1, { data: d('2026-09-05') as any }), l('Groceries', 2, { data: d('2026-09-20') as any })];
    expect(ateODia(ls, 14).map((x) => x.valor)).toEqual([1]);
  });
});

// auditoria 17/10 (L2), decisão do Matheus em 20/10: dívida antiga (renegociação, parcelamento de fatura, empréstimo,
// juros e encargos de atraso) fica fora do total de Gastos e da Visão geral — o mesmo recorte da meta; aparece à parte
describe('separarDivida', () => {
  const l = (id: string, descricao: string, categoria: string, valor: number): LancGasto =>
    ({ id, data: '2031-03-02', valor, descricao, categoria, banco: 'B', responsavel: 'Matheus', forma: 'Crédito' });
  it('pela categoria (efetiva) e pela descrição; compra parcelada comum fica no consumo', () => {
    const r = separarDivida([
      l('a', 'MERCADO', 'Groceries', 100),
      l('b', 'Renegociação de pendências 3/7', 'Transfers', 640),
      l('c', 'Pagamento de boleto', 'Loans and financing', 300),
      l('d', 'ENCARGOS DE ATRASO', 'Bank fees', 12.5),
      l('e', 'LOJA 2/3', 'Shopping', 80),
    ]);
    expect(r.consumo.map((x) => x.id)).toEqual(['a', 'e']);
    expect(r.divida.map((x) => x.id)).toEqual(['b', 'c', 'd']);
    expect(r.totalDivida).toBe(952.5);
  });
});
