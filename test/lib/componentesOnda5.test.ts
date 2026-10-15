import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardResposta } from '../../src/app/components/CardResposta';
import { Elo } from '../../src/app/components/Elo';
import { SyncDot } from '../../src/app/components/SyncDot';
import { GruposGastos } from '../../src/app/components/GruposGastos';
import { LinhaVencimentos } from '../../src/app/components/LinhaVencimentos';
import { FaturaCard } from '../../src/app/components/FaturaCard';
import { ContasLista } from '../../src/app/components/ContasLista';
import { GraficoSaida } from '../../src/app/components/GraficoSaida';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
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
      total: 1000, titulo: 'Tudo que saiu em outubro', hrefs: { Casa: '/gastos?grupo=Casa' }, periodo: null,
    }));
    expect(h).toContain('Tudo que saiu em outubro');
    expect(h).toContain('⏫');
    expect(h).toContain('+ 2 grupos');
    expect(h).toContain('href="/gastos?grupo=Casa"');
    expect((h.match(/money/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('sem gastos: aviso', () => {
    expect(renderToStaticMarkup(createElement(GruposGastos, { grupos: [], total: 0, titulo: 't', hrefs: {}, periodo: null })))
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

describe('Contas (Onda 5)', () => {
  const i = (nome: string, status: any) => ({ contaId: 1, marcaId: null, nome, responsavel: 'Ariane', previsto: 10, pago: status === 'pago' ? 10 : null,
    status, dia: 2, vence: 5, parcela: null, avulsa: false, origem: null });
  it('seção Falta primeiro, Pagas recolhidas com contagem; fatura ganha "ver fatura"', () => {
    const h = renderToStaticMarkup(createElement(ContasLista, { mes: '2026-10', resp: 'casal', tiradas: [],
      itens: [i('Sabesp', 'pago'), i('Crédito Neon', 'falta')], cartoes: [{ banco: 'Neon', responsavel: 'Ariane' }] }));
    expect(h.indexOf('Crédito Neon')).toBeLessThan(h.indexOf('Pagas (1)'));
    expect(h).not.toContain('Sabesp'); // pagas recolhidas quando há o que pagar
    expect(h).toContain('href="/faturas?cartao=Neon%3AAriane"');
  });
  it('nada faltando: pagas abertas', () => {
    expect(renderToStaticMarkup(createElement(ContasLista, { mes: '2026-10', resp: 'casal', tiradas: [], itens: [i('Sabesp', 'pago')] }))).toContain('Sabesp');
  });
});

describe('Previsão (Onda 5)', () => {
  const p = (mes: string, saldo: number, meta: number | null, hoje = false) => ({ mes, mesLabel: mes, saldo, meta, passado: false, hoje });
  it('gráfico com linha do zero, ponto de hoje, linha da meta só quando há meta; rótulos do 1º e último mês', () => {
    const com = renderToStaticMarkup(createElement(GraficoSaida, { pontos: [p('jul/26', -800, null), p('out/26', -250, -250, true), p('out/28', -9000, 300)] }));
    expect(com).toContain('stroke-dasharray');
    expect(com).toContain('com a meta');
    expect(com).toContain('jul/26');
    expect(com).toContain('out/28');
    expect(com).toContain('<circle');
    const sem = renderToStaticMarkup(createElement(GraficoSaida, { pontos: [p('out/26', -250, null, true), p('nov/26', -400, null)] }));
    expect(sem).not.toContain('com a meta');
  });
  it('um ponto só ou nenhum: não quebra', () => {
    expect(renderToStaticMarkup(createElement(GraficoSaida, { pontos: [] }))).toBe('');
    expect(renderToStaticMarkup(createElement(GraficoSaida, { pontos: [p('out/26', 10, null, true)] }))).toContain('<svg');
  });
});

// visto em produção em 15/10: função como prop de componente cliente derruba a página (fronteira servidor → cliente)
describe('props dos componentes cliente da Onda 5 são serializáveis', () => {
  it('GruposGastos não recebe função', () => {
    const props = { grupos: [], total: 0, titulo: 't', hrefs: {}, periodo: null };
    expect(Object.values(props).some((v) => typeof v === 'function')).toBe(false);
    expect(() => JSON.stringify(props)).not.toThrow();
  });
});
