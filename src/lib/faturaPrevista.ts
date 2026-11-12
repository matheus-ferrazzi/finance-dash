// Fatura prevista por vencimento (auditoria 11/11/2026). Sem banco: o SQL fica aqui para o painel e a conferência
// contra o histórico usarem o mesmo texto; a conta é função pura.
//
// A fatura de um cartão fecha como: saldo não pago da fatura anterior + compras do ciclo − TODOS os créditos do ciclo.
// Medido contra financas_faturas_historico (jul–nov/26, na véspera de cada mês): igual ou melhor que a regra anterior
// em todos os cartões. A regra anterior (só estorno de compra e desconto abatem; "Crédito de parcelamento" não) só
// acerta quando o crédito cobre exatamente o saldo não pago — o saldo ficava de fora e os dois se anulavam. Quando o
// banco encerra um plano antigo, as parcelas antecipadas entram como compra e o crédito que as anula ficava de fora.

import { sqlDividaOuAtraso } from './trilha';

/** Estorno de compra, devolução ("Crédito de "LOJA"") e descontos: abatem em qualquer cartão. */
export const ESTORNO_ABATE_FATURA = `(descricao ILIKE 'Estorno de compra%' OR descricao ILIKE 'Crédito de "%' OR descricao ILIKE 'Desconto%')`;

/** O que um cartão tem lançado para uma fatura (mês do vencimento), conhecido em hoje. */
export interface CicloCartao {
  conta: string; venc: string; compras: number;
  /** estorno de compra, devolução e desconto */
  abate: number;
  /** os outros créditos no cartão (crédito de parcelamento, renegociação…) */
  outrosCreditos: number;
  /** dentro de `compras`: as parcelas de compra (parcelado, sem dívida antiga) */
  parcelasCompra?: number;
  /** o cartão tem fatura no histórico: dá para saber o saldo não pago, então todos os créditos abatem */
  temHistorico: boolean;
}
/** O que faltou pagar de uma fatura já vencida, no mês de vencimento da fatura seguinte. */
export interface SaldoAnterior { conta: string; venc: string; valor: number }

const r2 = (x: number) => Math.round(x * 100) / 100;

/** 'AAAA-MM' do vencimento → quanto as faturas dos cartões somam, pelo que já está lançado. */
export function creditoPorVencimentoDe(ciclos: readonly CicloCartao[], saldos: readonly SaldoAnterior[]): Record<string, number> {
  const chave = (conta: string, venc: string) => `${conta}|${venc}`;
  const saldoDe = new Map<string, number>();
  for (const s of saldos) saldoDe.set(chave(s.conta, s.venc), (saldoDe.get(chave(s.conta, s.venc)) ?? 0) + s.valor);
  const out: Record<string, number> = {};
  const somar = (venc: string, v: number) => { out[venc] = r2((out[venc] ?? 0) + v); };
  const vistos = new Set<string>();
  for (const c of ciclos) {
    const k = chave(c.conta, c.venc);
    vistos.add(k);
    // sem histórico de fatura não se sabe o saldo não pago: fica a regra antiga, sem piso (cartão Bradesco)
    somar(c.venc, c.temHistorico ? Math.max(0, (saldoDe.get(k) ?? 0) + c.compras - c.abate - c.outrosCreditos) : c.compras - c.abate);
  }
  // saldo não pago de cartão que ainda não tem nada lançado para a fatura seguinte
  for (const s of saldos) {
    const k = chave(s.conta, s.venc);
    if (vistos.has(k)) continue;
    vistos.add(k);
    somar(s.venc, Math.max(0, saldoDe.get(k) ?? 0));
  }
  return out;
}

/** Parcela de compra no cartão: parcelada (pelo campo ou pelo "n/m" no fim da descrição) e que não é dívida antiga. */
export const PARCELA_DE_COMPRA = `((COALESCE(l.parcela_total, 0) > 1 OR l.descricao ~ '\\s\\d{1,2}\\s*/\\s*\\d{1,2}$')
              AND NOT ${sqlDividaOuAtraso('l.descricao', 'categoria_efetiva(l.descricao, l.categoria, l.contraparte_doc)')})`;

