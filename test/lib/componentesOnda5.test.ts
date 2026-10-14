import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardResposta } from '../../src/app/components/CardResposta';
import { Elo } from '../../src/app/components/Elo';
import { SyncDot } from '../../src/app/components/SyncDot';
import { GruposGastos } from '../../src/app/components/GruposGastos';
import { LinhaVencimentos } from '../../src/app/components/LinhaVencimentos';
import { FaturaCard } from '../../src/app/components/FaturaCard';
import { corDaSincronizacao } from '../../src/lib/format';

// Onda 5: peças comuns às 4 telas (card-resposta, elo, bolinha de sincronização)
describe('peças da Onda 5', () => {
  it('card-resposta: pergunta, valor com money, tom', () => {
    const h = renderToStaticMarkup(createElement(CardResposta, { pergunta: 'Falta pagar', valor: 'R$ 10,00', tom: 'atencao' }));
    expect(h).toContain('Falta pagar');
    expect(h).toMatch(/money[^"]*text-warn|text-warn[^"]*money/);
  });
  it('valor que não é dinheiro não leva money', () => {
    expect(renderToStaticMarkup(createElement(CardResposta, { pergunta: 'p', valor: 'Não sai em 24 meses', dinheiro: false }))).not.toContain('money');
  });
  it('elo é link com a ação', () => {
    const h = renderToStaticMarkup(createElement(Elo, { href: '/faturas', acao: 'ver faturas', children: 'no crédito' }));
    expect(h).toContain('href="/faturas"');
    expect(h).toContain('ver faturas');
  });
  it('bolinha: cor pela pior conexão, link pro diagnóstico; sem conexões, nada', () => {
    expect([corDaSincronizacao(3), corDaSincronizacao(30), corDaSincronizacao(80)]).toEqual(['bom', 'atencao', 'ruim']);
    const h = renderToStaticMarkup(createElement(SyncDot, { status: { oldestH: 80, conns: [{}] } }));
    expect(h).toContain('href="/diagnostico"');
    expect(h).toContain('bg-despesa');
    expect(h).toContain('há 3 dias');
    expect(renderToStaticMarkup(createElement(SyncDot, { status: { oldestH: 0, conns: [] } }))).toBe('');
  });
});

describe('Gastos (Onda 5)', () => {
  it('barra empilhada + grupos com seta; depois do 4º, "+ N grupos"; valores com money', () => {
    const g = (nome: string, total: number, seta: string | null = null) => ({ nome, emoji: '•', total, cats: ['Groceries'], seta, categorias: [] });
    const h = renderToStaticMarkup(createElement(GruposGastos, {
      grupos: [g('Casa', 500, '➖'), g('Mercado', 300, '⏫'), g('Saúde', 100), g('Pet', 50), g('Compras', 40), g('Resto', 10)],
      total: 1000, titulo: 'Tudo que saiu em outubro', hrefGrupo: (n: string) => `/gastos?grupo=${n}`, periodo: null,
    }));
    expect(h).toContain('Tudo que saiu em outubro');
    expect(h).toContain('⏫');
    expect(h).toContain('+ 2 grupos');
    expect(h).toContain('href="/gastos?grupo=Casa"');
    expect((h.match(/money/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('sem gastos: aviso', () => {
    expect(renderToStaticMarkup(createElement(GruposGastos, { grupos: [], total: 0, titulo: 't', hrefGrupo: () => '/', periodo: null })))
      .toContain('Sem gastos no período');
  });
});

describe('Faturas (Onda 5)', () => {
  it('linha do tempo com data, pessoa, situação e link do ciclo; atrasada em vermelho', () => {
    const h = renderToStaticMarkup(createElement(LinhaVencimentos, { resp: 'casal', itens: [
      { banco: 'Santander', responsavel: 'Matheus', vence: '2026-10-04', fecha: null, valor: 90, situacao: 'atrasada', ciclo: 'fechada' },
      { banco: 'Neon', responsavel: 'Ariane', vence: '2026-11-05', fecha: '2026-10-29', valor: 60, situacao: 'parcial', ciclo: '2026-10' },
    ] }));
    expect(h).toContain('04/10');
    expect(h).toContain('em atraso');
    expect(h).toContain('text-despesa');
    expect(h).toContain('fecha 29/10 · parcial');
    expect(h).toContain('href="/faturas?cartao=Neon%3AAriane&amp;ciclo=2026-10"');
    expect(h).toContain('money');
  });
  it('sem cartão: aviso', () => {
    expect(renderToStaticMarkup(createElement(LinhaVencimentos, { resp: 'Ariane', itens: [] }))).toContain('Nenhuma fatura por vir');
  });
});

describe('cartão compacto (Onda 5)', () => {
  it('sem valor da fatura e sem "próxima fatura"; mostra o % do limite (âmbar a partir de 80%)', () => {
    const f = { id: '1', banco: 'Neon', responsavel: 'Ariane', ultima: { vencimento: '2026-10-05', total: 80, pago: 80, parcelado: 0, situacao: 'paga' as const, falta: 0 },
      limite: 500, disponivel: 90, fechamento: '2026-09-29', cicloLabel: 'x', soma: 0, items: [], proxSoma: 40, proxLabel: 'y' };
    const h = renderToStaticMarkup(createElement(FaturaCard, { f, compacto: true }));
    expect(h).toContain('82% do limite');
    expect(h).toContain('text-warn');
    expect(h).not.toContain('última fatura');
    expect(h).not.toContain('Próxima fatura');
  });
});
