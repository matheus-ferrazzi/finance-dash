import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormCategoria } from '../../src/app/components/FolhaCategoria';
// a folha usa o router do Next (só para atualizar a lista ao fechar): no render estático, um router falso
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
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
    expect(h).toContain('Isto é dívida (entra na trilha)');
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

describe('tela regras: seção trilha', () => {
  it('marcações e metas alteradas, com apagar', async () => {
    const { ListaAjustesTrilha } = await import('../../src/app/components/AjustesTrilha');
    const h = renderToStaticMarkup(createElement(ListaAjustesTrilha, { ajustes: { marcacoes: [{ id: 1, tipo: 'nao_divida', nome: 'crediario loja', criadoEm: '2026-10-11' }], metas: [{ chave: 'meses_reserva', valor: 3 }] } }));
    expect(h).toContain('Não é dívida');
    expect(h).toContain('crediario loja');
    expect(h).toContain('Reserva: 3 meses');
    expect((h.match(/Apagar/g) ?? []).length).toBe(2);
  });
  it('sem ajustes: mensagem', async () => {
    const { ListaAjustesTrilha } = await import('../../src/app/components/AjustesTrilha');
    expect(renderToStaticMarkup(createElement(ListaAjustesTrilha, { ajustes: { marcacoes: [], metas: [] } }))).toContain('Nenhum ajuste da trilha');
  });
});

describe('pendências do F4 (auditoria 13/10)', () => {
  it('chips de categoria com 44 px de toque; busca recebe o foco ao abrir', () => {
    const h = renderToStaticMarkup(createElement(FormCategoria, { lanc, onSalvo: () => {} }));
    expect(h).not.toContain('min-h-[36px]');
    expect(h).toMatch(/<button[^>]*min-h-\[44px\][^>]*>Mercado<\/button>/);
    expect(h).toMatch(/<input[^>]*autofocus/i);
  });
  it('a folha é um diálogo modal com rótulo (leitor de tela) e fecha com Esc', async () => {
    const { FolhaCategoria, fecharComEsc } = await import('../../src/app/components/FolhaCategoria');
    const h = renderToStaticMarkup(createElement(FolhaCategoria, { id: 't1', onFechar: () => {} }));
    expect(h).toContain('role="dialog"');
    expect(h).toContain('aria-modal="true"');
    expect(h).toContain('aria-label="Mudar categoria"');
    let fechou = 0;
    fecharComEsc(() => { fechou++; })({ key: 'Escape' } as KeyboardEvent);
    fecharComEsc(() => { fechou++; })({ key: 'a' } as KeyboardEvent);
    expect(fechou).toBe(1);
  });
});

describe('texto da prévia (F4)', () => {
  it('mudança de classe aparece em português; sem mudança, nada', async () => {
    const { textoMudancaClasse } = await import('../../src/app/components/FolhaCategoria');
    expect(textoMudancaClasse([{ de: 'receita', para: 'estorno', n: 1 }])).toBe('1 deixa de contar como receita e passa a contar como estorno.');
    expect(textoMudancaClasse([{ de: 'despesa', para: 'transferencia_interna', n: 3 }])).toBe('3 deixam de contar como gasto e passam a contar como transferência entre contas.');
    expect(textoMudancaClasse([])).toBeNull();
  });
});
