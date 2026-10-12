import { describe, expect, it } from 'vitest';
import { paraLancamentos } from '../../src/lib/dinheiroTela';

describe('paraLancamentos', () => {
  it('vira linha da lista de gastos com id próprio e banco 💵 Dinheiro', () => {
    expect(paraLancamentos([{ id: 7, data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', pessoa: 'Ariane' }]))
      .toEqual([{ id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', banco: '💵 Dinheiro', responsavel: 'Ariane', classe: 'despesa', dinheiroId: 7 }]);
  });
});

describe('juntarBusca (E3)', () => {
  it('banco e dinheiro na mesma lista, mais recentes primeiro; dinheiro marcado', async () => {
    const { juntarBusca } = await import('../../src/lib/dinheiroTela');
    const banco = [{ id: 'b1', data: '2026-10-10', valor: 50, descricao: 'PIX', categoria: 'Transfers', banco: 'Nubank', responsavel: 'Matheus', classe: 'despesa' }];
    const din = [{ id: 7, data: '2026-10-11', valor: 1, descricao: 'chiclete', categoria: 'Groceries', pessoa: 'Matheus' }];
    const r = juntarBusca(banco as any, din);
    expect(r.map((x: any) => [x.id, x.classe, x.dinheiroId ?? null])).toEqual([['din-7', 'despesa', 7], ['b1', 'despesa', null]]);
  });
});
