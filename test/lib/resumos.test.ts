import { describe, expect, it } from 'vitest';
import { acumular, contasDoDia, faturasDoDia, totaisLivres, gruposDaSemana, historicoDe, semanaAnterior } from '../../src/lib/resumos';

// conta não paga não tem `dia` (é o dia do pagamento no banco): o vencimento vem de `vence`
const item = (nome: string, vence: number | null, status: 'pago' | 'a_confirmar' | 'falta', previsto = 100) =>
  ({ contaId: 1, marcaId: null, nome, responsavel: 'X', previsto, pago: null, status, dia: null, vence, parcela: null, avulsa: false, origem: null }) as any;

describe('contas do dia', () => {
  it('vencendo hoje e amanhã, ainda em falta (paga ou marcada ✓ não é lembrada)', () => {
    expect(contasDoDia([item('Luz', 10, 'falta'), item('Agua', 11, 'falta', 80), item('Gás', 11, 'a_confirmar'), item('Net', 11, 'pago'), item('Aluguel', 15, 'falta'), item('Sem dia', null, 'falta')], 10, 31))
      .toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }]);
  });
  it('último dia do mês: "amanhã" não existe neste mês', () => {
    expect(contasDoDia([item('Luz', 31, 'falta'), item('Gás', 1, 'falta')], 31, 31)).toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }]);
  });
  it('vencimento 31 num mês de 30 dias vence no dia 30', () => {
    expect(contasDoDia([item('Luz', 31, 'falta')], 30, 30)).toEqual([{ nome: 'Luz', valor: 100, quando: 'hoje' }]);
    expect(contasDoDia([item('Luz', 31, 'falta')], 29, 30)).toEqual([{ nome: 'Luz', valor: 100, quando: 'amanhã' }]);
  });
});

describe('grupos da semana', () => {
  const g = (nome: string, total: number, travado = false) => ({ nome, emoji: '•', total, pctRenda: 0, travado });
  it('os 3 que mais mudaram em relação à média semanal das 4 semanas', () => {
    const r = gruposDaSemana([g('Mercado', 500), g('Comer fora', 50), g('Lazer', 0), g('Transporte', 210)], [g('Mercado', 1200), g('Comer fora', 1600), g('Lazer', 800), g('Transporte', 840)]);
    expect(r.map((x) => [x.nome, x.semana, x.media])).toEqual([['Comer fora', 50, 400], ['Mercado', 500, 300], ['Lazer', 0, 200]]);
  });
  it('grupos travados (aluguel, empréstimo: pagos uma vez por mês) ficam fora da comparação', () => {
    const r = gruposDaSemana([g('Casa', 3000, true), g('Mercado', 500)], [g('Casa', 3000, true), g('Mercado', 1200)]);
    expect(r.map((x) => x.nome)).toEqual(['Mercado']);
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

describe('acumular', () => {
  it('soma dia a dia até hoje, preenchendo os dias sem gasto', () => {
    expect(acumular([{ dia: 2, valor: 10 }, { dia: 4, valor: 5.5 }], 5)).toEqual([
      { dia: 1, acumulado: 0 }, { dia: 2, acumulado: 10 }, { dia: 3, acumulado: 10 }, { dia: 4, acumulado: 15.5 }, { dia: 5, acumulado: 15.5 },
    ]);
  });
  it('dia 1 sem gasto: um ponto com zero', () => {
    expect(acumular([], 1)).toEqual([{ dia: 1, acumulado: 0 }]);
  });
});

describe('histórico do mensal', () => {
  const c = (receita: number, debito: number, saldo: number) => ({ receita, debito, casa: 0, fatura: 0, saldo });
  it('meses sem dado (antes do histórico) ficam fora; rótulo do mês', () => {
    const r = historicoDe([
      { mes: '2026-04', previsto: c(0, 0, 0), real: c(0, 0, 0), saldoInicio: 0, saldoFim: 0 },
      { mes: '2026-08', previsto: c(1, 1, 0), real: c(100, 400, -300), saldoInicio: 0, saldoFim: 0 },
      { mes: '2026-09', previsto: c(1, 1, 0), real: c(500, 200, 300), saldoInicio: 0, saldoFim: 0 },
    ]);
    expect(r).toEqual([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -300 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 300 }]);
  });
});

// auditoria 13/10 (N5): o lembrete de fatura vale para os cartões dos dois, não só os do caderno da Ariane
describe('faturas do dia (N5)', () => {
  const fat = (banco: string, responsavel: string, vencimento: string, situacao: string, falta: number) =>
    ({ id: banco + responsavel, banco, responsavel, usado: 0, limite: 0, disponivel: 0, fechamento: null,
       ultima: { total: falta, pago: 0, parcelado: 0, vencimento, situacao, falta } }) as any;
  it('fatura fechada a vencer hoje ou amanhã, de qualquer um; paga/parcelada/outro dia não', () => {
    expect(faturasDoDia([
      fat('Nubank', 'Matheus', '2026-11-06', 'a_vencer', 2900), fat('Santander', 'Matheus', '2026-11-05', 'a_vencer', 140),
      fat('Neon', 'Ariane', '2026-11-05', 'paga', 0), fat('Inter', 'Matheus', '2026-11-10', 'a_vencer', 50),
    ], '2026-11-05', [])).toEqual([
      { nome: 'Fatura Santander (Matheus)', valor: 140, quando: 'hoje' },
      { nome: 'Fatura Nubank (Matheus)', valor: 2900, quando: 'amanhã' },
    ]);
  });
  it('cartão que já está no caderno como conta não é lembrado duas vezes', () => {
    const caderno = [item('Nubank', 2, 'falta'), item('Crédito Neon', 5, 'falta')].map((i: any) => ({ ...i, responsavel: 'Ariane' }));
    expect(faturasDoDia([fat('Nubank', 'Ariane', '2026-11-02', 'a_vencer', 400), fat('Nubank', 'Matheus', '2026-11-02', 'a_vencer', 900)], '2026-11-02', caderno))
      .toEqual([{ nome: 'Fatura Nubank (Matheus)', valor: 900, quando: 'hoje' }]);
  });
  it('acento não atrapalha o casamento com o caderno (Itaú × "cartao itau")', () => {
    const caderno = [{ ...item('Cartão Itau', 2, 'falta'), responsavel: 'Matheus' }];
    expect(faturasDoDia([fat('Itaú', 'Matheus', '2026-11-02', 'a_vencer', 10)], '2026-11-02', caderno)).toEqual([]);
  });
  it('virada de mês: amanhã é dia 1 do mês seguinte', () => {
    expect(faturasDoDia([fat('Nubank', 'Matheus', '2026-12-01', 'a_vencer', 10)], '2026-11-30', [])).toEqual([{ nome: 'Fatura Nubank (Matheus)', valor: 10, quando: 'amanhã' }]);
  });
});

// auditoria 13/10 (N7): o título do semanal somava aluguel e renegociação ("🔺 310% acima") e o corpo não
describe('totais livres da semana (N7)', () => {
  const g = (nome: string, total: number, travado: boolean) => ({ nome, emoji: '', total, travado, pctRenda: 0 }) as any;
  it('total e média (÷4) só dos grupos livres, como a lista de grupos', () => {
    expect(totaisLivres([g('Mercado', 300, false), g('Moradia', 1300, true)], [g('Mercado', 1200, false), g('Moradia', 0, true)]))
      .toEqual({ total: 300, mediaTotal: 300 });
  });
});
