// Teste contra o passado: o que a previsão diria no dia 1º × o que aconteceu no mês.
import type { ProjecaoMes } from './previsao';

export interface Componentes { receita: number; debito: number; casa: number; fatura: number; saldo: number }

/** Critério de aceite do spec do P1 (em reais, valor absoluto do erro). */
export const LIMITES = { receita: 400, fatura: 400, saldo: 500 } as const;

export function componentesPrevistos(m: ProjecaoMes): Componentes {
  return {
    receita: m.receita,
    debito: m.despesaVariavel + m.despesaFixa,
    casa: m.despesaCasa + m.despesaManual,
    fatura: m.fatura,
    saldo: m.saldo,
  };
}

export function avaliarMes(previsto: Componentes, real: Componentes) {
  const erros = Object.fromEntries(
    (Object.keys(previsto) as (keyof Componentes)[]).map((k) => [k, Math.round((previsto[k] - real[k]) * 100) / 100]),
  ) as unknown as Componentes;
  const ok = Math.abs(erros.receita) <= LIMITES.receita
    && Math.abs(erros.fatura) <= LIMITES.fatura
    && Math.abs(erros.saldo) <= LIMITES.saldo;
  return { erros, ok };
}