/** Total das parcelas de compra no crédito por mês (YYYY-MM-DD do dia 1), nos meses de $1::date[]; `filtro` a partir de $2. */
export function sqlParcelasCompraPorMes(filtro = ''): string {
  return `SELECT to_char(date_trunc('month', l.data_lancamento), 'YYYY-MM') AS mes, SUM(l.valor)::float8 AS total
            FROM financas_lancamentos l
           WHERE l.classe = 'despesa' AND l.forma_pagamento = 'Crédito' AND ${PARCELA_DE_COMPRA}
             AND date_trunc('month', l.data_lancamento) = ANY($1::date[])${filtro}
           GROUP BY 1`;
}

/**
 * Lançamentos no crédito por cartão e mês de vencimento da fatura em que caem, nesta ordem: 1) fatura_id → vencimento
 * real; 2) fatura_prevista + deslocamento da conta, aprendido dos lançamentos que têm os dois (no Nubank
 * fatura_prevista é o mês do vencimento; no Neon e no Santander, o mês anterior); 3) mês seguinte ao lançamento.
 * Só o conhecido em hoje ($1). `filtro`: SQL extra sobre `l` (a pessoa), com os parâmetros a partir de $2.
 */
export function sqlCiclosCartao(filtro = ''): string {
  const abate = ESTORNO_ABATE_FATURA.replace(/descricao/g, 'l.descricao');
  return `WITH desloc AS (
       SELECT l.account_id,
              mode() WITHIN GROUP (ORDER BY (EXTRACT(year FROM h.vencimento) * 12 + EXTRACT(month FROM h.vencimento))
                - (left(l.fatura_prevista, 4)::int * 12 + right(l.fatura_prevista, 2)::int)) AS meses
       FROM financas_lancamentos l JOIN financas_faturas_historico h ON h.id = l.fatura_id
       WHERE l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
       GROUP BY 1
     )
     SELECT COALESCE(l.account_id, '') AS conta,
            to_char(COALESCE(
              h.vencimento,
              CASE WHEN l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
                   THEN (to_date(l.fatura_prevista, 'YYYY-MM') + make_interval(months => COALESCE(d.meses, 0)::int))::date END,
              (date_trunc('month', l.data_lancamento) + interval '1 month')::date), 'YYYY-MM') AS venc,
            -- parcela de parcelamento de fatura (pagamento_fatura que SAI no cartão) também vence na fatura
            COALESCE(SUM(l.valor) FILTER (WHERE l.classe <> 'estorno'), 0)::float8 AS compras,
            COALESCE(SUM(l.valor) FILTER (WHERE l.classe = 'despesa' AND ${PARCELA_DE_COMPRA}), 0)::float8 AS parcelas_compra,
            COALESCE(SUM(l.valor) FILTER (WHERE l.classe = 'estorno' AND ${abate}), 0)::float8 AS abate,
            COALESCE(SUM(l.valor) FILTER (WHERE l.classe = 'estorno' AND NOT ${abate}), 0)::float8 AS outros,
            EXISTS (SELECT 1 FROM financas_faturas_historico x WHERE x.account_id = l.account_id) AS tem_historico
     FROM financas_lancamentos l
     LEFT JOIN financas_faturas_historico h ON h.id = l.fatura_id
     LEFT JOIN desloc d ON d.account_id = l.account_id
     WHERE (l.classe = 'despesa' OR (l.classe = 'pagamento_fatura' AND l.tipo_movimento = 'Saída')
            OR (l.classe = 'estorno' AND l.tipo_movimento = 'Entrada'))
       AND l.forma_pagamento = 'Crédito'
       AND (l.data_lancamento <= $1::date OR ((l.criado_em AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date <= $1::date)${filtro}
     GROUP BY l.account_id, 2`;
}

/**
 * Lançamentos do cartão que contam a história de uma renegociação (renegociacao.ts): o "Crédito de parcelamento", o
 * desconto da financeira e as parcelas (de compra ou de dívida), com o mês de vencimento pela mesma regra de
 * sqlCiclosCartao. Só cartão com fatura no histórico, dos últimos 200 dias em diante, conhecido em hoje ($1).
 */
