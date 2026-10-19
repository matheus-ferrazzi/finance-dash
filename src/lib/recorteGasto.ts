// Recorte de gasto em SQL, sem banco (19/10/2026): o painel (queries.ts) e o worker (o gasto grande do Zeca) usam
// o mesmo — o "gasto" do alerta é o mesmo da meta.
import { FIXO_DEBITO_CATS } from './grupos';
import { sqlDividaOuAtraso } from './trilha';

/**
 * Lançamentos-espelho do Bradesco: o banco replica a dívida do cartão na conta
 * corrente ("MORA CARTAO", "PROVISAO"). Não é dinheiro saindo — se entrar na
 * conta de caixa, inventa saídas de R$ 13 mil que nunca existiram.
 */
export const SO_ESPELHO_REAL = `descricao NOT ILIKE '%MORA CARTAO%' AND descricao NOT ILIKE '%PROVISAO%'`;
/**
 * "GASTOS CARTAO" NÃO é espelho (auditoria 13/10): é o débito que paga a fatura do cartão Bradesco,
 * que não tem histórico de fatura na Pluggy — o cartão registra o mesmo valor como "PAGTO. POR DEB EM C/C".
 * Fica fora só onde se paga fatura de cartão COM histórico (o "já pago" que abate a fatura real);
 * entra no saldo reconstruído, no realizado e vira a fatura mensal prevista desse cartão.
 */
export const CARTAO_SEM_FATURA = `descricao ILIKE '%GASTOS CART%'`;
export const SEM_ESPELHO = `${SO_ESPELHO_REAL} AND NOT (${CARTAO_SEM_FATURA})`;

export const CASA_CATS = ['Housing', 'Electricity', 'Water', 'Telecommunications', 'Gas'];

/**
 * 17/10: o recorte da meta de todos os gastos — despesa no débito e no crédito (o crédito no dia da compra; parcela
 * no mês em que cai), fora as contas da casa, os espelhos do cartão e a dívida antiga (renegociação, parcelamento de
 * fatura, encargos de atraso: é gasto já contado quando aconteceu). Estorno de compra abate (valor negativo); o
 * estorno financeiro ("Crédito de parcelamento", antecipação, renegociação) fica fora.
 */
export const PALAVRAS_ESTORNO_FINANCEIRO = ['PARCELAMENTO', 'ANTECIPA', 'RENEG', 'REVERSAO', 'DESAGIO', 'CESSAO', 'RESGATE', 'FATURA', 'NUFINANCEIRA'];
// auditoria 17/10 (N1): casa e dívida pela categoria EFETIVA — o "Encerramento de dívida" do Nubank chega como
// Transfers e só a regra do painel o faz dívida; pela crua, ele entrava como gasto
export const CAT_EF = 'categoria_efetiva(descricao, categoria, contraparte_doc)';
const lista = (xs: readonly string[]) => xs.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
export const GASTO_META = `forma_pagamento IN ('Débito', 'Crédito') AND NOT (COALESCE(${CAT_EF}, '') = ANY(ARRAY[${lista(CASA_CATS)}]))
  AND ${SEM_ESPELHO} AND NOT ${sqlDividaOuAtraso('descricao', CAT_EF)}
  AND (classe = 'despesa' OR (classe = 'estorno' AND NOT (translate(upper(descricao), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'AAAAEEIOOOUUC')
       LIKE ANY (ARRAY[${PALAVRAS_ESTORNO_FINANCEIRO.map((p) => `'%${p}%'`).join(',')}]))))`;
export const VALOR_GASTO = `CASE WHEN classe = 'estorno' THEN -valor ELSE valor END`;
/** travado do recorte da meta (consórcio, seguro, imposto, tarifa): pago uma vez no mês, não é ritmo do dia a dia */
export const FIXO_META = `COALESCE(${CAT_EF}, '') = ANY(ARRAY[${lista(FIXO_DEBITO_CATS)}])`;
/** parcela pela coluna ou só pela descrição ("Drogaria Sao Paulo 1/2" vem sem parcela_total) */
export const PARCELA = String.raw`(COALESCE(parcela_total, 0) > 1 OR descricao ~ '\s\d{1,2}/\d{1,2}$')`;

/**
 * 19/10: gasto grande (Zeca, no grupo): despesa no recorte da meta que não é travada (consórcio, seguro, imposto) —
 * a conta mensal previsível não é exceção; o mercado do mês e a compra grande são.
 */
export const GASTO_GRANDE = `classe = 'despesa' AND ${GASTO_META} AND NOT ${FIXO_META}`;
