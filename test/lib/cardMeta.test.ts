import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardMeta } from '../../src/app/components/CardMeta';
import { estadoMeta, type EstadoMeta } from '../../src/lib/metaMes';

// 15/10: o card da meta na home (de gastos, débito + crédito, desde 17/10) (valores inventados)
const e = (gasto: number, previstoFim: number) => estadoMeta({ meta: 4000, gasto, previstoFim, diaHoje: 15, diasNoMes: 30 }) as EstadoMeta;

describe('CardMeta', () => {
  it('dentro: gasto de meta, ainda pode e por dia; barra verde; sem aviso de ritmo; link dos Gastos', () => {
    const h = renderToStaticMarkup(createElement(CardMeta, { estado: e(2000, 3800), href: '/gastos' }));
    expect(h).toContain('Meta de gastos');
    expect(h).toContain('Ainda pode');
    expect(h).toContain('bg-accent');
    expect(h).not.toContain('no ritmo atual');
    expect(h).toContain('href="/gastos"');
    expect((h.match(/money/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
  it('ritmo passa: avisa onde fecha; 80%: barra âmbar', () => {
    expect(renderToStaticMarkup(createElement(CardMeta, { estado: e(1500, 4300), href: '/p' }))).toContain('no ritmo atual fecha em');
    expect(renderToStaticMarkup(createElement(CardMeta, { estado: e(3300, 3900), href: '/p' }))).toContain('bg-warn');
  });
  it('estourou: diz quanto passou, em vermelho', () => {
    const h = renderToStaticMarkup(createElement(CardMeta, { estado: e(4200, 4500), href: '/p' }));
    expect(h).toContain('Passaram da meta em');
    expect(h).toContain('bg-despesa');
  });
});
