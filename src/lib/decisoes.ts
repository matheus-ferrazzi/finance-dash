// As três decisões do F2a sobre a projeção: quando sai do vermelho, se cabe uma compra, quanto sobra por mês.
// "Pior caso" = limite de baixo da faixa 8 em 10; sem calibração, pior caso = provável.
import type { ProjecaoMes } from './previsao';
import { faixaMes, type Calibracao } from './faixa';
import { mesLabel } from './format';

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
  // maisNegativo é o fundo da curva, não o primeiro mês no vermelho: dizer "no pior mês" para não confundir
  if (r.maisNegativo) return `Atenção: já está no vermelho sem ela; no pior mês (${mesLabel(r.maisNegativo)}) a compra aprofunda o vermelho em ${dinheiro(r.aprofunda ?? 0)}.`;
  return 'Cabe: nenhum mês vai para o vermelho por causa dela, nem pelo pior caso.';
}

export type ErroPrevisao = { medio: number; n: number; lado: 'pessimista' | 'otimista' | 'misto' };

/**
 * Manchete do "Saindo do vermelho" (auditoria 18/10). Sem a faixa calibrada a projeção longa é só a média
 * de poucos meses — e errou mais de mil reais por mês em jul–set/26. Então: diz que é
 * "pela média", não pinta de vermelho como certeza, e mostra o erro medido nos meses fechados.
 */
export function mancheteSaida(
  sai: { provavel: string | null; piorCaso?: string | null }, calibrada: boolean,
  passados: readonly { previsto: number; real: number }[], horizonte: number,
): { valor: string; tom: 'bom' | 'atencao' | 'ruim'; erro: ErroPrevisao | null } {
  const frase = sai.provavel ? `sai em ${mesLabel(sai.provavel)}` : `não sai em ${horizonte} meses`;
  const difs = passados.map((p) => p.real - p.previsto);
  const erro: ErroPrevisao | null = difs.length ? {
    medio: Math.round(difs.reduce((s, d) => s + Math.abs(d), 0) / difs.length),
    n: difs.length,
    lado: difs.every((d) => d > 0) ? 'pessimista' : difs.every((d) => d < 0) ? 'otimista' : 'misto',
  } : null;
  if (calibrada) return { valor: frase[0].toUpperCase() + frase.slice(1), tom: sai.provavel ? 'bom' : 'ruim', erro };
  return { valor: `Pela média, ${frase}`, tom: sai.provavel ? 'bom' : 'atencao', erro };
}
