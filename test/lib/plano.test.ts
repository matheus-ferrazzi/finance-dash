import { describe, expect, it } from 'vitest';
import { contaDoPlano, GRUPOS_COM_TETO, metaDoGrupo, planoDoMes, validarPlano, type Plano } from '../../src/lib/plano';

// 13/11/2026 (plano realista): o plano são os tetos do dia a dia por grupo, alcançados em degraus. Valores inventados.
const plano: Plano = {
  inicio: '2041-03', degraus: 3,
  tetos: { Mercado: { teto: 1000, base: 1300 }, Compras: { teto: 600, base: 600 }, 'Lazer e digital': { teto: 400, base: 700 }, 'Comer fora': { teto: 500, base: 350 } },
};

describe('metaDoGrupo — degraus', () => {
  it('desce em degraus iguais da média de partida até o teto, e fica nele', () => {
    const m = (mes: string) => metaDoGrupo(plano.tetos.Mercado, plano, mes);
    expect([m('2041-03'), m('2041-04'), m('2041-05'), m('2041-06'), m('2042-01')]).toEqual([1200, 1100, 1000, 1000, 1000]);
  });
  it('grupo que já gasta o teto ou menos não tem degrau: a meta é o teto', () => {
    expect(metaDoGrupo(plano.tetos.Compras, plano, '2041-03')).toBe(600);
    expect(metaDoGrupo(plano.tetos['Comer fora'], plano, '2041-03')).toBe(500);
  });
  it('1 degrau = teto cheio desde o primeiro mês; antes do início ainda não há meta', () => {
    expect(metaDoGrupo(plano.tetos.Mercado, { ...plano, degraus: 1 }, '2041-03')).toBe(1000);
    expect(metaDoGrupo(plano.tetos.Mercado, plano, '2041-02')).toBeNull();
  });
});

describe('planoDoMes', () => {
  const semTeto = { Saúde: 300, Pet: 100, Transporte: 50 };
  it('meta de cada grupo com teto no mês + a média dos grupos sem teto = o dia a dia do plano', () => {
    const p = planoDoMes(plano, '2041-03', semTeto)!;
    expect(p.grupos).toEqual([
      { grupo: 'Mercado', meta: 1200, teto: 1000 }, { grupo: 'Compras', meta: 600, teto: 600 },
      { grupo: 'Lazer e digital', meta: 600, teto: 400 }, { grupo: 'Comer fora', meta: 500, teto: 500 },
    ]);
    expect(p.semTeto).toBe(450);
    expect(p.diaADia).toBe(3350);
    expect(planoDoMes(plano, '2041-05', semTeto)!.diaADia).toBe(2950);
  });
  it('antes do início do plano não há plano do mês', () => {
    expect(planoDoMes(plano, '2041-02', semTeto)).toBeNull();
  });
});

describe('contaDoPlano — quando deixa de faltar', () => {
  const base = {
    hoje: '2041-03-10', piso: 5000, casa: 1500, travados: 400, extras: 600, semTeto: 450, plano,
    // uma parcela de 300 até jul/41 e outra de 100 sem fim conhecido
    dividas: [{ valorParcela: 300, fim: '2041-07' }, { valorParcela: 100, fim: null }],
  };
  it('mês a mês: piso − casa − travados − parcelas − dia a dia do plano; a parcela que acaba vira folga', () => {
    const c = contaDoPlano(base, 6);
    expect(c.meses.map((m) => [m.mes, m.parcelas, m.diaADia, m.sobra])).toEqual([
      ['2041-03', 400, 3350, -650], ['2041-04', 400, 3150, -450], ['2041-05', 400, 2950, -250],
      ['2041-06', 400, 2950, -250], ['2041-07', 400, 2950, -250], ['2041-08', 100, 2950, 50],
    ]);
    expect(c.paraDeFaltar).toBe('2041-08');
    expect(c.estavel).toMatchObject({ mes: '2041-08', sobra: 50 });
  });
  it('com os extras de sempre a sobra de cada mês sobe e a data vem antes', () => {
    const c = contaDoPlano(base, 6);
    expect(c.meses[0].sobraComExtras).toBe(-50);
    expect(c.paraDeFaltarComExtras).toBe('2041-04');
  });
  it('se os tetos não fecham a conta no horizonte, diz quanto falta no mês mais folgado, sem inventar data', () => {
    const c = contaDoPlano({ ...base, piso: 4000 }, 6);
    expect(c.paraDeFaltar).toBeNull();
    expect(c.faltaNoMelhorMes).toBe(950);
  });
});

describe('validarPlano', () => {
  it('aceita os quatro grupos com valor em formato brasileiro e os degraus de 1 a 12', () => {
    const v = validarPlano({ tetos: { Mercado: '1.500', Compras: 900, 'Lazer e digital': '450,00', 'Comer fora': 700 }, degraus: 3 });
    expect(v).toEqual({ ok: true, data: { tetos: { Mercado: 1500, Compras: 900, 'Lazer e digital': 450, 'Comer fora': 700 }, degraus: 3 } });
    expect(GRUPOS_COM_TETO).toEqual(['Mercado', 'Compras', 'Lazer e digital', 'Comer fora']);
  });
  it('recusa: grupo faltando, valor que não é número ou negativo, degraus fora de 1 a 12', () => {
    const ok = { tetos: { Mercado: 1, Compras: 1, 'Lazer e digital': 1, 'Comer fora': 1 }, degraus: 3 };
    expect(validarPlano({ ...ok, tetos: { Mercado: 1 } })).toEqual({ ok: false, erro: 'Falta o teto de Compras.' });
    expect(validarPlano({ ...ok, tetos: { ...ok.tetos, Mercado: 'abc' } })).toEqual({ ok: false, erro: 'Teto de Mercado inválido.' });
    expect(validarPlano({ ...ok, tetos: { ...ok.tetos, Mercado: -5 } })).toEqual({ ok: false, erro: 'Teto de Mercado inválido.' });
    expect(validarPlano({ ...ok, degraus: 0 })).toEqual({ ok: false, erro: 'Degraus: de 1 a 12 meses.' });
    expect(validarPlano({ ...ok, degraus: 2.5 })).toEqual({ ok: false, erro: 'Degraus: de 1 a 12 meses.' });
    expect(validarPlano(null)).toEqual({ ok: false, erro: 'Falta o teto de Mercado.' });
  });
});
