import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import Carregando from '../../src/app/loading';
import NaoEncontrado from '../../src/app/not-found';
import Erro from '../../src/app/error';
import { SectionTitle } from '../../src/app/components/ui';
import { MobileNav, NavTopo } from '../../src/app/components/Nav';
import { SyncDot } from '../../src/app/components/SyncDot';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

// Acabamento (redesign-existing-projects, 15/10): estados que faltavam e detalhes do checklist
describe('acabamento do painel', () => {
  it('carregando: esqueleto no formato do card-resposta, anunciado para leitor de tela', () => {
    const h = renderToStaticMarkup(createElement(Carregando));
    expect(h).toContain('animate-pulse');
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain('Carregando');
  });
  it('404: diz o que houve e leva de volta ao início', () => {
    const h = renderToStaticMarkup(createElement(NaoEncontrado));
    expect(h).toContain('Essa página não existe');
    expect(h).toContain('href="/"');
  });
  it('erro: mensagem direta e botão de tentar de novo (sem "Oops")', () => {
    const h = renderToStaticMarkup(createElement(Erro, { error: new Error('x'), reset: () => {} }));
    expect(h).toContain('Não deu para carregar esta tela');
    expect(h).toContain('Tentar de novo');
    expect(h).not.toMatch(/oops/i);
  });
  it('rótulo de seção em frase normal, sem caixa-alta', () => {
    expect(renderToStaticMarkup(createElement(SectionTitle, null, 'Meta de gasto'))).not.toContain('uppercase');
  });
  it('favicon existe', () => {
    expect(existsSync('src/app/icon.svg')).toBe(true);
  });
  it('foco visível e retorno ao toque definidos no CSS global; fonte própria no tema', () => {
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toContain(':focus-visible');
    expect(css).toMatch(/:active[^{]*\{[^}]*scale\(0\.98\)/);
    expect(readFileSync('tailwind.config.ts', 'utf8')).toContain('var(--font-sans)');
  });
});

// pedido do Matheus (15/10, corrigido): o desktop com o MESMO VISUAL do celular, mas responsivo — barra no topo,
// largura cheia e blocos lado a lado (a 1ª versão virou uma coluna de celular no meio da tela, errado)
describe('desktop responsivo', () => {
  it('barra de baixo só no celular', () => {
    expect(renderToStaticMarkup(createElement(MobileNav))).toContain('md:hidden');
  });
  it('barra do topo só no desktop, com os 4 lugares e o Mais', () => {
    const h = renderToStaticMarkup(createElement(NavTopo));
    expect(h).toContain('hidden');
    expect(h).toContain('md:flex');
    for (const t of ['Início', 'Contas', 'Gastos', 'Previsão', 'Mais']) expect(h).toContain(t);
    expect(h).toContain('aria-current="page"');
  });
  it('layout em largura cheia (não coluna de celular) e as 4 telas em 2 colunas no desktop', () => {
    const layout = readFileSync('src/app/layout.tsx', 'utf8');
    expect(layout).not.toContain('max-w-lg');
    expect(layout).toContain('max-w-6xl');
    expect(layout).toContain('<NavTopo');
    for (const p of ['src/app/gastos/page.tsx', 'src/app/faturas/page.tsx', 'src/app/contas/page.tsx', 'src/app/previsibilidade/page.tsx']) {
      expect(readFileSync(p, 'utf8')).toMatch(/md:grid-cols-|lg:grid-cols-/);
    }
  });
});

describe('cabeçalho igual em qualquer tela', () => {
  it('pessoa e olho sem variantes de tela grande (a coluna é sempre da largura do celular)', async () => {
    const { RespToggle } = await import('../../src/app/components/Nav');
    const { PrivacyToggle } = await import('../../src/app/components/PrivacyToggle');
    expect(renderToStaticMarkup(createElement(RespToggle))).not.toContain('sm:');
    expect(renderToStaticMarkup(createElement(PrivacyToggle))).not.toContain('sm:');
  });
});
