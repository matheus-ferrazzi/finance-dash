// Quanto sai no débito num mês futuro. A regra é escolhida pelo teste contra o passado (F2a):
// o gasto vem caindo e a média dos "meses confiáveis" não acompanha.
export type RegraDebito = 'confiaveis' | 'media3' | 'ponderada6' | 'mediana3';
export interface MesDebito { mes: string; livre: number; fixo: number }

/** Regra em uso. Decidida pelo teste contra o passado (scripts/backtest.ts); resultado no vault. */
export const REGRA_DEBITO: RegraDebito = 'confiaveis';

const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), k = Math.floor(s.length / 2);
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
};
const r2 = (x: number) => Math.round(x * 100) / 100;

export function estimarDebito(meses: MesDebito[], regra: RegraDebito, confiaveis: string[] = []): { livre: number; fixo: number } {
  const ord = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : 1));
  const aplica = (f: (xs: number[]) => number, ms: MesDebito[]) => ({ livre: r2(f(ms.map((x) => x.livre))), fixo: r2(f(ms.map((x) => x.fixo))) });
  if (regra === 'confiaveis') return aplica(media, ord.filter((x) => confiaveis.includes(x.mes)));
  if (regra === 'media3') return aplica(media, ord.slice(-3));
  if (regra === 'mediana3') return aplica(mediana, ord.slice(-3));
  // ponderada6: o mais recente pesa 1, o anterior 1/2, …
  const ult = ord.slice(-6).reverse();
  const pesos = ult.map((_, i) => 0.5 ** i);
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (!soma) return { livre: 0, fixo: 0 };
  return {
    livre: r2(ult.reduce((s, x, i) => s + x.livre * pesos[i], 0) / soma),
    fixo: r2(ult.reduce((s, x, i) => s + x.fixo * pesos[i], 0) / soma),
  };
}
