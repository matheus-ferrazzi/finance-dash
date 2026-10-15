// Meta de gasto no débito: "quando saio do vermelho" depende sobretudo de quanto sai no débito
// (o resto — casa, cartão, receita — muda pouco). A meta vale a partir de agora; o débito travado
// (consórcio, seguro, imposto) faz parte do total, então a meta é sobre o débito inteiro.
import { computeProjecao, type ProjecaoBase } from './previsao';
import { saiDoVermelho } from './decisoes';

const HORIZONTE = 24;
const PASSO_BUSCA = 50;

/** A média atual exata e degraus de 500 abaixo (arredondados a 100), só positivos. */
export function niveisMeta(debitoAtual: number): number[] {
  const topo = Math.round(debitoAtual / 100) * 100;
  return [Math.round(debitoAtual), ...[500, 1000, 1500, 2000].map((d) => topo - d)].filter((v) => v > 0);
}

/** A projeção de 24 meses se o débito mensal fosse `debitoMensal` (Onda 5: a linha "com a meta" do gráfico). */
export function projecaoComDebito(base: ProjecaoBase, debitoMensal: number, hoje: string) {
  const fixo = base.despesaFixaDebitoMedia ?? 0;
  return computeProjecao({ ...base, despesaVariavelMediaMensal: Math.max(0, debitoMensal - fixo) }, HORIZONTE, hoje);
}

function saiCom(base: ProjecaoBase, debitoMensal: number, hoje: string): string | null {
  return saiDoVermelho(projecaoComDebito(base, debitoMensal, hoje), null).provavel;
}

/** Para cada nível de gasto mensal no débito, em que mês o saldo fica ≥ 0 e continua (null = não sai em 24 meses). */
export function tabelaMeta(base: ProjecaoBase, hoje: string, niveis: number[]): { debito: number; sai: string | null }[] {
  return niveis.map((debito) => ({ debito, sai: saiCom(base, debito, hoje) }));
}

/** O maior gasto mensal no débito (de 50 em 50) que ainda faz sair do vermelho até `mesAlvo`; null se nem zerando. */
export function debitoParaSairAte(base: ProjecaoBase, hoje: string, mesAlvo: string): number | null {
  const ok = (d: number) => { const s = saiCom(base, d, hoje); return s !== null && s <= mesAlvo; };
  if (!ok(0)) return null;
  // menos débito nunca sai mais tarde: busca binária sobre múltiplos do passo
  let lo = 0, hi = Math.ceil((base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0) + 20000) / PASSO_BUSCA);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ok(mid * PASSO_BUSCA)) lo = mid; else hi = mid - 1;
  }
  return lo * PASSO_BUSCA;
}

export function textoMetaAlvo(
  maxDebito: number | null, mediaAtual: number, alvoLabel: string, brl: (v: number) => string,
  ultimoMes?: { label: string; valor: number },
): string {
  if (maxDebito === null) return `Nem zerando o débito sai do vermelho até ${alvoLabel}.`;
  if (maxDebito >= mediaAtual) return `No ritmo de hoje (${brl(Math.round(mediaAtual))}/mês no débito) já sai do vermelho até ${alvoLabel}.`;
  const base = `Para sair do vermelho até ${alvoLabel}: gastar até ${brl(maxDebito)}/mês no débito (${brl(Math.round(mediaAtual - maxDebito))} a menos que a média de hoje).`;
  // N16: a média junta meses de gasto alto; o último mês fechado mostra se o corte já está acontecendo
  if (!ultimoMes) return base;
  const v = Math.round(ultimoMes.valor);
  return `${base} Em ${ultimoMes.label} foram ${brl(v)}${v <= maxDebito ? ': dentro da meta, é manter.' : '.'}`;
}
