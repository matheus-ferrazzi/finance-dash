import { describe, expect, it } from 'vitest';
import { detectarRenegociacoes, doPlano, moverParcelasEncerradas, type MovReneg } from '../../src/lib/renegociacao';
import type { CicloCartao } from '../../src/lib/faturaPrevista';

const mov = (p: Partial<MovReneg> & Pick<MovReneg, 'tipo' | 'data' | 'venc' | 'valor'>): MovReneg =>
  ({ conta: 'nu', descricao: 'Renegociação de pendências', parcelaNumero: null, parcelaTotal: null, ...p });
const parcela = (n: number, total: number, valor: number, data: string, venc: string) =>
  mov({ tipo: 'parcela', data, venc, valor, parcelaNumero: n, parcelaTotal: total });

// fatura de março com 500 não pagos; o plano velho (3 × 200) ainda tinha as parcelas 2 e 3; em 10/03 o banco junta
// tudo (500 + 400 = 900) num plano novo de 6 × 210: lança "Crédito de parcelamento" 895 e um desconto de 5
const saldos = [{ conta: 'nu', venc: '2041-04', valor: 500 }];
const velho = [parcela(1, 3, 200, '2041-02-12', '2041-03'), parcela(2, 3, 200, '2041-03-12', '2041-04'), parcela(3, 3, 200, '2041-04-12', '2041-05')];
const novo = [1, 2, 3, 4, 5, 6].map((n) => parcela(n, 6, 210, n === 1 ? '2041-03-10' : `2041-0${n + 2}-10`, `2041-0${n + 3}`));
const credito = mov({ tipo: 'credito', data: '2041-03-10', venc: '2041-04', valor: 895, descricao: 'Crédito de parcelamento' });
const desconto = mov({ tipo: 'desconto', data: '2041-03-10', venc: '2041-04', valor: 5, descricao: 'Desconto (NuFinanceira)' });

describe('detectarRenegociacoes', () => {
  it('crédito = saldo não pago + parcelas restantes de um plano: o plano foi encerrado e entrou no plano novo', () => {
    const [r, ...resto] = detectarRenegociacoes([...velho, ...novo, credito, desconto], saldos);
    expect(resto).toEqual([]);
    expect(r).toMatchObject({ conta: 'nu', data: '2041-03-10', venc: '2041-04', refinanciado: 900 });
    expect(r.encerrado).toMatchObject({ parcelas: 3, valor: 200 });
    expect(r.encerrado!.restantes.map((p) => p.parcelaNumero)).toEqual([2, 3]);
    expect(r.novo).toMatchObject({ parcelas: 6, valor: 210, total: 1260 });
    expect(r.custo).toBe(360); // 1260 − 900
  });

  it('crédito igual ao saldo não pago é só o parcelamento da fatura: nenhum plano encerrado', () => {
    const c = mov({ tipo: 'credito', data: '2041-03-10', venc: '2041-04', valor: 500, descricao: 'Crédito de parcelamento' });
    const [r] = detectarRenegociacoes([...velho, c], saldos);
    expect(r.encerrado).toBeNull();
    expect(r.refinanciado).toBe(500);
  });

  it('conta que não fecha ao centavo não encerra plano nenhum', () => {
    const c = mov({ tipo: 'credito', data: '2041-03-10', venc: '2041-04', valor: 880, descricao: 'Crédito de parcelamento' });
    const [r] = detectarRenegociacoes([...velho, ...novo, c], saldos);
    expect(r.encerrado).toBeNull();
  });

  it('plano de outro cartão não entra na conta', () => {
    const outro = velho.map((p) => ({ ...p, conta: 'sant' }));
    const [r] = detectarRenegociacoes([...outro, ...novo, credito, desconto], saldos);
    expect(r.encerrado).toBeNull();
  });

  it('sem plano novo no dia (só encerrou o antigo), não há custo calculado', () => {
    const [r] = detectarRenegociacoes([...velho, credito, desconto], saldos);
    expect(r.encerrado).not.toBeNull();
    expect(r.novo).toBeNull();
    expect(r.custo).toBeNull();
  });
});

describe('efeitos do plano encerrado', () => {
  const rs = detectarRenegociacoes([...velho, ...novo, credito, desconto], saldos);

  it('doPlano: reconhece as parcelas do plano encerrado (mesmo cartão, descrição, nº de parcelas e valor)', () => {
    const p = rs[0].encerrado!;
    expect(doPlano(p, { conta: 'nu', descricao: 'Renegociação de pendências', parcelaTotal: 3, valor: 200 })).toBe(true);
    expect(doPlano(p, { conta: 'nu', descricao: 'Renegociação de pendências', parcelaTotal: 6, valor: 210 })).toBe(false);
    expect(doPlano(p, { conta: 'sant', descricao: 'Renegociação de pendências', parcelaTotal: 3, valor: 200 })).toBe(false);
  });

  it('moverParcelasEncerradas: a parcela que venceria depois vem para a fatura do crédito, que a anula', () => {
    const ciclos: CicloCartao[] = [
      { conta: 'nu', venc: '2041-04', compras: 410, abate: 5, outrosCreditos: 895, temHistorico: true }, // parcela 2 + 1ª do plano novo
      { conta: 'nu', venc: '2041-05', compras: 410, abate: 0, outrosCreditos: 0, temHistorico: true },   // parcela 3 (fantasma) + 2ª do novo
    ];
    const r = moverParcelasEncerradas(ciclos, rs);
    expect(r.find((c) => c.venc === '2041-04')!.compras).toBe(610);
    expect(r.find((c) => c.venc === '2041-05')!.compras).toBe(210);
    expect(ciclos[1].compras).toBe(410); // não altera a entrada
  });
});
