import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FaixaTrilha } from '../../src/app/components/FaixaTrilha';
import { CartaoFase, DividasEmDia } from '../../src/app/components/CartaoFase';
import type { Trilha } from '../../src/lib/trilha';

const trilha: Trilha = {
  atual: 1,
  fases: [
    { n: 1, titulo: 'Parar de criar dívida', status: 'atual', quando: 'mar/27', proximoPasso: 'Manter a fatura paga inteira.' },
    { n: 2, titulo: 'Nome limpo', status: 'depois', quando: 'falta informar', proximoPasso: 'Cadastrar' },
    { n: 3, titulo: 'Reserva de emergência', status: 'depois', quando: 'sem previsão', proximoPasso: 'Aplicar {{150}}/mês' },
    { n: 4, titulo: 'Construir patrimônio', status: 'depois', quando: null, proximoPasso: 'Aplicar 10%' },
  ],
  reserva: { meta: 1200, aplicado: 300, ritmo: 0, meses: 6 }, patrimonio: { pct: 0, meta: 0.1 }, sobra: { cumpridos: 1, meses: [{ mes: '2026-09', sobra: 5 }] },
  nomeLimpo: { informado: false, negativadas: 0, total: 0 },
};
const vazio = { dividas: [], atrasos: [], gastoTravado: { fixos: 0, casa: 0, debitoTravado: 0 }, aplicacaoMensal: [], metasPadrao: { meses: true, patrimonio: true } };

describe('faixa da trilha', () => {
  it('link para /trilha, fase N de 4, quatro tracinhos, título, quando e próximo passo', () => {
    const h = renderToStaticMarkup(createElement(FaixaTrilha, { trilha }));
    expect(h).toContain('href="/trilha"');
    expect(h).toContain('fase 1 de 4');
    expect((h.match(/data-fase=/g) ?? []).length).toBe(4);
    expect(h).toContain('Parar de criar dívida');
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
    // o valor do próximo passo vai com "money" (o olho esconde), o texto não
    expect(h).toMatch(/Aplicar <span class="tnum money">R\$\s?150,00<\/span>\/mês/);
  });
  // 13/11: as parcelas em dia saíram da fase 1 e ficam num cartão à parte, que não trava fase nenhuma
  it('dívidas em dia: cada dívida com parcela, quantas faltam e até quando; sem fim conhecido; o custo de quem nasceu de renegociação', () => {
    const h = renderToStaticMarkup(createElement(DividasEmDia, { dividas: [{ chave: 'renegociação|B1', nome: 'renegociação', banco: 'B1', plano: 3, valorParcela: 10, restantes: 3, fim: '2027-03' }, { chave: 'empréstimo|B2', nome: 'empréstimo', banco: 'B2', plano: null, valorParcela: 5, restantes: null, fim: null },
      { chave: 'reneg|B3', nome: 'reneg', banco: 'B3', plano: 6, valorParcela: 210, restantes: 5, fim: '2027-08', refin: { data: '2026-03-10', refinanciado: 900, total: 1260, custo: 360 } }] }));
    expect(h).toContain('Dívidas em dia');
    expect(h).toContain('faltam 3');
    expect(h).toContain('até mar/27');
    expect(h).toContain('sem data de fim');
    expect(h).toContain('não é dívida');
    expect(h).toContain('refinanciado em 10/03');
    expect(h).toMatch(/custo <span class="tnum money text-despesa">R\$\s?360,00/);
    expect(renderToStaticMarkup(createElement(DividasEmDia, { dividas: [] }))).toBe('');
  });
  it('parar de criar dívida: atraso com o mês e cada mês fechado como link para a Previsão', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, fase: trilha.fases[0], trilha, atrasos: [{ mes: '2026-09', motivo: 'juros' }] }));
    expect(h).toContain('juros de atraso em set/26');
    expect(h).toContain('href="/previsibilidade?mes=2026-09"');
    expect(h).not.toContain('não é dívida');
  });
  it('nome limpo: cada dívida fora do banco com credor, de quem é, valor e se está negativada; e o cadastro', () => {
    const h = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, fase: trilha.fases[1], trilha, externas: [
      { id: 1, credor: 'Banco X', responsavel: 'Matheus', valor: 900, negativada: true, origem: 'manual', referencia: '2041-03-01', observacao: null },
      { id: 2, credor: 'Loja Y', responsavel: 'Ariane', valor: 300, negativada: false, origem: 'consulta', referencia: '2041-03-05', observacao: 'acordo' },
    ] }));
    expect(h).toContain('Banco X');
    expect(h).toContain('negativada');
    expect(h).toContain('Loja Y');
    expect(h).toContain('sem negativação');
    expect(h).toMatch(/<span class="tnum money">R\$\s?900,00/);
    expect(h).toContain('veio da consulta');
    expect(h).toContain('Adicionar dívida');
  });
});

describe('ajustes da trilha nos cartões (F4b)', () => {
  it('reserva e patrimônio com "ajustar meta" e o valor em uso', () => {
    const h3 = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, metasPadrao: { meses: false, patrimonio: true }, fase: trilha.fases[2], trilha }));
    expect(h3).toContain('ajustar meta');
    expect(h3).not.toContain('(padrão)');
    expect(h3).toContain('6 × gasto travado');
    const h4 = renderToStaticMarkup(createElement(CartaoFase, { ...vazio, fase: trilha.fases[3], trilha }));
    expect(h4).toContain('ajustar meta (padrão)');
  });
});
