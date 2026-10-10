// As três decisões do F2a sobre a projeção: quando sai do vermelho, se cabe uma compra, quanto sobra por mês.
// "Pior caso" = limite de baixo da faixa 8 em 10; sem calibração, pior caso = provável.
import type { ProjecaoMes } from './previsao';
import { faixaMes, type Calibracao } from './faixa';

const baixo = (p: ProjecaoMes[], c: Calibracao | null) => p.map((m, k) => (k === 0 ? m.saldoProjetado : faixaMes(m.saldoProjetado, k, c).piorCaso));

// sair do vermelho = ficar ≥ 0 e continuar assim até o fim do horizonte (sai e volta a entrar não conta)
function primeiroQueFica(saldos: number[], meses: string[]): string | null {
  for (let i = 0; i < saldos.length; i++) if (saldos.slice(i).every((s) => s >= 0)) return meses[i];
  return null;
}

export function saiDoVermelho(projecao: ProjecaoMes[], c: Calibracao | null) {
  const meses = projecao.map((m) => m.mes);
  return {
    provavel: primeiroQueFica(projecao.map((m) => m.saldoProjetado), meses),
    piorCaso: primeiroQueFica(baixo(projecao, c), meses),
  };
}

/** Aplica a compra como o simulador (parcela a partir do mês em andamento) e olha o pior caso. */
export function compraCabe(projecao: ProjecaoMes[], c: Calibracao | null, valorParcela: number, parcelas: number) {
  const sem = baixo(projecao, c);
  const com = sem.map((s, i) => s - valorParcela * Math.min(i + 1, Math.max(1, parcelas)));
  // mês que já estava negativo sem a compra não é culpa dela
  const fura = com.findIndex((s, i) => s < 0 && sem[i] >= 0);
  let maisNeg: number | null = null;
  com.forEach((s, i) => { if (s < 0 && (maisNeg === null || s < com[maisNeg])) maisNeg = i; });
  return {
    cabe: fura === -1,
    mesQueFura: fura === -1 ? null : projecao[fura].mes,
    maisNegativo: maisNeg === null ? null : projecao[maisNeg].mes,
  };
}

export function sobraPorMes(projecao: ProjecaoMes[], c: Calibracao | null) {
  return projecao.slice(1).map((m) => ({
    mes: m.mes, provavel: m.saldo,
    piorCaso: c ? Math.round((m.saldo - c.p90) * 100) / 100 : m.saldo,
  }));
}