export function sqlMovimentosRenegociacao(filtro = ''): string {
  return `WITH desloc AS (
       SELECT l.account_id,
              mode() WITHIN GROUP (ORDER BY (EXTRACT(year FROM h.vencimento) * 12 + EXTRACT(month FROM h.vencimento))
                - (left(l.fatura_prevista, 4)::int * 12 + right(l.fatura_prevista, 2)::int)) AS meses
       FROM financas_lancamentos l JOIN financas_faturas_historico h ON h.id = l.fatura_id
       WHERE l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
       GROUP BY 1
     )
     SELECT CASE WHEN l.classe = 'estorno' AND l.descricao ILIKE 'Crédito de parcelamento%' THEN 'credito'
                 WHEN l.classe = 'estorno' THEN 'desconto' ELSE 'parcela' END AS tipo,
            l.account_id AS conta, to_char(l.data_lancamento, 'YYYY-MM-DD') AS data,
            to_char(COALESCE(
              h.vencimento,
              CASE WHEN l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
                   THEN (to_date(l.fatura_prevista, 'YYYY-MM') + make_interval(months => COALESCE(d.meses, 0)::int))::date END,
              (date_trunc('month', l.data_lancamento) + interval '1 month')::date), 'YYYY-MM') AS venc,
            l.valor::float8 AS valor, COALESCE(l.descricao, '') AS descricao, l.parcela_numero AS pn, l.parcela_total AS pt
     FROM financas_lancamentos l
     LEFT JOIN financas_faturas_historico h ON h.id = l.fatura_id
     LEFT JOIN desloc d ON d.account_id = l.account_id
     WHERE l.forma_pagamento = 'Crédito' AND l.account_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM financas_faturas_historico x WHERE x.account_id = l.account_id)
       AND ((l.classe = 'estorno' AND l.tipo_movimento = 'Entrada'
             AND (l.descricao ILIKE 'Crédito de parcelamento%' OR l.descricao ILIKE 'Desconto (NuFinanceira)%'))
            OR (l.classe = 'despesa' AND COALESCE(l.parcela_total, 0) > 1))
       AND l.data_lancamento >= $1::date - 200
       AND (l.data_lancamento <= $1::date OR ((l.criado_em AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date <= $1::date)${filtro}`;
}

/**
 * O que faltou pagar de cada fatura já vencida em hoje ($1): total − o que o próprio cartão registrou como pagamento
 * de 10 dias antes a 20 dias depois do vencimento. Vai para o mês de vencimento da fatura seguinte. Fatura que ainda
 * não venceu fica de fora (pode ser paga inteira). `filtro`: SQL extra sobre `c` (pluggy_contas), a partir de $2.
 */
export function sqlSaldoAnterior(filtro = ''): string {
  return `SELECT h.account_id AS conta, to_char(h.vencimento + interval '1 month', 'YYYY-MM') AS venc,
            GREATEST(0, h.total - (
              SELECT COALESCE(SUM(l.valor), 0) FROM financas_lancamentos l
               WHERE l.account_id = h.account_id AND l.forma_pagamento = 'Crédito'
                 AND l.classe = 'pagamento_fatura' AND l.tipo_movimento = 'Entrada'
                 AND l.data_lancamento >= h.vencimento - 10 AND l.data_lancamento < h.vencimento + 20
                 AND l.data_lancamento <= $1::date))::float8 AS valor
       FROM financas_faturas_historico h LEFT JOIN pluggy_contas c ON c.account_id = h.account_id
      WHERE h.vencimento IS NOT NULL AND h.vencimento < $1::date AND h.total > 0${filtro}`;
}

/**
 * Média mensal por categoria nos meses-base: mês sem a conta conta como zero (um botijão de gás em três meses não é
 * gasto de todo mês — a média só dos meses em que apareceu cobrava o botijão inteiro em cada mês futuro).
 */
export function mediaMensalPorCategoria(linhas: readonly { categoria: string; total: number }[], nMeses: number): Record<string, number> {
  const n = Math.max(1, nMeses);
  const soma: Record<string, number> = {};
  for (const l of linhas) soma[l.categoria] = (soma[l.categoria] ?? 0) + l.total;
  return Object.fromEntries(Object.entries(soma).map(([c, v]) => [c, r2(v / n)]));
}
