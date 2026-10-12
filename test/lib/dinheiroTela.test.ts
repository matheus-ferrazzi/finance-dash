import { describe, expect, it } from 'vitest';
import { paraLancamentos } from '../../src/lib/dinheiroTela';

describe('paraLancamentos', () => {
  it('vira linha da lista de gastos com id próprio e banco 💵 Dinheiro', () => {
    expect(paraLancamentos([{ id: 7, data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', pessoa: 'Ariane' }]))
      .toEqual([{ id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', banco: '💵 Dinheiro', responsavel: 'Ariane', dinheiroId: 7 }]);
  });
});
