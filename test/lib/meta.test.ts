import { describe, expect, it } from 'vitest';
import { debitoParaSairAte, niveisMeta, tabelaMeta } from '../../src/lib/meta';
import type { ProjecaoBase } from '../../src/lib/previsao';

// entra 5 mil; saem 3 mil de débito, 1,5 mil da casa e 1 mil do cartão: −500 por mês
const base = (p: Partial<ProjecaoBase> = {}): ProjecaoBase => ({
  patrimonioAtual: 0, saldoContasAtual: 1000, saldoContas: { total: 1000, contas: [] },
  fontesReceita: [{ fonte: 'empresa', nome: 'empresa', valor: 5000, diaTipico: 5, responsavel: 'Matheus' }],
  despesaVariavelMediaMensal: 3000, despesaFixaDebitoMedia: 0, creditoNovoMedio: 1000,
  despesaCasaPorCategoria: { Housing: 1500 }, creditoPorVencimento: {}, faturaReal: {}, compromissosManuais: [],
  mesCorrente: { recebidoPorFonte: {}, receitaAgendada: 0, receitasAReceber: [], variavelJaGasto: 0, agendadoRestante: 0, faturaJaPaga: 0, casaNoMesPorCategoria: {} },
  ...p,
}) as ProjecaoBase;
const hoje = '2026-10-10';

describe('meta de gasto no débito', () => {
  it('níveis: a média atual exata e degraus de 500 abaixo (arredondados a 100), só positivos', () => {
    expect(niveisMeta(6259)).toEqual([6259, 5800, 5300, 4800, 4300]);
    expect(niveisMeta(900)).toEqual([900, 400]);
  });

  it('gastar menos nunca faz sair do vermelho mais tarde; a média atual reproduz a previsão de hoje', () => {
    const t = tabelaMeta(base({ saldoContasAtual: -3000 }), hoje, [3000, 2500, 2000, 1000]);
    expect(t[0]).toEqual({ debito: 3000, sai: null }); // −500/mês: nunca sai
    const ordem = t.map((x) => x.sai ?? '9999-99');
    expect([...ordem].sort().reverse()).toEqual(ordem); // decrescente ou igual
    expect(t[3].sai).not.toBeNull();
  });

  it('o débito fixo (travado) não entra na meta: a meta é sobre o total do débito', () => {
    const t = tabelaMeta(base({ saldoContasAtual: -3000, despesaVariavelMediaMensal: 2000, despesaFixaDebitoMedia: 1000 }), hoje, [3000]);
    expect(t[0].sai).toBeNull(); // 2000 livre + 1000 travado = mesmo cenário de −500/mês
  });

  it('debitoParaSairAte: o maior gasto (de 50 em 50) que ainda sai até o mês pedido; impossível = null', () => {
    const b = base({ saldoContasAtual: -3000 });
    const d = debitoParaSairAte(b, hoje, '2027-10');
    expect(d).not.toBeNull();
    const [comD, comMais] = tabelaMeta(b, hoje, [d!, d! + 50]);
    expect(comD.sai !== null && comD.sai <= '2027-10').toBe(true);
    expect(comMais.sai === null || comMais.sai > '2027-10').toBe(true);
    expect(debitoParaSairAte(base({ saldoContasAtual: -1_000_000 }), hoje, '2026-12')).toBeNull();
  });
});

describe('texto da meta', () => {
  it('diz quanto gastar e quanto a menos que a média; impossível tem texto próprio', async () => {
    const { textoMetaAlvo } = await import('../../src/lib/meta');
    const brl = (v: number) => `R$ ${v}`;
    expect(textoMetaAlvo(4800, 6259, 'out/27', brl)).toBe('Para sair do vermelho até out/27: gastar até R$ 4800/mês no débito (R$ 1459 a menos que a média de hoje).');
    expect(textoMetaAlvo(7000, 6259, 'out/27', brl)).toBe('No ritmo de hoje (R$ 6259/mês no débito) já sai do vermelho até out/27.');
    expect(textoMetaAlvo(null, 6259, 'out/27', brl)).toBe('Nem zerando o débito sai do vermelho até out/27.');
  });
});
