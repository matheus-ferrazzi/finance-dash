// Onda 5 (Previsão): pontos do gráfico "saldo no fim de cada mês" — passados reais, atual e projeção, e a linha da meta.
import { mesLabel } from './format';
import type { ProjecaoMes } from './previsao';

export interface PontoSaida { mes: string; mesLabel: string; saldo: number; meta: number | null; passado: boolean; hoje: boolean }

export function serieSaida(passados: { mes: string; saldoFim: number }[], projecao: ProjecaoMes[], comMeta: ProjecaoMes[] | null): PontoSaida[] {
  return [
    ...passados.map((p) => ({ mes: p.mes, mesLabel: mesLabel(p.mes), saldo: p.saldoFim, meta: null, passado: true, hoje: false })),
    ...projecao.map((p, i) => ({
      mes: p.mes, mesLabel: p.mesLabel, saldo: p.saldoProjetado, meta: comMeta?.[i]?.saldoProjetado ?? null, passado: false, hoje: i === 0,
    })),
  ];
}
