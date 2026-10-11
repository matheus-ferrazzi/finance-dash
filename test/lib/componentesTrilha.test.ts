import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaixaTrilha } from '../../src/app/components/FaixaTrilha';
import { CartaoFase } from '../../src/app/components/CartaoFase';
import type { Trilha } from '../../src/lib/trilha';

const trilha: Trilha = {
  atual: 1,
  fases: [
    { n: 1, titulo: 'Sair das dívidas', status: 'atual', quando: 'mar/27', proximoPasso: 'Manter a fatura paga inteira.' },
    { n: 2, titulo: 'Fazer sobrar', status: 'depois', quando: 'pela previsão, não acontece em 24 meses', proximoPasso: 'meta' },
    { n: 3, titulo: 'Reserva de emergência', status: 'depois', quando: 'sem previsão', proximoPasso: 'Aplicar' },
    { n: 4, titulo: 'Construir patrimônio', status: 'depois', quando: null, proximoPasso: 'Aplicar 10%' },
  ],
  reserva: { meta: 1200, aplicado: 300, ritmo: 0 }, patrimonio: { pct: 0, meta: 0.1 }, sobra: { cumpridos: 1, meses: [{ mes: '2026-09', sobra: 5 }] },
};
const vazio = { dividas: [], atrasos: [], gastoTravado: { fixos: 0, casa: 0, debitoTravado: 0 }, aplicacaoMensal: [] };

describe('faixa da trilha', () => {
  it('link para /trilha, fase N de 4, quatro tracinhos, título, quando e próximo passo', () => {
    const h = renderToStaticMarkup(createElement(FaixaTrilha, { trilha }));
    expect(h).toContain('href="/trilha"');
    expect(h).toContain('fase 1 de 4');
    expect((h.match(/data-fase=/g) ?? []).length).toBe(4);
    expect(h).toContain('Sair das dívidas');
    expect(h).toContain('mar/27');
    expect(h).toContain('Manter a fatura paga inteira.');
  });
});

describe('cartão de fase', () => {
  it('reserva: barra e valores com "money"', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, fase: trilha.fases[2], trilha, gastoTravado: { fixos: 100, casa: 50, debitoTravado: 50 } }));
    expect(h).toContain('Reserva de emergência');
    expect(h).toContain('money');
    expect(h).toContain('role="progressbar"');
  });
  it('dívidas: cada dívida com parcela, quantas faltam e até quando; sem fim conhecido; atraso com o mês', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, {
      ...vazio, fase: trilha.fases[0], trilha,
      dividas: [{ nome: 'renegociação', banco: 'B1', valorParcela: 10, restantes: 3, fim: '2027-03' }, { nome: 'empréstimo', banco: 'B2', valorParcela: 5, restantes: null, fim: null }],
      atrasos: [{ mes: '2026-09', motivo: 'juros' }],
    }));
    expect(h).toContain('faltam 3');
    expect(h).toContain('até mar/27');
    expect(h).toContain('sem data de fim');
    expect(h).toContain('juros de atraso em set/26');
  });
  it('fazer sobrar: cada mês é link para o mês na Previsão', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, fase: trilha.fases[1], trilha }));
    expect(h).toContain('href="/previsibilidade?mes=2026-09"');
  });
});
