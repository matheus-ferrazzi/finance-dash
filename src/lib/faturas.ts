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
