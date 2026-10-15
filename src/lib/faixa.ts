// Faixa "8 em 10" da previsão (F2a): percentis 10 e 90 do erro do saldo do mês (previsto − real)
// no teste contra o passado. Mês k à frente abre por √k (o erro de cada mês arrasta os seguintes).
export interface Calibracao { p10: number; p90: number; n: number; calculadaEm: string; cobertura?: number }

/**
 * Início da fase atual (decidido em 10/10/2026): antes disso o padrão de renda e de pagamento era
 * outro e a previsão daquela época não serve para calibrar a faixa de hoje.
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

/**
 * P2 (auditoria 13/10): cobertura fora da amostra, como o aceite da spec (e o coberturaH1 do backtest): cada
 * mês (em ordem) é testado com a faixa calibrada só nos meses ANTERIORES (mínimo 6). Calibrar e medir nos
 * mesmos meses daria ~80% por construção.
 */
export function coberturaAnteriores(erros: number[]): { dentro: number; total: number } {
  let dentro = 0, total = 0;
  erros.forEach((e, i) => {
    const c = calibrar(erros.slice(0, i), '');
    if (!c) return;
    total++;
    if (e >= c.p10 && e <= c.p90) dentro++;
  });
  return { dentro, total };
}

/**
 * A faixa que vai para a tela: só liga se acertou entre 70% e 90% dos meses testados fora da amostra (spec
 * F2a). Com 6 meses ainda não há mês para testar — fica desligada até o 7º (decisão de 13/10).
 */
export function calibrarValidada(erros: number[], calculadaEm: string): Calibracao | null {
  const { dentro, total } = coberturaAnteriores(erros);
  if (total === 0) return null;
  const cobertura = dentro / total;
  if (cobertura < 0.7 || cobertura > 0.9) return null;
  const c = calibrar(erros, calculadaEm);
  return c && { ...c, cobertura: r2(cobertura) };
}

// erro todo de um lado (previsão sempre pessimista, p90 < 0) inverteria a faixa: o pior caso ficaria
// acima do provável e o "pelo pior caso" afrouxaria as decisões. A faixa sempre contém o provável.
function entre(provavel: number, pior: number, melhor: number) {
  return { piorCaso: r2(Math.min(provavel, pior)), melhorCaso: r2(Math.max(provavel, melhor)) };
}

// erro = previsto − real: p90 positivo = previsão otimista demais → o pior caso desconta p90
export function faixaMes(saldoProjetado: number, k: number, c: Calibracao | null) {
  if (!c) return { piorCaso: saldoProjetado, melhorCaso: saldoProjetado };
  const f = Math.sqrt(Math.max(1, k));
  return entre(saldoProjetado, saldoProjetado - c.p90 * f, saldoProjetado - c.p10 * f);
}

/** Mês em andamento: só o que ainda falta pode errar, proporcional aos dias que faltam. */
export function faixaMesCorrente(fechaCom: number, diasRestantes: number, diasNoMes: number, c: Calibracao | null) {
  if (!c || diasNoMes <= 0) return { piorCaso: fechaCom, melhorCaso: fechaCom };
  const f = Math.max(0, diasRestantes) / diasNoMes;
  return entre(fechaCom, fechaCom - c.p90 * f, fechaCom - c.p10 * f);
}
