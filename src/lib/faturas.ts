// Fatura de cartão (auditoria 13/10/2026, N4). A fatura é a do histórico da Pluggy (a última que FECHOU),
// não o `valor_fatura_atual` de financas_faturas: esse é o saldo devedor do cartão (limite usado), que soma
// a fatura fechada com as compras do ciclo novo e aparecia como "a pagar" ao lado de um vencimento que já passou.

export type Situacao = 'paga' | 'a_vencer' | 'parcelada' | 'atrasada';

export interface FaturaFechada {
  total: number;
  /** pagamentos que o próprio cartão registrou desde ~10 dias antes do vencimento (sem duplicata) */
  pago: number;
  /** "Crédito de parcelamento" no cartão: a parte da fatura que virou parcelas */
  parcelado: number;
  vencimento: string; // AAAA-MM-DD
}

export interface UltimaFatura extends FaturaFechada { situacao: Situacao; falta: number }

const r2 = (x: number) => Math.round(x * 100) / 100;

export function situacaoFatura(f: FaturaFechada, hoje: string): { situacao: Situacao; falta: number } {
  const resto = r2(f.total - f.pago);
  if (resto <= 0.01) return { situacao: 'paga', falta: 0 };
  if (f.vencimento >= hoje) return { situacao: 'a_vencer', falta: resto };
  if (f.parcelado > 0) return { situacao: 'parcelada', falta: 0 };
  return { situacao: 'atrasada', falta: resto };
}

/** O que ainda sai das contas pelas faturas fechadas: o que falta das a vencer e das atrasadas. */
export function totalAPagar(fs: readonly { situacao: Situacao; falta: number }[]): number {
  return r2(fs.filter((f) => f.situacao === 'a_vencer' || f.situacao === 'atrasada').reduce((s, f) => s + f.falta, 0));
}

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  paga: 'paga', a_vencer: 'a vencer', parcelada: 'parcelada', atrasada: 'em atraso',
};

/**
 * Data do dia `dia` no mês (ano, mes), sem estourar pro mês seguinte.
 * Cartão que fecha dia 30 não tem "30 de fevereiro": Date.UTC(2027,1,30)
 * viraria 2 de março e jogava o ciclo inteiro pro mês errado.
 */
export function diaDoMes(ano: number, mes: number, dia: number): number {
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Date.UTC(ano, mes, Math.min(dia, ultimoDia));
}

const diaDeFechamento = (fechamento: string | null) => (fechamento ? new Date(fechamento + 'T00:00:00Z').getUTCDate() : 1);

/** Ciclo de fatura que contém hoje, a partir do dia de fechamento: [start, end), em ms UTC. */
export function cicloAtual(fechamento: string | null, hojeMs: number) {
  const hoje = new Date(hojeMs);
  const y = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const closeDay = diaDeFechamento(fechamento);
  const dThis = diaDoMes(y, m, closeDay);
  if (dThis <= hojeMs) return { start: dThis, end: diaDoMes(y, m + 1, closeDay), closeDay };
  return { start: diaDoMes(y, m - 1, closeDay), end: dThis, closeDay };
}

/** P3: o ciclo que fecha no mês `ciclo` (AAAA-MM) — as compras da fatura daquele mês. Inválido = null. */
export function cicloQueFechaEm(ciclo: string | undefined, fechamento: string | null) {
  if (!ciclo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ciclo)) return null;
  const [y, m] = ciclo.split('-').map(Number);
  const closeDay = diaDeFechamento(fechamento);
  return { start: diaDoMes(y, m - 2, closeDay), end: diaDoMes(y, m - 1, closeDay), closeDay };
}

/** P3: mês (AAAA-MM) em que fechou a última fatura do cartão — a do "a pagar". */
export function mesDaUltimaFechada(fechamento: string | null, hoje: string): string {
  const [y, m, d] = hoje.split('-').map(Number);
  return new Date(cicloAtual(fechamento, Date.UTC(y, m - 1, d)).start).toISOString().slice(0, 7);
}

/** P3: `?ciclo=` do link — "fechada" (a última fatura fechada de cada cartão) ou AAAA-MM; sem pedido válido = null. */
export function cicloPedido(ciclo: string | undefined, fechamento: string | null, hoje: string) {
  return cicloQueFechaEm(ciclo === 'fechada' ? mesDaUltimaFechada(fechamento, hoje) : ciclo, fechamento);
}

/**
 * F1 (pendência): o cartão pedido pelo link vem primeiro e aberto. `pedido` = "Banco:Pessoa" (um cartão) ou
 * "Banco" (link antigo: todos daquele banco). Pedido que não existe não muda nada.
 */
export function ordenarPorPedido<T extends { banco: string; responsavel: string }>(vs: readonly T[], pedido: string | undefined) {
  const casa = (v: T) => !!pedido && (pedido.includes(':') ? `${v.banco}:${v.responsavel}` === pedido : v.banco === pedido);
  const marcados = vs.map((v) => ({ v, aberto: casa(v) }));
  return [...marcados.filter((x) => x.aberto), ...marcados.filter((x) => !x.aberto)];
}
