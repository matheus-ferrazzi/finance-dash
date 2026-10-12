import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinhaDinheiro } from '../../src/app/components/LinhaDinheiro';
import { CategoryAccordion } from '../../src/app/components/CategoryAccordion';

const it7 = { id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', banco: '💵 Dinheiro', responsavel: 'Ariane', dinheiroId: 7 };

describe('gasto em dinheiro na tela Gastos (E3)', () => {
  it('a linha mostra 💵, o valor como dinheiro e "apagar"', () => {
    const h = renderToStaticMarkup(createElement(LinhaDinheiro, { it: it7 }));
    expect(h).toContain('💵 Dinheiro');
    expect(h).toContain('apagar');
    expect(h).toContain('money');
  });
  it('o acordeão aberto usa a linha de dinheiro (sem "Mudar categoria" do banco) para itens com dinheiroId', () => {
    const h = renderToStaticMarkup(createElement(CategoryAccordion, { grupos: [{ categoria: 'Groceries', total: 50, n: 1, items: [it7] }], abertoInicial: 'Groceries' } as any));
    expect(h).toContain('apagar');
    expect(h).not.toContain('Mudar categoria');
  });
});
