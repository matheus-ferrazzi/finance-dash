// Renegociação no cartão (auditoria 11/11/2026). Função pura, sem banco.
//
// Quando o banco refinancia, lança no cartão um "Crédito de parcelamento" que anula o que estava devido — o saldo
// não pago da fatura e, se havia um plano antigo, as parcelas que faltavam dele — e abre um plano novo. Medido nos
// dois casos reais de 2026: crédito + desconto da financeira = saldo não pago + parcelas restantes, ao centavo.
// A Pluggy continua listando as parcelas do plano antigo nos meses seguintes; sem isto, elas ficavam na Trilha
// como dívida aberta e na fatura de um mês em que não vão ser cobradas.
import type { CicloCartao, SaldoAnterior } from './faturaPrevista';

/** Lançamento do cartão que interessa à renegociação, já com o mês de vencimento da fatura em que cai. */
export interface MovReneg {
  /** credito = "Crédito de parcelamento"; desconto = desconto da financeira no mesmo lançamento; parcela = parcela de compra ou de dívida */
  tipo: 'credito' | 'desconto' | 'parcela';
  conta: string; data: string; venc: string; valor: number; descricao: string;
  parcelaNumero: number | null; parcelaTotal: number | null;
}

/** Um plano de parcelas: mesmo cartão, mesma descrição (sem números), mesmo nº de parcelas e mesmo valor. */
export interface PlanoRef { conta: string; nome: string; parcelas: number; valor: number }

export interface Renegociacao {
  conta: string; data: string; venc: string;
  /** o que deixou de ser devido no dia: o crédito mais o desconto da financeira */
  refinanciado: number;
  /** plano antigo que entrou na renegociação, com as parcelas que faltavam (a partir da fatura do crédito) */
  encerrado: (PlanoRef & { restantes: MovReneg[] }) | null;
  /** plano aberto no mesmo dia */
  novo: (PlanoRef & { total: number }) | null;
  /** total do plano novo − o que foi refinanciado; null sem plano novo */
  custo: number | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const TOLERANCIA = 0.05; // arredondamento do banco (medido: R$ 0,01 e R$ 0,02)

/** Descrição sem números, em minúsculas — a mesma chave de nome da Trilha. */
export const nomeDoPlano = (d: string) => d.toLowerCase().replace(/[0-9/.]/g, ' ').replace(/\s+/g, ' ').trim();

export function doPlano(p: PlanoRef, l: { conta: string; descricao: string; parcelaTotal: number | null | undefined; valor: number }): boolean {
  return l.conta === p.conta && l.parcelaTotal === p.parcelas && Math.abs(l.valor - p.valor) < 0.005 && nomeDoPlano(l.descricao) === p.nome;
}

function planosDe(movs: readonly MovReneg[], conta: string): { ref: PlanoRef; parcelas: MovReneg[] }[] {
  const grupos = new Map<string, { ref: PlanoRef; parcelas: MovReneg[] }>();
  for (const m of movs) {
    if (m.tipo !== 'parcela' || m.conta !== conta || !m.parcelaTotal || m.parcelaTotal < 2) continue;
    const ref = { conta, nome: nomeDoPlano(m.descricao), parcelas: m.parcelaTotal, valor: r2(m.valor) };
    const k = `${ref.nome}|${ref.parcelas}|${ref.valor.toFixed(2)}`;
    const g = grupos.get(k) ?? { ref, parcelas: [] };
    g.parcelas.push(m);
    grupos.set(k, g);
  }
  return Array.from(grupos.values());
}

/** Uma renegociação por "Crédito de parcelamento": o que ele encerrou (só com a conta fechando) e o plano novo do dia. */
export function detectarRenegociacoes(movs: readonly MovReneg[], saldos: readonly SaldoAnterior[]): Renegociacao[] {
  const out: Renegociacao[] = [];
  for (const c of movs.filter((m) => m.tipo === 'credito')) {
    const desconto = movs.filter((m) => m.tipo === 'desconto' && m.conta === c.conta && m.data === c.data).reduce((s, m) => s + m.valor, 0);
    const refinanciado = r2(c.valor + desconto);
    const saldo = saldos.filter((s) => s.conta === c.conta && s.venc === c.venc).reduce((s, x) => s + x.valor, 0);
    const alemDoSaldo = refinanciado - saldo;
    const planos = planosDe(movs, c.conta);
    let encerrado: Renegociacao['encerrado'] = null;
    if (Math.abs(alemDoSaldo) > TOLERANCIA) {
      for (const p of planos) {
        const restantes = p.parcelas.filter((x) => x.venc >= c.venc).sort((a, b) => (a.parcelaNumero ?? 0) - (b.parcelaNumero ?? 0));
        // o plano aberto no próprio dia não é o que foi encerrado
        if (restantes.some((x) => x.parcelaNumero === 1 && x.data === c.data)) continue;
        if (restantes.length && Math.abs(restantes.reduce((s, x) => s + x.valor, 0) - alemDoSaldo) <= TOLERANCIA) { encerrado = { ...p.ref, restantes }; break; }
      }
    }
    const aberto = planos.find((p) => p.parcelas.some((x) => x.parcelaNumero === 1 && x.data === c.data));
    const novo = aberto ? { ...aberto.ref, total: r2(aberto.ref.valor * aberto.ref.parcelas) } : null;
    out.push({ conta: c.conta, data: c.data, venc: c.venc, refinanciado, encerrado, novo, custo: novo ? r2(novo.total - refinanciado) : null });
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * A parcela de plano encerrado que a Pluggy ainda lista num mês seguinte não vai ser cobrada lá: ela conta na fatura
 * do crédito que a anulou. Devolve os ciclos com essas parcelas movidas (a entrada não muda).
 */
export function moverParcelasEncerradas(ciclos: readonly CicloCartao[], rs: readonly Renegociacao[]): CicloCartao[] {
  const out = ciclos.map((c) => ({ ...c }));
  const ciclo = (conta: string, venc: string) => {
    let c = out.find((x) => x.conta === conta && x.venc === venc);
    if (!c) { c = { conta, venc, compras: 0, abate: 0, outrosCreditos: 0, temHistorico: true }; out.push(c); }
    return c;
  };
  for (const r of rs) {
    for (const p of r.encerrado?.restantes ?? []) {
      if (p.venc <= r.venc) continue;
      const de = ciclo(r.conta, p.venc), para = ciclo(r.conta, r.venc);
      de.compras = r2(de.compras - p.valor);
      para.compras = r2(para.compras + p.valor);
    }
  }
  return out;
}
