import { describe, expect, it } from 'vitest';
import { lerParams, lerSimulacao, linkDoPeriodo } from '../../src/lib/botRotas';

const sp = (o: Record<string, string>) => new URLSearchParams(o);

describe('lerParams', () => {
  it('resolve período, pessoa e grupo válidos', () => {
    const r = lerParams(sp({ periodo: 'mes_passado', pessoa: 'Ariane', grupo: 'Mercado' }), '2026-10-11', ['periodo', 'pessoa', 'grupo']);
    expect(r).toEqual({ ok: true, v: { periodo: { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' }, pessoa: 'Ariane', grupo: 'Mercado' } });
  });
  it('erros com mensagem para o modelo', () => {
    expect(lerParams(sp({ periodo: 'ontem' }), '2026-10-11', ['periodo'])).toEqual({ ok: false, erro: 'periodo inválido: use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)' });
    expect(lerParams(sp({ periodo: 'hoje', pessoa: 'Zé' }), '2026-10-11', ['periodo', 'pessoa'])).toEqual({ ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' });
    expect(lerParams(sp({ periodo: 'hoje', grupo: 'Xis' }), '2026-10-11', ['periodo', 'grupo']).ok).toBe(false);
  });
  it('sem pessoa = casal; sem grupo = null', () => {
    expect(lerParams(sp({ periodo: 'hoje' }), '2026-10-11', ['periodo', 'pessoa', 'grupo'])).toMatchObject({ ok: true, v: { pessoa: 'casal', grupo: null } });
  });
});

describe('alinharPeriodos (comparação justa)', () => {
  it('A em andamento (este mês até hoje): B cortado no mesmo número de dias', async () => {
    const { alinharPeriodos } = await import('../../src/lib/botRotas');
    const a = { inicio: '2026-10-01', fimExcl: '2026-10-13', label: 'out/26' };
    const b = { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' };
    expect(alinharPeriodos(a, b, '2026-10-12')).toEqual({ a: { ...a, label: 'out/26 (dias 1 a 12)' }, b: { inicio: '2026-09-01', fimExcl: '2026-09-13', label: 'set/26 (dias 1 a 12)' } });
  });
  // auditoria 17/10 (Z1), 23/10: na ordem "setembro × outubro" (B em andamento) nada era cortado — setembro inteiro
  // contra 12 dias de outubro, e o mesmo pedido dava +45% ou −13% só pela ordem
  it('B em andamento: A é que é cortado; o resultado não depende da ordem', async () => {
    const { alinharPeriodos } = await import('../../src/lib/botRotas');
    const set = { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' };
    const out = { inicio: '2026-10-01', fimExcl: '2026-10-13', label: 'out/26' };
    expect(alinharPeriodos(set, out, '2026-10-12')).toEqual({
      a: { inicio: '2026-09-01', fimExcl: '2026-09-13', label: 'set/26 (dias 1 a 12)' }, b: { ...out, label: 'out/26 (dias 1 a 12)' },
    });
    // semana passada × esta semana (até quarta): a passada vai até quarta também
    const passada = { inicio: '2026-10-05', fimExcl: '2026-10-12', label: 'semana passada' };
    const esta = { inicio: '2026-10-12', fimExcl: '2026-10-15', label: 'esta semana' };
    expect(alinharPeriodos(passada, esta, '2026-10-14').a).toEqual({ inicio: '2026-10-05', fimExcl: '2026-10-08', label: 'semana passada' });
  });
  it('A fechado ou B mais curto: nada muda', async () => {
    const { alinharPeriodos } = await import('../../src/lib/botRotas');
    const a = { inicio: '2026-08-01', fimExcl: '2026-09-01', label: 'ago/26' };
    const b = { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' };
    expect(alinharPeriodos(a, b, '2026-10-12')).toEqual({ a, b });
  });
});

// N19: o bot respondia "gasto da semana passada" com link para o mês inteiro
describe('link do período (N19)', () => {
  it('semana abre a semana; mês abre o mês; pessoa e grupo vão junto; outro período só a tela', () => {
    expect(linkDoPeriodo({ inicio: '2026-10-05', fimExcl: '2026-10-12' }, 'casal', null, '2026-10')).toBe('/gastos?p=sem-2026-10-05');
    expect(linkDoPeriodo({ inicio: '2026-09-01', fimExcl: '2026-10-01' }, 'Ariane', 'Mercado', '2026-10')).toBe('/gastos?resp=Ariane&mes=2026-09&grupo=Mercado');
    expect(linkDoPeriodo({ inicio: '2026-10-13', fimExcl: '2026-10-14' }, 'casal', null, '2026-10')).toBe('/gastos');
  });
});

// E1-M8: Infinity passava em "valor_total > 0"
describe('parâmetros do simular', () => {
  it('valor finito entre 0 e 1 milhão; parcelas inteiras 1..48', () => {
    expect(lerSimulacao(sp({ valor_total: '3000', parcelas: '10' }))).toEqual({ ok: true, valorTotal: 3000, parcelas: 10 });
    expect(lerSimulacao(sp({ valor_total: '500' }))).toEqual({ ok: true, valorTotal: 500, parcelas: 1 });
    for (const v of ['Infinity', '1e309', '-5', '0', 'abc', '2000000']) expect(lerSimulacao(sp({ valor_total: v })).ok).toBe(false);
    expect(lerSimulacao(sp({ valor_total: '100', parcelas: '1.5' })).ok).toBe(false);
  });
});
