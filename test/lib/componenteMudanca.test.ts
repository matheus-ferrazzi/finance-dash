import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CenarioMudanca } from '../../src/app/components/CenarioMudanca';

// P1 (auditoria 13/10): cenário de mudança no simulador
describe('CenarioMudanca', () => {
  const resumo = {
    linhas: [{ mes: '2027-02', mesLabel: 'fev/27', sem: 900, com: 900 }, { mes: '2027-03', mesLabel: 'mar/27', sem: 1000, com: -500 }],
    vermelhoPorCausa: '2027-03', vermelhoSemMudar: true, diferencaFim: -1500, mesFim: '2028-09',
  };
  const props = { mudanca: { mes: '2027-03', aluguel: 1800, custo: 3000 }, aluguelAtual: 1500, resumo, mesMinimo: '2026-11', individual: false };

  it('mostra o mês que fica no vermelho, a diferença no fim e marca o mês da mudança', () => {
    const h = renderToStaticMarkup(createElement(CenarioMudanca, props));
    expect(h).toContain('para o vermelho');
    expect(h).toContain('já fecham no vermelho sem ela');
    expect(h).toContain('a menos');
    expect(h).toContain('mar/27 · mudança');
    expect(h).toContain('name="mudanca"');
    expect(h).toContain('value="2027-03"');
  });
  it('sem cenário: só o formulário, sem tabela', () => {
    const h = renderToStaticMarkup(createElement(CenarioMudanca, { ...props, mudanca: null, resumo: null }));
    expect(h).toContain('<form');
    expect(h).not.toContain('<table');
  });
  it('visão individual: explica que o cenário é do casal e não mostra o formulário', () => {
    const h = renderToStaticMarkup(createElement(CenarioMudanca, { ...props, mudanca: null, resumo: null, individual: true }));
    expect(h).toContain('visão do casal');
    expect(h).not.toContain('<form');
  });
  it('valores são dinheiro (o olho de privacidade borra)', () => {
    const h = renderToStaticMarkup(createElement(CenarioMudanca, props));
    expect((h.match(/money/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
