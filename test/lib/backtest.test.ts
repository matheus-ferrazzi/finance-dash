import { describe, expect, it } from 'vitest';
import { avaliarMes, componentesPrevistos, LIMITES, escolherRegra, resumirErros } from '../../src/lib/backtest';
import type { ProjecaoMes } from '../../src/lib/previsao';

const mes: ProjecaoMes = {
  mes: '2026-08', mesLabel: 'ago/26', receita: 10000, despesaFixa: 200, despesaManual: 2000, despesaCasa: 500,
  despesaVariavel: 4000, fatura: 3000, parcelas: 0, saldo: 300, saldoProjetado: 1300, emAndamento: true,
};

describe('backtest', () => {
  it('agrupa a previsão nos componentes que dá para medir', () => {
    expect(componentesPrevistos(mes)).toEqual({ receita: 10000, debito: 4200, casa: 2500, fatura: 3000, saldo: 300 });
  });

  it('erro = previsto − real; aprova dentro dos limites do spec', () => {
    const r = avaliarMes(componentesPrevistos(mes), { receita: 9700, debito: 4000, casa: 2400, fatura: 3300, saldo: 0 });
    expect(r.erros).toEqual({ receita: 300, debito: 200, casa: 100, fatura: -300, saldo: 300 });
    expect(r.ok).toBe(true);
  });

  it('reprova quando receita, fatura ou saldo passam do limite', () => {
    const real = { receita: 10000, debito: 4200, casa: 2500, fatura: 3000, saldo: 300 };
    expect(avaliarMes(componentesPrevistos(mes), { ...real, receita: 10000 - LIMITES.receita - 1 }).ok).toBe(false);
    expect(avaliarMes(componentesPrevistos(mes), { ...real, fatura: 3000 + LIMITES.fatura + 1 }).ok).toBe(false);
    expect(avaliarMes(componentesPrevistos(mes), { ...real, saldo: 300 - LIMITES.saldo - 1 }).ok).toBe(false);
  });
});

describe('resumo e escolha da regra', () => {
  const e = (receita: number, debito: number, saldo: number) => ({ receita, debito, casa: 0, fatura: 0, saldo });
  const linhas = [
    { regra: 'confiaveis', horizonte: 1, mes: '2026-08', erros: e(0, 100, -100) },
    { regra: 'confiaveis', horizonte: 1, mes: '2026-09', erros: e(0, 300, -300) },
    { regra: 'media3', horizonte: 1, mes: '2026-08', erros: e(0, 50, -50) },
    { regra: 'media3', horizonte: 1, mes: '2026-09', erros: e(0, -50, 50) },
  ];
  it('erro absoluto médio e viés por regra × horizonte × componente', () => {
    const r = resumirErros(linhas);
    expect(r.find((x) => x.regra === 'confiaveis' && x.comp === 'saldo')).toMatchObject({ mae: 200, vies: -200 });
    expect(r.find((x) => x.regra === 'media3' && x.comp === 'saldo')).toMatchObject({ mae: 50, vies: 0 });
  });
  it('escolhe a de menor erro no saldo h1 se nenhuma medida piorar; senão fica a atual', () => {
    expect(escolherRegra(resumirErros(linhas)).regra).toBe('media3');
    const piora = [...linhas, { regra: 'media3', horizonte: 2, mes: '2026-09', erros: e(999, 0, 0) },
      { regra: 'confiaveis', horizonte: 2, mes: '2026-09', erros: e(0, 0, 0) }];
    expect(escolherRegra(resumirErros(piora)).regra).toBe('confiaveis');
  });
});
