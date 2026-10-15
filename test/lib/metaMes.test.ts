import { describe, expect, it } from 'vitest';
import { alertasDaMeta, estadoMeta, type EstadoMeta } from '../../src/lib/metaMes';

// 15/10: a meta do débito e o gasto do mês "se conversam" (card, mensagem do Zeca e alertas) — valores inventados
const e = (gasto: number, previstoFim: number, diaHoje = 15, meta: number | null = 4000, diasNoMes = 30) =>
  estadoMeta({ meta, gasto, previstoFim, diaHoje, diasNoMes }) as EstadoMeta;

describe('estadoMeta', () => {
  it('dentro: falta, por dia (hoje também conta) e % arredondado', () => {
    expect(e(2000, 3800)).toMatchObject({ meta: 4000, gasto: 2000, pct: 50, falta: 2000, diasRestantes: 15, porDia: 125, situacao: 'dentro', acimaNoRitmo: 0 });
  });
  it('ritmo passa: gasto ainda baixo, mas a previsão do mês fecha acima', () => {
    expect(e(1500, 4300)).toMatchObject({ situacao: 'ritmo_passa', acimaNoRitmo: 300 });
  });
  it('80% e estourou', () => {
    expect(e(3300, 4500).situacao).toBe('passou_80');
    expect(e(4100, 4600)).toMatchObject({ situacao: 'estourou', falta: 0, porDia: 0 });
  });
  it('dia 1 com gasto 0 nunca é 80/100', () => {
    expect(e(0, 3900, 1).situacao).toBe('dentro');
    expect(e(0, 4100, 1).situacao).toBe('ritmo_passa');
  });
  it('último dia: dá pra gastar tudo o que falta hoje', () => {
    expect(e(3700, 3700, 30)).toMatchObject({ diasRestantes: 0, porDia: 300 });
  });
  it('sem meta (nem zerando sai): null', () => {
    expect(e(1000, 2000, 15, null)).toBeNull();
  });
});

describe('alertasDaMeta', () => {
  const orc = (gasto: number) => [{ item: 'Mercado', emoji: '🛒', teto: 1000, gasto }];
  it('dispara uma vez e guarda na memória; na rodada seguinte não repete', () => {
    const r1 = alertasDaMeta(e(3300, 3900), [], null, '2026-10');
    expect(r1.alertas.map((a) => a.tipo)).toEqual(['80']);
    expect(r1.memoria).toEqual({ mes: '2026-10', ritmoFora: false, avisos: ['80'] });
    expect(alertasDaMeta(e(3350, 3900), [], r1.memoria, '2026-10').alertas).toEqual([]);
  });
  it('a meta sobe e o % cai para 79: não repete nem "desavisa"', () => {
    const r1 = alertasDaMeta(e(3200, 3900), [], null, '2026-10');
    const r2 = alertasDaMeta(estadoMeta({ meta: 4100, gasto: 3240, previstoFim: 3900, diaHoje: 16, diasNoMes: 30 }), [], r1.memoria, '2026-10');
    expect(r2.alertas).toEqual([]);
    expect(r2.memoria.avisos).toEqual(['80']);
  });
  it('estourou e 80 na mesma rodada: manda só o 100, marca os dois', () => {
    const r = alertasDaMeta(e(4100, 4400), [], null, '2026-10');
    expect(r.alertas.map((a) => a.tipo)).toEqual(['100']);
    expect(r.memoria.avisos.sort()).toEqual(['100', '80']);
  });
  it('ritmo: avisa ao sair, cala enquanto fora, volta para dentro e sai de novo → avisa outra vez', () => {
    const r1 = alertasDaMeta(e(1500, 4300), [], null, '2026-10');
    expect(r1.alertas).toEqual([{ tipo: 'ritmo', previstoFim: 4300, acima: 300, porDia: 156.25 }]);
    const r2 = alertasDaMeta(e(1600, 4350), [], r1.memoria, '2026-10');
    expect(r2.alertas).toEqual([]);
    const r3 = alertasDaMeta(e(1700, 3950), [], r2.memoria, '2026-10');
    expect(r3.memoria.ritmoFora).toBe(false);
    expect(alertasDaMeta(e(1800, 4200), [], r3.memoria, '2026-10').alertas.map((a) => a.tipo)).toEqual(['ritmo']);
  });
  it('mês novo zera a memória', () => {
    const r1 = alertasDaMeta(e(3300, 3900), [], null, '2026-10');
    expect(alertasDaMeta(e(3300, 3900), [], r1.memoria, '2026-11').alertas.map((a) => a.tipo)).toEqual(['80']);
  });
  it('orçamento: 80 e 100 por item, uma vez cada; sem meta, só o orçamento', () => {
    const r1 = alertasDaMeta(null, orc(850), null, '2026-10');
    expect(r1.alertas).toEqual([{ tipo: 'orcamento', item: 'Mercado', emoji: '🛒', pct: 80, gasto: 850, teto: 1000 }]);
    expect(alertasDaMeta(null, orc(900), r1.memoria, '2026-10').alertas).toEqual([]);
    expect(alertasDaMeta(null, orc(1010), r1.memoria, '2026-10').alertas.map((a: any) => a.pct)).toEqual([100]);
  });
});
