import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormCategoria } from '../../src/app/components/FolhaCategoria';
import { ListaRegras } from '../../src/app/components/ListaRegras';

const lanc = { id: 't1', data: '2026-10-05', valor: 42, descricao: 'PIX LOJA DO BICHO', categoria: 'Shopping', origem: 'banco' as const, temDoc: true, nomeContraparte: 'Loja do Bicho Ltda', sugestaoTexto: 'PIX LOJA DO BICHO', maisUsadas: ['Groceries'] };

describe('folha mudar categoria', () => {
  it('com documento: três opções, a de pessoa mostra o nome; valor com money; origem dita', () => {
    const h = renderToStaticMarkup(createElement(FormCategoria, { lanc, onSalvo: () => {} }));
    expect(h).toContain('Só este lançamento');
    expect(h).toContain('Todos de Loja do Bicho Ltda');
    expect(h).toContain('Todos com o texto');
    expect(h).toContain('money');
    expect(h).toContain('do banco');
    expect(h).toContain('Mercado'); // categorias em português
  });
  it('sem documento: só duas opções', () => {
    const h = renderToStaticMarkup(createElement(FormCategoria, { lanc: { ...lanc, temDoc: false, nomeContraparte: null }, onSalvo: () => {} }));
    expect(h).not.toContain('Todos de');
    expect(h).toContain('Todos com o texto');
  });
});

describe('tela regras', () => {
  it('lista tipo, nome, categoria em português e quantos; botão apagar', () => {
    const h = renderToStaticMarkup(createElement(ListaRegras, { regras: [{ id: 1, tipo: 'texto', nome: 'LOJA DO BICHO', categoria: 'Groceries', afetados: 3, criadoEm: '2026-10-11' }] }));
    expect(h).toContain('LOJA DO BICHO');
    expect(h).toContain('Mercado');
    expect(h).toContain('3 lançamentos');
    expect(h).toContain('Apagar');
  });
  it('sem regras: mensagem', () => {
    expect(renderToStaticMarkup(createElement(ListaRegras, { regras: [] }))).toContain('Nenhuma regra criada pelo painel');
  });
});
