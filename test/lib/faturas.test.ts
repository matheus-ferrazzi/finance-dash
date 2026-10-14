import { describe, expect, it } from 'vitest';
import { cicloAtual, cicloPedido, proximosVencimentos, cicloQueFechaEm, mesDaUltimaFechada, ordenarPorPedido, situacaoFatura, totalAPagar } from '../../src/lib/faturas';

// auditoria 13/10 (N4): a fatura é a do histórico (a última fechada), não o saldo devedor do cartão
describe('situação da última fatura fechada', () => {
  it('paga inteira (com centavos de folga) ou fatura zerada: paga, nada falta', () => {
    expect(situacaoFatura({ total: 170, pago: 170, parcelado: 0, vencimento: '2026-10-05' }, '2026-10-13')).toEqual({ situacao: 'paga', falta: 0 });
    expect(situacaoFatura({ total: 0, pago: 0, parcelado: 0, vencimento: '2026-11-10' }, '2026-10-13')).toEqual({ situacao: 'paga', falta: 0 });
    expect(situacaoFatura({ total: 100.004, pago: 100, parcelado: 0, vencimento: '2026-10-05' }, '2026-10-13').situacao).toBe('paga');
  });
  it('vence hoje ou depois e não foi paga inteira: a vencer, falta o que não foi pago', () => {
    expect(situacaoFatura({ total: 800, pago: 300, parcelado: 0, vencimento: '2026-10-13' }, '2026-10-13')).toEqual({ situacao: 'a_vencer', falta: 500 });
  });
  it('venceu e o resto virou parcelamento: parcelada, nada a pagar agora (as parcelas vêm nas próximas)', () => {
    expect(situacaoFatura({ total: 480, pago: 200, parcelado: 280, vencimento: '2026-10-02' }, '2026-10-13')).toEqual({ situacao: 'parcelada', falta: 0 });
  });
  it('venceu sem pagar tudo e sem parcelamento: atrasada (rotativo), falta o resto', () => {
    expect(situacaoFatura({ total: 300, pago: 100, parcelado: 0, vencimento: '2026-10-02' }, '2026-10-13')).toEqual({ situacao: 'atrasada', falta: 200 });
  });
});

describe('total a pagar', () => {
  it('soma o que falta das a vencer e das atrasadas; parcelada e paga não entram', () => {
    expect(totalAPagar([
      { situacao: 'a_vencer', falta: 500 }, { situacao: 'atrasada', falta: 200 },
      { situacao: 'parcelada', falta: 0 }, { situacao: 'paga', falta: 0 },
    ])).toBe(700);
  });
});

// F1 (pendência): ?cartao=Nubank abria os dois cartões Nubank (do Matheus e da Ariane)
describe('cartão pedido pelo link', () => {
  const v = (banco: string, responsavel: string) => ({ banco, responsavel });
  const lista = [v('Neon', 'Ariane'), v('Nubank', 'Ariane'), v('Nubank', 'Matheus')];
  it('banco:pessoa abre só aquele cartão, primeiro na lista', () => {
    const r = ordenarPorPedido(lista, 'Nubank:Matheus');
    expect(r.map((x) => `${x.v.banco}:${x.v.responsavel}`)).toEqual(['Nubank:Matheus', 'Neon:Ariane', 'Nubank:Ariane']);
    expect(r.map((x) => x.aberto)).toEqual([true, false, false]);
  });
  it('só o banco (link antigo): os cartões desse banco vêm primeiro e abertos', () => {
    expect(ordenarPorPedido(lista, 'Nubank').filter((x) => x.aberto)).toHaveLength(2);
  });
  it('sem pedido ou cartão que não existe: ordem original, nada aberto', () => {
    expect(ordenarPorPedido(lista, undefined).map((x) => x.aberto)).toEqual([false, false, false]);
    expect(ordenarPorPedido(lista, 'Inter:Matheus').map((x) => x.v.banco)).toEqual(['Neon', 'Nubank', 'Nubank']);
  });
});

