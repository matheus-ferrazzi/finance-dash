// Faixa "8 em 10" da previsão (F2a): percentis 10 e 90 do erro do saldo do mês (previsto − real)
// no teste contra o passado. Mês k à frente abre por √k (o erro de cada mês arrasta os seguintes).
export interface Calibracao { p10: number; p90: number; n: number; calculadaEm: string }

/**
 * Início do regime financeiro atual (decidido em 10/10/2026): antes disso, emprego anterior e dívida
 * com faturas pagas em parte — a previsão errava em milhares e não serve para calibrar a faixa de hoje.
 */
export const INICIO_REGIME = '2026-07';

export const doRegime = (meses: string[]) => meses.filter((m) => m >= INICIO_REGIME);

const r2 = (x: number) => Math.round(x * 100) / 100;

export function percentil(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const pos = (p / 100) * (s.length - 1), i = Math.floor(pos), f = pos - i;
  return i + 1 < s.length ? s[i] + f * (s[i + 1] - s[i]) : s[i];
}

/** Menos de 6 meses de erro: sem faixa (as decisões usam só o número provável). */
export function calibrar(erros: number[], calculadaEm: string): Calibracao | null {
  if (erros.length < 6) return null;
  return { p10: r2(percentil(erros, 10)), p90: r2(percentil(erros, 90)), n: erros.length, calculadaEm };
}

// erro = previsto − real: p90 positivo = previsão otimista demais → o pior caso desconta p90
export function faixaMes(saldoProjetado: number, k: number, c: Calibracao | null) {
  if (!c) return { piorCaso: saldoProjetado, melhorCaso: saldoProjetado };
  const f = Math.sqrt(Math.max(1, k));
  return { piorCaso: r2(saldoProjetado - c.p90 * f), melhorCaso: r2(saldoProjetado - c.p10 * f) };
}

/** Mês em andamento: só o que ainda falta pode errar, proporcional aos dias que faltam. */
export function faixaMesCorrente(fechaCom: number, diasRestantes: number, diasNoMes: number, c: Calibracao | null) {
  if (!c || diasNoMes <= 0) return { piorCaso: fechaCom, melhorCaso: fechaCom };
  const f = Math.max(0, diasRestantes) / diasNoMes;
  return { piorCaso: r2(fechaCom - c.p90 * f), melhorCaso: r2(fechaCom - c.p10 * f) };
}
