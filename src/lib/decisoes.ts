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
    /** quanto a compra empurra para baixo o mês mais negativo (o que ela "aprofunda" o vermelho) */
    aprofunda: maisNeg === null ? 0 : Math.round((sem[maisNeg] - com[maisNeg]) * 100) / 100,
  };
}

export function sobraPorMes(projecao: ProjecaoMes[], c: Calibracao | null) {
  return projecao.slice(1).map((m) => ({
    mes: m.mes, provavel: m.saldo,
    piorCaso: c ? Math.round((m.saldo - c.p90) * 100) / 100 : m.saldo,
  }));
}

export function textoVeredito(
  r: { cabe: boolean; mesQueFura: string | null; maisNegativo: string | null; aprofunda?: number },
  mesLabel: (m: string) => string,
  dinheiro: (v: number) => string = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`,
): string {
  if (!r.cabe && r.mesQueFura) return `Não cabe: pelo pior caso, ${mesLabel(r.mesQueFura)} vai para o vermelho por causa dela.`;
  // cenário que já está no vermelho: "cabe" soaria como liberação — a compra só aprofunda o buraco
  if (r.maisNegativo) return `Atenção: ${mesLabel(r.maisNegativo)} já fica no vermelho sem ela; a compra aprofunda em ${dinheiro(r.aprofunda ?? 0)}.`;
  return 'Cabe: nenhum mês vai para o vermelho por causa dela, nem pelo pior caso.';
}
