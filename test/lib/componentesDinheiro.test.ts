import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinhaDinheiro, resultadoApagar } from '../../src/app/components/LinhaDinheiro';
import { CategoryAccordion } from '../../src/app/components/CategoryAccordion';

const it7 = { id: 'din-7', data: '2026-10-12', valor: 50, descricao: 'feira', banco: '💵 Dinheiro', responsavel: 'Ariane', dinheiroId: 7 };

describe('gasto em dinheiro na tela Gastos (E3)', () => {
  it('a linha mostra 💵, o valor como dinheiro e "apagar"', () => {
    const h = renderToStaticMarkup(createElement(LinhaDinheiro, { it: it7 }));
    expect(h).toContain('💵 Dinheiro');
    expect(h).toContain('apagar');
    expect(h).toContain('money');
  });
  // E3-M3: apagar falhava em silêncio e o botão era pequeno para o dedo
  it('E3-M3: botão com área de toque de 44 px; resultado do apagar: recarrega ou diz o erro', () => {
    const h = renderToStaticMarkup(createElement(LinhaDinheiro, { it: it7 }));
    expect(h).toMatch(/<button[^>]*min-h-\[44px\][^>]*>apagar<\/button>/);
    expect(resultadoApagar(200)).toEqual({ recarregar: true });
    expect(resultadoApagar(404)).toEqual({ recarregar: true });
    expect(resultadoApagar(500)).toEqual({ recarregar: false, erro: 'Não consegui apagar. Tente de novo.' });
    expect(resultadoApagar(0)).toEqual({ recarregar: false, erro: 'Sem conexão. Tente de novo.' });
  });
  it('o acordeão aberto usa a linha de dinheiro (sem "Mudar categoria" do banco) para itens com dinheiroId', () => {
    const h = renderToStaticMarkup(createElement(CategoryAccordion, { grupos: [{ categoria: 'Groceries', total: 50, n: 1, items: [it7] }], abertoInicial: 'Groceries' } as any));
    expect(h).toContain('apagar');
    expect(h).not.toContain('Mudar categoria');
  });
});