// auditoria 13/10 (P3): o link "a pagar" abre a fatura FECHADA (ciclo=AAAA-MM, o mês em que ela fechou),
// não as compras do ciclo em curso, que ainda não foram cobradas
describe('ciclos da fatura', () => {
  const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  it('ciclo em curso: do último fechamento (inclusive) ao próximo (exclusive)', () => {
    expect(cicloAtual('2026-09-03', ms('2026-10-14'))).toEqual({ start: ms('2026-10-03'), end: ms('2026-11-03'), closeDay: 3 });
    expect(cicloAtual('2026-09-20', ms('2026-10-14'))).toEqual({ start: ms('2026-09-20'), end: ms('2026-10-20'), closeDay: 20 });
  });
  it('ciclo que fecha em AAAA-MM: o mês anterior até o fechamento daquele mês', () => {
    expect(cicloQueFechaEm('2026-10', '2026-09-03')).toEqual({ start: ms('2026-09-03'), end: ms('2026-10-03'), closeDay: 3 });
    expect(cicloQueFechaEm('2027-01', '2026-09-20')).toEqual({ start: ms('2026-12-20'), end: ms('2027-01-20'), closeDay: 20 });
    // fecha dia 30: em março o ciclo começa no último dia de fevereiro
    expect(cicloQueFechaEm('2027-03', '2026-09-30')!.start).toBe(ms('2027-02-28'));
  });
  it('mês em que fechou a última fatura: o do início do ciclo em curso', () => {
    expect(mesDaUltimaFechada('2026-09-03', '2026-10-14')).toBe('2026-10');
    expect(mesDaUltimaFechada('2026-09-20', '2026-10-14')).toBe('2026-09');
    expect(mesDaUltimaFechada('2026-09-14', '2026-10-14')).toBe('2026-10'); // fechou hoje
  });
  it('ciclo inválido no link: null (a tela segue no ciclo em curso)', () => {
    expect(cicloQueFechaEm('2026-13', '2026-09-03')).toBeNull();
    expect(cicloQueFechaEm(undefined, '2026-09-03')).toBeNull();
  });
});

describe('ciclo pedido no link (P3)', () => {
  const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  it('"fechada": cada cartão abre a própria última fatura fechada', () => {
    expect(cicloPedido('fechada', '2026-09-03', '2026-10-14')).toEqual({ start: ms('2026-09-03'), end: ms('2026-10-03'), closeDay: 3 });
    expect(cicloPedido('fechada', '2026-09-20', '2026-10-14')).toEqual({ start: ms('2026-08-20'), end: ms('2026-09-20'), closeDay: 20 });
  });
  it('AAAA-MM: a fatura que fechou naquele mês; sem pedido: null', () => {
    expect(cicloPedido('2026-10', '2026-09-20', '2026-10-14')?.end).toBe(ms('2026-10-20'));
    expect(cicloPedido(undefined, '2026-09-20', '2026-10-14')).toBeNull();
  });
});

// Onda 5 (Faturas): linha do tempo — fechadas não pagas e o ciclo em curso de cada cartão, pela data de vencimento
describe('próximos vencimentos (Onda 5)', () => {
  const u = (vencimento: string, total: number, pago: number, situacao: any, falta: number) => ({ vencimento, total, pago, parcelado: 0, situacao, falta });
  it('fechada a vencer + ciclo em curso, ordenados pela data; vencimento do ciclo = mesmo dia, mês seguinte ao fechamento', () => {
    const v = proximosVencimentos([
      { banco: 'Nubank', responsavel: 'Matheus', fechamento: '2026-09-30', ultima: u('2026-10-17', 500, 0, 'a_vencer', 500), somaCiclo: 120 },
      { banco: 'Neon', responsavel: 'Ariane', fechamento: '2026-09-29', ultima: u('2026-10-05', 80, 80, 'paga', 0), somaCiclo: 60 },
    ], '2026-10-14');
    expect(v.map((x) => [x.banco, x.situacao, x.vence, x.valor, x.ciclo])).toEqual([
      ['Nubank', 'fechada', '2026-10-17', 500, 'fechada'],
      ['Neon', 'parcial', '2026-11-05', 60, '2026-10'],
      ['Nubank', 'parcial', '2026-11-17', 120, '2026-10'],
    ]);
    expect(v[1].fecha).toBe('2026-10-29');
  });
  it('atrasada vem primeiro; sem fatura no histórico: vencimento desconhecido (fica no fim)', () => {
    const v = proximosVencimentos([
      { banco: 'Inter', responsavel: 'Matheus', fechamento: '2026-09-10', ultima: null, somaCiclo: 40 },
      { banco: 'Santander', responsavel: 'Matheus', fechamento: '2026-09-28', ultima: u('2026-10-04', 90, 0, 'atrasada', 90), somaCiclo: 0 },
    ], '2026-10-14');
    expect(v.map((x) => [x.banco, x.situacao, x.vence])).toEqual([['Santander', 'atrasada', '2026-10-04'], ['Inter', 'parcial', null]]);
  });
  it('ciclo em curso sem compra não aparece; nenhum cartão = lista vazia', () => {
    expect(proximosVencimentos([{ banco: 'Neon', responsavel: 'Ariane', fechamento: '2026-09-29', ultima: null, somaCiclo: 0 }], '2026-10-14')).toEqual([]);
    expect(proximosVencimentos([], '2026-10-14')).toEqual([]);
  });
});
