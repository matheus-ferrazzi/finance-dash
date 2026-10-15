import { q, qw, writerPool } from './db';
import { currentMonthSP, escaparLike, normalizeMes, mesLongo, mesLabel, currentDateSP } from './format';
import {
  agruparDividas, chaveDivida, ehAtraso, marcaDinheiro, mesesComContaNegativa, MESES_ATRASO, MESES_SOBRA, METAS_PADRAO,
  type ChaveMeta, type DadosTrilha, type MarcasDivida, type MetasTrilha,
} from './trilha';
import { debitoParaSairAte, textoMetaAlvo } from './meta';
import { estadoMeta } from './metaMes';
import { categoriaEfetiva, nomeSemDocumento, normalizarTexto, recalcular, sugerirTexto, type Origem, type RegraPainel, type TipoRegra } from './categoriaPainel';
import { detectarAssinaturas, type Assinatura } from './assinaturas';
import { agruparGastos, FIXO_DEBITO_CATS, grupoDaCategoria, type GrupoGasto } from './grupos';
import { montarMes, padraoDe, type ResumoMes } from './contas';
import { estimarDebito, REGRA_DEBITO, type MesDebito, type RegraDebito } from './debito';
import { componentesPrevistos, type Componentes } from './backtest';
import { calibrarValidada, doRegime, faixaMes, faixaMesCorrente, type Calibracao } from './faixa';
import { saiDoVermelho } from './decisoes';
import { situacaoFatura, type UltimaFatura } from './faturas';
import { periodoDaSemana } from './periodos';
import type { DadosAvisos } from './avisos';
import type { MarcaInput, PedidoRegra } from './validation';
import {
  addMonths, aplicarParteDoCasal, chaveParte, computeProjecao, computeRitmo, diasNoMes, mesesBaseReceita, receitaAindaAEntrar, receitaRecorrente,
  type CompromissoManual, type EntradaReceita, type ProjecaoBase, type ReceitaPrevista, type SaldoConta,
} from './previsao';

export {
  addMonths, computeProjecao, computeRitmo, diasNoMes, mediana,
  type CompromissoManual, type ProjecaoBase, type ProjecaoMes, type ReceitaPrevista, type Ritmo, type SaldoConta,
} from './previsao';

export { currentDateSP };

export type Resp = 'casal' | 'Matheus' | 'Ariane';

// ---------- período (mês ou janela de dias) ----------
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
function monthStartShift(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 10);
}

export type PeriodKind = '7d' | '15d' | '30d' | 'mes' | 'semana';
export interface Periodo {
  kind: PeriodKind;
  start: string; endExcl: string;
  prevStart: string; prevEndExcl: string;
  label: string; mesAnchor: string;
}

export function resolvePeriodo(p?: string, mes?: string): Periodo {
  // N19: semana do resumo semanal (p=sem-AAAA-MM-DD)
  const sem = periodoDaSemana(p);
  if (sem) {
    return {
      kind: 'semana', start: sem.inicio, endExcl: sem.fimExcl,
      prevStart: addDays(sem.inicio, -7), prevEndExcl: sem.inicio, label: sem.label, mesAnchor: sem.inicio.slice(0, 7),
    };
  }
  if (p === '7d' || p === '15d' || p === '30d') {
    const days = p === '7d' ? 7 : p === '15d' ? 15 : 30;
    const hoje = currentDateSP();
    const start = addDays(hoje, -(days - 1));
    const endExcl = addDays(hoje, 1);
    return {
      kind: p, start, endExcl,
      prevStart: addDays(start, -days), prevEndExcl: start,
      label: `Últimos ${days} dias`, mesAnchor: hoje.slice(0, 7),
    };
  }
  const m = normalizeMes(mes);
  const start = `${m}-01`;
  return {
    kind: 'mes', start, endExcl: monthStartShift(m, 1),
    prevStart: monthStartShift(m, -1), prevEndExcl: start,
    label: mesLongo(m), mesAnchor: m,
  };
}

// filtro de responsável começando em $idx
function rf(resp: Resp, idx: number): { sql: string; p: string[] } {
  if (resp === 'Matheus' || resp === 'Ariane') return { sql: ` AND responsavel = $${idx}`, p: [resp] };
  return { sql: '', p: [] };
}
// regra única: nunca contar lançamento com data no futuro (parcela agendada)
const HOJE = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

/**
 * Lançamentos-espelho do Bradesco: o banco replica a dívida do cartão na conta
 * corrente ("MORA CARTAO", "PROVISAO"). Não é dinheiro saindo — se entrar na
 * conta de caixa, inventa saídas de R$ 13 mil que nunca existiram.
 */
const SO_ESPELHO_REAL = `descricao NOT ILIKE '%MORA CARTAO%' AND descricao NOT ILIKE '%PROVISAO%'`;
/**
 * "GASTOS CARTAO" NÃO é espelho (auditoria 13/10): é o débito que paga a fatura do cartão Bradesco,
 * que não tem histórico de fatura na Pluggy — o cartão registra o mesmo valor como "PAGTO. POR DEB EM C/C".
 * Fica fora só onde se paga fatura de cartão COM histórico (o "já pago" que abate a fatura real);
 * entra no saldo reconstruído, no realizado e vira a fatura mensal prevista desse cartão.
 */
const CARTAO_SEM_FATURA = `descricao ILIKE '%GASTOS CART%'`;
const SEM_ESPELHO = `${SO_ESPELHO_REAL} AND NOT (${CARTAO_SEM_FATURA})`;
const RANGE = `data_lancamento >= $1::date AND data_lancamento < $2::date AND data_lancamento <= ${HOJE}`;

export interface Kpis {
  receita: number; despesa: number; saldo: number; aporte: number; patrimonio: number;
  receita_ant: number; despesa_ant: number;
}

export async function getKpis(resp: Resp, per: Periodo): Promise<Kpis> {
  const r = rf(resp, 5);
  const rows = await q<any>(
    `SELECT
       COALESCE(SUM(valor) FILTER (WHERE classe='receita' AND data_lancamento >= $1::date AND data_lancamento < $2::date),0) AS receita,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date),0) AS despesa,
       COALESCE(SUM(valor) FILTER (WHERE classe='aporte'  AND data_lancamento >= $1::date AND data_lancamento < $2::date),0) AS aporte,
       COALESCE(SUM(valor) FILTER (WHERE classe='receita' AND data_lancamento >= $3::date AND data_lancamento < $4::date),0) AS receita_ant,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND data_lancamento >= $3::date AND data_lancamento < $4::date),0) AS despesa_ant
     FROM financas_lancamentos
     WHERE data_lancamento >= $3::date AND data_lancamento < $2::date AND data_lancamento <= ${HOJE}${r.sql}`,
    [per.start, per.endExcl, per.prevStart, per.prevEndExcl, ...r.p],
  );
  const x = rows[0];
  const receita = Number(x.receita), despesa = Number(x.despesa);
  const patrimonio = await getPatrimonioAtual(resp);
  return {
    receita, despesa, saldo: receita - despesa, aporte: Number(x.aporte), patrimonio,
    receita_ant: Number(x.receita_ant), despesa_ant: Number(x.despesa_ant),
  };
}

export async function getPatrimonioAtual(resp: Resp): Promise<number> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT COALESCE(SUM(valor_atual),0) AS v FROM financas_investimentos
     WHERE COALESCE(status,'ACTIVE') NOT IN ('CLOSED','TOTAL_WITHDRAWAL','WITHDRAWN') AND COALESCE(valor_atual,0)>0${r.sql}`,
    r.p,
  );
  return Number(rows[0]?.v ?? 0);
}

export interface SeriePonto { mes: string; receita: number; despesa: number; }

export async function getSerie(resp: Resp, per: Periodo, meses = 6): Promise<SeriePonto[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT to_char(date_trunc('month',data_lancamento),'YYYY-MM') AS mes,
            COALESCE(SUM(valor) FILTER (WHERE classe='receita'),0) AS receita,
            COALESCE(SUM(valor) FILTER (WHERE classe='despesa'),0) AS despesa
     FROM financas_lancamentos
     WHERE data_lancamento >= (date_trunc('month',$1::date) - interval '${meses - 1} months')
       AND data_lancamento < (date_trunc('month',$1::date) + interval '1 month')
       AND data_lancamento <= ${HOJE}${r.sql}
     GROUP BY 1 ORDER BY 1`,
    [`${per.mesAnchor}-01`, ...r.p],
  );
  return rows.map((x) => ({ mes: x.mes, receita: Number(x.receita), despesa: Number(x.despesa) }));
}

export interface OrcItem { item: string; emoji: string; teto: number; gasto: number; categorias: string[]; }

export async function getOrcamento(resp: Resp, per: Periodo): Promise<OrcItem[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT o.item, o.emoji, o.teto, o.categorias,
            COALESCE((
              SELECT SUM(l.valor) FROM financas_lancamentos l
              WHERE l.classe='despesa'
                AND l.data_lancamento >= $1::date AND l.data_lancamento < (date_trunc('month',$1::date) + interval '1 month')
                AND l.data_lancamento <= ${HOJE}
                AND l.categoria = ANY(o.categorias)${r.sql.replace('responsavel', 'l.responsavel')}
            ),0) AS gasto
     FROM financas_orcamento o WHERE o.ativo = true ORDER BY o.item`,
    [`${per.mesAnchor}-01`, ...r.p],
  );
  return rows.map((x) => ({
    item: x.item, emoji: x.emoji ?? '•', teto: Number(x.teto), gasto: Number(x.gasto),
    categorias: Array.isArray(x.categorias) ? x.categorias : [],
  }));
}

export interface Lanc {
  id: string; data: string; valor: number; descricao: string;
  categoria: string; banco: string; responsavel: string; classe: string;
  /** N19: 'Débito' | 'Crédito' (quando a consulta traz) */
  forma?: string;
}
function mapLanc(rows: any[]): Lanc[] {
  return rows.map((r) => ({
    id: r.id, data: r.data, valor: Number(r.valor), descricao: r.descricao,
    categoria: r.categoria, banco: r.banco, responsavel: r.responsavel, classe: r.classe,
    ...(r.forma ? { forma: r.forma } : {}),
  }));
}

export async function getDespesas(resp: Resp, per: Periodo): Promise<Lanc[]> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT id_transacao AS id, data_lancamento AS data, valor, descricao,
            categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe,
            forma_pagamento AS forma
     FROM financas_lancamentos WHERE classe='despesa' AND ${RANGE}${r.sql}
     ORDER BY valor DESC`,
    [per.start, per.endExcl, ...r.p],
  );
  return mapLanc(rows);
}

export async function getRecentes(resp: Resp, per: Periodo, limit = 10): Promise<Lanc[]> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT id_transacao AS id, data_lancamento AS data, valor, descricao,
            categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE classe IN ('despesa','receita') AND ${RANGE}${r.sql}
     ORDER BY data_lancamento DESC, criado_em DESC LIMIT ${limit}`,
    [per.start, per.endExcl, ...r.p],
  );
  return mapLanc(rows);
}

export type { UltimaFatura };
export interface Fatura {
  id: string; banco: string; responsavel: string;
  /** saldo devedor do cartão (fatura fechada + compras do ciclo novo) — "limite usado", não fatura */
  usado: number;
  limite: number; disponivel: number;
  /** dia de fechamento do ciclo aberto (para listar as compras do ciclo) */
  fechamento: string | null;
  /** a última fatura que fechou (histórico da Pluggy), com situação; null = cartão sem fatura no histórico */
  ultima: UltimaFatura | null;
}
/**
 * Cartões com a última fatura fechada (N4, auditoria 13/10). Uma função para tela, home, bot e lembrete:
 * pago = pagamentos que o próprio cartão registrou desde 10 dias antes do vencimento (data+valor sem repetir:
 * o Nubank grava o mesmo pagamento 2×); parcelado = "Crédito de parcelamento" na mesma janela.
 */
export async function getFaturas(resp: Resp, hoje: string = currentDateSP()): Promise<Fatura[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT f.id_conta AS id, COALESCE(f.banco,'—') AS banco, f.responsavel,
            COALESCE(f.valor_fatura_atual,0)::float8 AS usado, COALESCE(f.limite_total,0)::float8 AS limite,
            COALESCE(f.limite_disponivel,0)::float8 AS disponivel, to_char(f.data_fechamento,'YYYY-MM-DD') AS fechamento,
            to_char(h.vencimento,'YYYY-MM-DD') AS venc, h.total::float8 AS total,
            (SELECT COALESCE(SUM(p.valor),0)::float8 FROM (SELECT DISTINCT l.data_lancamento, l.valor FROM financas_lancamentos l
               WHERE l.account_id = f.id_conta AND l.forma_pagamento = 'Crédito' AND l.classe = 'pagamento_fatura'
                 AND l.tipo_movimento = 'Entrada' AND l.data_lancamento >= h.vencimento - 10 AND l.data_lancamento <= $1::date) p) AS pago,
            (SELECT COALESCE(SUM(l.valor),0)::float8 FROM financas_lancamentos l
               WHERE l.account_id = f.id_conta AND l.forma_pagamento = 'Crédito' AND l.tipo_movimento = 'Entrada'
                 AND l.descricao ILIKE '%parcelamento%' AND l.data_lancamento >= h.vencimento - 10 AND l.data_lancamento <= $1::date) AS parcelado
       FROM financas_faturas f
       LEFT JOIN LATERAL (SELECT vencimento, total FROM financas_faturas_historico x
                           WHERE x.account_id = f.id_conta AND x.vencimento IS NOT NULL
                           ORDER BY x.vencimento DESC LIMIT 1) h ON true
      WHERE 1=1${r.sql.replace('responsavel', 'f.responsavel')}
      ORDER BY h.vencimento NULLS LAST, f.banco`,
    [hoje, ...r.p],
  );
  return rows.map((x) => {
    const base = { total: Math.round(Number(x.total) * 100) / 100, pago: Number(x.pago), parcelado: Number(x.parcelado), vencimento: x.venc };
    return {
      id: x.id, banco: x.banco, responsavel: x.responsavel,
      usado: Number(x.usado), limite: Number(x.limite), disponivel: Number(x.disponivel), fechamento: x.fechamento,
      ultima: x.venc && x.total !== null ? { ...base, ...situacaoFatura(base, hoje) } : null,
    };
  });
}

export interface Investimento {
  id: string; nome: string; tipo: string; subtipo: string;
  investido: number; atual: number; lucro: number; rent: number;
  banco: string; responsavel: string;
}
export async function getInvestimentos(resp: Resp): Promise<Investimento[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT id_investimento AS id, COALESCE(nome,'—') AS nome, COALESCE(tipo,'—') AS tipo,
            COALESCE(subtipo,'') AS subtipo, COALESCE(valor_investido,0) AS investido,
            COALESCE(valor_atual,0) AS atual, COALESCE(lucro_acumulado,0) AS lucro,
            COALESCE(rentabilidade_anual,0) AS rent, COALESCE(banco,'—') AS banco, responsavel
     FROM financas_investimentos
     WHERE COALESCE(status,'ACTIVE') NOT IN ('CLOSED','TOTAL_WITHDRAWAL','WITHDRAWN') AND COALESCE(valor_atual,0) > 0${r.sql}
     ORDER BY valor_atual DESC`,
    r.p,
  );
  return rows.map((x) => {
    const investido = Number(x.investido), atual = Number(x.atual);
    return {
      id: x.id, nome: x.nome, tipo: x.tipo, subtipo: x.subtipo, banco: x.banco, responsavel: x.responsavel,
      investido, atual, rent: Number(x.rent),
      lucro: atual > 0 && investido > 0 ? atual - investido : Number(x.lucro),
    };
  });
}

export interface AportePonto { mes: string; valor: number; }
export async function getAporteMensal(resp: Resp, meses = 12): Promise<AportePonto[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT to_char(date_trunc('month',data_lancamento),'YYYY-MM') AS mes,
            ROUND(COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Saída'),0)
                  - COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Entrada'),0), 2) AS valor
     FROM financas_lancamentos
     WHERE classe='aporte'
       AND data_lancamento >= (date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '${meses - 1} months')${r.sql}
     GROUP BY 1 ORDER BY 1`,
    r.p,
  );
  return rows.map((x) => ({ mes: x.mes, valor: Number(x.valor) }));
}

/**
 * Contas fixas da casa. "Internet" ficou DE FORA de propósito: nesta base a Pluggy
 * joga compras de TikTok/ByteDance nessa categoria, e a conta de internet de verdade
 * vem da Telefônica dentro de "Telecommunications". Tratar "Internet" como fixo
 * cobrava compra avulsa como se fosse conta do mês.
 */
export const CASA_CATS = ['Housing', 'Electricity', 'Water', 'Telecommunications', 'Gas'];

export async function getCasaSerie(resp: Resp, per: Periodo, meses = 6): Promise<SeriePonto[]> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT to_char(date_trunc('month',data_lancamento),'YYYY-MM') AS mes, ROUND(SUM(valor),2) AS despesa
     FROM financas_lancamentos
     WHERE classe='despesa' AND categoria = ANY($2::text[])
       AND data_lancamento >= (date_trunc('month',$1::date) - interval '${meses - 1} months')
       AND data_lancamento < (date_trunc('month',$1::date) + interval '1 month')
       AND data_lancamento <= ${HOJE}${r.sql}
     GROUP BY 1 ORDER BY 1`,
    [`${per.mesAnchor}-01`, CASA_CATS, ...r.p],
  );
  return rows.map((x) => ({ mes: x.mes, receita: 0, despesa: Number(x.despesa) }));
}

/** sentinela para conexão sem last_sync — grande o bastante pra cair no vermelho */
export const NUNCA_SINCRONIZOU = 99999;

export interface SyncConn { banco: string; responsavel: string; lastSync: string; horas: number; }
export interface SyncStatus { oldestH: number; conns: SyncConn[] }

export async function getSyncStatus(): Promise<SyncStatus> {
  const rows = await q<any>(
    `SELECT banco, responsavel, to_char(last_sync,'YYYY-MM-DD"T"HH24:MI:SSOF') AS last_sync,
            ROUND(EXTRACT(EPOCH FROM (now()-last_sync))/3600, 1) AS horas
     FROM financas_sync ORDER BY last_sync ASC NULLS FIRST`,
  );
  // last_sync nulo = conexão que nunca sincronizou. Sem esse tratamento o
  // Number(null)=0 fazia ela aparecer como a MAIS fresca de todas, em verde.
  const conns: SyncConn[] = rows.map((r) => ({
    banco: r.banco, responsavel: r.responsavel, lastSync: r.last_sync,
    horas: r.horas == null ? NUNCA_SINCRONIZOU : Number(r.horas),
  }));
  const oldestH = conns.length ? Math.max(...conns.map((c) => c.horas)) : 0;
  return { oldestH, conns };
}

/** compras de crédito (despesa) numa janela ampla, pra montar a composição da fatura por cartão */
export async function getCreditoDespesas(resp: Resp): Promise<Lanc[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor, descricao,
            categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE classe='despesa' AND forma_pagamento='Crédito'
       AND data_lancamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 75
       AND data_lancamento <  (now() AT TIME ZONE 'America/Sao_Paulo')::date + 75${r.sql}
     ORDER BY data_lancamento DESC, valor DESC`,
    r.p,
  );
  return mapLanc(rows);
}

export type { Assinatura } from './assinaturas';

/**
 * Gastos recorrentes que você ainda NÃO está acompanhando.
 * De propósito exclui o que já vira compromisso na /previsibilidade (categoria
 * cadastrada ou parcelamento com data futura): senão o aluguel aparecia nas duas
 * telas com valores diferentes — aqui a média histórica, lá o valor cadastrado.
 * Assinaturas = descoberta; Compromissos = acompanhamento.
 */
export async function getAssinaturas(resp: Resp): Promise<Assinatura[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `WITH ja_acompanhado AS (
       SELECT DISTINCT categoria FROM financas_compromissos WHERE ativo = true
     ),
     chaves_parceladas AS (
       SELECT DISTINCT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS ch
       FROM financas_lancamentos
       WHERE classe='despesa' AND data_lancamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date
     ),
     base AS (
       SELECT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave,
              valor::float8 AS valor, categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, COALESCE(banco,'—') AS banco,
              to_char(data_lancamento,'YYYY-MM-DD') AS data, responsavel,
              (COALESCE(parcela_total,0) > 1 OR descricao ~ '\\s\\d{1,2}\\s*/\\s*\\d{1,2}$') AS parcelado
       FROM financas_lancamentos
       WHERE classe='despesa'
         AND data_lancamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '6 months'
         AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     )
     SELECT chave, valor, categoria, banco, data, parcelado, responsavel
     FROM base
     WHERE length(chave) >= 4
       AND categoria NOT IN (SELECT categoria FROM ja_acompanhado)
       AND chave NOT IN (SELECT ch FROM chaves_parceladas)`,
    r.p,
  );
  return detectarAssinaturas(rows.map((x) => ({
    chave: x.chave, valor: Number(x.valor), categoria: x.categoria, banco: x.banco, data: x.data, parcelado: Boolean(x.parcelado),
    responsavel: x.responsavel,
  })), currentDateSP());
}

/** Contas do mês (G): contas fixas + marcações da tela, conferidas com as saídas do banco. */
export async function getContasDoMes(resp: Resp, mes: string): Promise<ResumoMes> {
  const r = rf(resp, 2);
  const inicioMes = `${mes}-01`;
  const [contas, marcas, movs, entrou] = await Promise.all([
    q<any>(`SELECT id, nome, responsavel, valor_previsto::float8 AS valor, padrao, banco, tolerancia::float8 AS tolerancia, somar,
                   to_char(inicio,'YYYY-MM') AS inicio, parcelas, ordem, to_char(ate,'YYYY-MM') AS ate,
                   to_char(valor_definido_em,'YYYY-MM') AS valor_definido_em
            FROM financas_contas_fixas WHERE ativo${rf(resp, 1).sql}`, rf(resp, 1).p),
    q<any>(`SELECT id, mes, conta_id, responsavel, nome, valor::float8 AS valor, pago
            FROM financas_contas_marcas WHERE mes = $1${r.sql} ORDER BY id`, [mes, ...r.p]),
    // 3 meses antes: o previsto da conta variável é o último valor pago
    q<any>(`SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor::float8 AS valor,
                   coalesce(descricao,'') AS descricao, coalesce(banco,'') AS banco, responsavel
            FROM financas_lancamentos
            WHERE tipo_movimento = 'Saída'
              AND data_lancamento >= $1::date - interval '3 months' AND data_lancamento < $1::date + interval '1 month'
              AND data_lancamento <= ${HOJE}${r.sql}`, [inicioMes, ...r.p]),
    q<any>(`SELECT coalesce(sum(valor),0)::float8 AS v FROM financas_lancamentos
            WHERE classe = 'receita' AND data_lancamento >= $1::date AND data_lancamento < $1::date + interval '1 month'
              AND data_lancamento <= ${HOJE}${r.sql}`, [inicioMes, ...r.p]),
  ]);
  return montarMes(
    mes,
    contas.map((c) => ({ id: c.id, nome: c.nome, responsavel: c.responsavel, valorPrevisto: c.valor, padrao: c.padrao, banco: c.banco,
      tolerancia: c.tolerancia, somar: c.somar, inicio: c.inicio, parcelas: c.parcelas, ordem: c.ordem, ate: c.ate, valorDefinidoEm: c.valor_definido_em })),
    marcas.map((m) => ({ id: m.id, mes: m.mes, contaId: m.conta_id, responsavel: m.responsavel, nome: m.nome, valor: m.valor, pago: m.pago })),
    movs,
    entrou[0].v,
  );
}

/** Grava um ✓, um "tirar do mês" ou uma avulsa. Na conta fixa há uma marcação por mês: a nova troca a anterior. */
/** `cli`: cliente de uma transação (E3-M2: o bot grava e marca a ação juntos); sem ele, o pool de escrita. */
export async function criarMarca(m: MarcaInput, cli?: { query: (t: string, p: unknown[]) => Promise<{ rows: any[] }> }): Promise<number> {
  const run = async (sql: string, p: unknown[]) => (cli ? (await cli.query(sql, p)).rows : await qw<any>(sql, p));
  if (m.contaId !== null) {
    const ja = await run(`UPDATE financas_contas_marcas SET pago = $3 WHERE mes = $1 AND conta_id = $2 RETURNING id`, [m.mes, m.contaId, m.pago]);
    if (ja.length) return Number(ja[0].id);
  }
  const rows = await run(
    `INSERT INTO financas_contas_marcas (mes, conta_id, responsavel, nome, valor, pago) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [m.mes, m.contaId, m.responsavel, m.nome, m.valor, m.pago],
  );
  return Number(rows[0].id);
}

export async function apagarMarca(id: number): Promise<void> {
  await qw(`DELETE FROM financas_contas_marcas WHERE id = $1`, [id]);
}

/**
 * "Repetir todo mês": a avulsa já confirmada pelo banco vira conta fixa a partir do mês dela, com o
 * padrão tirado da descrição real do pagamento — conta nova já nasce validada pelo extrato.
 */
export async function repetirTodoMes(marcaId: number): Promise<number> {
  const [a] = await q<any>(`SELECT mes, responsavel FROM financas_contas_marcas WHERE id = $1 AND conta_id IS NULL`, [marcaId]);
  if (!a) throw new Error('avulsa não encontrada');
  const item = (await getContasDoMes(a.responsavel, a.mes)).itens.find((i) => i.marcaId === marcaId);
  if (!item?.origem || item.pago === null) throw new Error('só dá para repetir depois que o banco confirmar o pagamento');

  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    const { rows } = await cli.query(
      `INSERT INTO financas_contas_fixas (nome, responsavel, valor_previsto, padrao, banco, tolerancia, inicio, ordem)
       SELECT $1, $2, $3, $4, $5, $6, ($7 || '-01')::date, coalesce(max(ordem), 0) + 1 FROM financas_contas_fixas
       RETURNING id`,
      [item.nome, a.responsavel, item.pago, padraoDe(item.origem.descricao), item.origem.banco, TOLERANCIA_REPETIR, a.mes],
    );
    await cli.query(`DELETE FROM financas_contas_marcas WHERE id = $1`, [marcaId]);
    await cli.query('COMMIT');
    return Number(rows[0].id);
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}
const TOLERANCIA_REPETIR = 0.2; // padrão vindo de PIX pode casar outro pagamento à mesma pessoa

/** Alterar valor previsto da conta fixa a partir de `mes` ('YYYY-MM'); os meses anteriores ficam como estavam. */
export async function alterarValorConta(id: number, valor: number, mes: string): Promise<void> {
  await qw(`UPDATE financas_contas_fixas SET valor_previsto = $2, valor_definido_em = ($3 || '-01')::date WHERE id = $1`, [id, valor, mes]);
}

/** Alterar o valor de uma avulsa — só enquanto o banco não confirmou (depois, vale o valor do extrato). */
export async function alterarValorAvulsa(marcaId: number, valor: number): Promise<void> {
  const [a] = await q<any>(`SELECT mes, responsavel FROM financas_contas_marcas WHERE id = $1 AND conta_id IS NULL`, [marcaId]);
  if (!a) throw new Error('avulsa não encontrada');
  const item = (await getContasDoMes(a.responsavel, a.mes)).itens.find((i) => i.marcaId === marcaId);
  if (item?.status === 'pago') throw new Error('já confirmada pelo banco: vale o valor do extrato');
  await qw(`UPDATE financas_contas_marcas SET valor = $2 WHERE id = $1 AND conta_id IS NULL`, [marcaId, valor]);
}

/** "Remover de vez": `ultimoMes` ('YYYY-MM') é o último mês em que a conta aparece. */
export async function encerrarConta(id: number, ultimoMes: string): Promise<void> {
  await qw(`UPDATE financas_contas_fixas SET ate = ($2 || '-01')::date WHERE id = $1`, [id, ultimoMes]);
}

/** Movimento líquido da conta por dia (entrada +, saída −), só débito, de `desde` até `hoje`. */
export async function getMovimentosDiarios(resp: Resp, desde: string, hoje: string = currentDateSP()): Promise<Record<string, number>> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT to_char(data_lancamento,'YYYY-MM-DD') AS dia,
            SUM(CASE WHEN tipo_movimento='Entrada' THEN valor ELSE -valor END)::float8 AS liquido
     FROM financas_lancamentos
     WHERE forma_pagamento='Débito' AND data_lancamento >= $1::date AND data_lancamento <= $2::date
       AND ${SO_ESPELHO_REAL}${r.sql}
     GROUP BY 1`,
    [desde, hoje, ...r.p],
  );
  return Object.fromEntries(rows.filter((x) => Number(x.liquido) !== 0).map((x) => [x.dia, Math.round(Number(x.liquido) * 100) / 100]));
}

export async function getBusca(resp: Resp, termo: string): Promise<Lanc[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor, descricao,
            categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE descricao ILIKE '%' || $1 || '%'
       AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     ORDER BY data_lancamento DESC LIMIT 80`,
    [escaparLike(termo), ...r.p],
  );
  return mapLanc(rows);
}

export interface PatrimonioPonto { data: string; valor: number; }
export async function getPatrimonioHistorico(resp: Resp): Promise<PatrimonioPonto[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT to_char(data,'YYYY-MM-DD') AS data, ROUND(SUM(valor_atual),2) AS valor
     FROM financas_patrimonio WHERE 1=1${r.sql} GROUP BY data ORDER BY data`,
    r.p,
  );
  return rows.map((x) => ({ data: x.data, valor: Number(x.valor) }));
}

// ==================== PREVISIBILIDADE ====================
// "quanto vou ter daqui a X meses", "por quanto tempo estou comprometido",
// "se eu comprar isso agora, fico no vermelho?"

/** parcelamentos de cartão detectados automaticamente (a Pluggy já lança as parcelas futuras) */
export interface CompromissoParcelado {
  chave: string; categoria: string; banco: string; responsavel: string;
  valorParcela: number; restantes: number; dataFim: string;
  parcelaAtual: number | null; parcelaTotal: number | null;
}

export async function getCompromissosParcelados(resp: Resp): Promise<CompromissoParcelado[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `WITH fut AS (
       SELECT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave,
              descricao, valor, data_lancamento, categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria,
              COALESCE(banco,'—') AS banco, responsavel, parcela_numero, parcela_total
       FROM financas_lancamentos
       WHERE classe='despesa' AND data_lancamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     )
     -- N9: o plano (parcela_total) separa dois parcelamentos com a mesma descrição (renegociação 3× e 8×)
     SELECT chave, COUNT(*) AS restantes, ROUND(AVG(valor),2) AS valor_parcela,
            to_char(MAX(data_lancamento),'YYYY-MM-DD') AS data_fim,
            mode() WITHIN GROUP (ORDER BY categoria) AS categoria,
            mode() WITHIN GROUP (ORDER BY banco) AS banco,
            mode() WITHIN GROUP (ORDER BY responsavel) AS responsavel,
            (array_agg(descricao ORDER BY data_lancamento ASC))[1] AS proxima_desc,
            (array_agg(parcela_numero ORDER BY data_lancamento ASC))[1] AS proxima_num,
            MAX(parcela_total) AS plano
     FROM fut
     WHERE length(chave) >= 4
     GROUP BY chave, banco, COALESCE(parcela_total, 0)
     ORDER BY data_fim DESC`,
    r.p,
  );
  return rows.map((x) => {
    // parcela pelo campo do banco (Nubank); senão "3/4" no fim da descrição. Exige atual <= total pra
    // não ler data como parcela ("05/09" viraria "parcela 5 de 9"), e o total tem que ser > 1.
    const m = String(x.proxima_desc ?? '').match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/);
    const pAtual = x.plano ? Number(x.proxima_num) : m ? Number(m[1]) : null;
    const pTotal = x.plano ? Number(x.plano) : m ? Number(m[2]) : null;
    const parcelaValida = pAtual != null && pTotal != null && pTotal > 1 && pAtual <= pTotal;
    return {
      chave: x.chave, categoria: x.categoria, banco: x.banco, responsavel: x.responsavel,
      valorParcela: Number(x.valor_parcela), restantes: Number(x.restantes), dataFim: x.data_fim,
      parcelaAtual: parcelaValida ? pAtual : null, parcelaTotal: parcelaValida ? pTotal : null,
    };
  });
}

export async function getCompromissosManuais(resp: Resp): Promise<CompromissoManual[]> {
  const filtro = resp === 'casal' ? '' : ` AND responsavel IN ($1,'casal')`;
  const params = resp === 'casal' ? [] : [resp];
  const rows = await q<any>(
    `SELECT id, nome, categoria, valor, responsavel, to_char(data_inicio,'YYYY-MM-DD') AS data_inicio,
            meses_totais, observacao,
            CASE WHEN meses_totais IS NOT NULL
                 THEN to_char(data_inicio + ((meses_totais-1) || ' months')::interval, 'YYYY-MM-DD')
                 ELSE NULL END AS data_fim
     FROM financas_compromissos
     WHERE ativo = true${filtro}
     ORDER BY data_inicio`,
    params,
  );
  return rows.map((x) => ({
    id: Number(x.id), nome: x.nome, categoria: x.categoria, valor: Number(x.valor), responsavel: x.responsavel,
    dataInicio: x.data_inicio, mesesTotais: x.meses_totais == null ? null : Number(x.meses_totais),
    observacao: x.observacao, dataFim: x.data_fim,
  }));
}

export interface CompromissoInput {
  nome: string; categoria: string; valor: number; responsavel: 'casal' | 'Matheus' | 'Ariane';
  dataInicio: string; mesesTotais: number | null; observacao?: string | null;
}

export async function createCompromisso(data: CompromissoInput): Promise<number> {
  const rows = await qw<any>(
    `INSERT INTO financas_compromissos (nome,categoria,valor,responsavel,data_inicio,meses_totais,observacao)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [data.nome, data.categoria, data.valor, data.responsavel, data.dataInicio, data.mesesTotais, data.observacao ?? null],
  );
  return Number(rows[0].id);
}

export async function updateCompromisso(id: number, data: CompromissoInput): Promise<void> {
  await qw(
    `UPDATE financas_compromissos SET nome=$1,categoria=$2,valor=$3,responsavel=$4,data_inicio=$5,meses_totais=$6,observacao=$7,atualizado_em=now()
     WHERE id=$8`,
    [data.nome, data.categoria, data.valor, data.responsavel, data.dataInicio, data.mesesTotais, data.observacao ?? null, id],
  );
}

export async function deleteCompromisso(id: number): Promise<void> {
  await qw(`DELETE FROM financas_compromissos WHERE id=$1`, [id]);
}

/** saldo real das contas correntes (vem da Pluggy via workflow "Pluggy - Saldos das Contas") */
export async function getSaldoContas(resp: Resp): Promise<{ total: number; contas: SaldoConta[] }> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT banco, responsavel, saldo, to_char(atualizado_pluggy,'YYYY-MM-DD"T"HH24:MI:SS') AS atualizado_pluggy
     FROM financas_saldos WHERE 1=1${r.sql} ORDER BY saldo DESC`,
    r.p,
  );
  const contas = rows.map((x) => ({
    banco: x.banco, responsavel: x.responsavel, saldo: Number(x.saldo), atualizadoPluggy: x.atualizado_pluggy,
  }));
  return { total: contas.reduce((s, c) => s + c.saldo, 0), contas };
}

/**
 * Meses cujos dados dão pra confiar. Detector: transferência entre contas próprias
 * tem que se anular (sai de uma, entra na outra). Quando não anula, é porque alguma
 * conta ainda não estava conectada na Pluggy e faltam lançamentos naquele mês.
 * Sem esse filtro as médias ficam infladas por meses pela metade.
 */
async function getMesesConfiaveis(resp: Resp, hoje: string): Promise<string[]> {
  const r = rf(resp, 1);
  const h = `$${r.p.length + 1}::date`;
  const rows = await q<any>(
    `SELECT to_char(mes,'YYYY-MM-DD') AS mes FROM (
       SELECT date_trunc('month',data_lancamento) AS mes,
              ABS(COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Entrada'),0)
                - COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Saída'),0)) AS gap
       FROM financas_lancamentos
       WHERE classe='transferencia_interna' AND forma_pagamento='Débito'
         AND data_lancamento >= date_trunc('month',${h}) - interval '6 months'
         AND data_lancamento <  date_trunc('month',${h})${r.sql}
       GROUP BY 1
     ) x WHERE gap < 1000 ORDER BY mes DESC LIMIT 3`,
    [...r.p, hoje],
  );
  const confiaveis = rows.map((x) => x.mes);
  if (confiaveis.length > 0) return confiaveis;
  // nenhum mês passou no teste — cai pros últimos 3 pra não zerar a projeção
  return [1, 2, 3].map((i) => `${addMonths(hoje.slice(0, 7), -i)}-01`);
}

export interface PrevisaoResumo {
  mes: string; mesLabel: string;
  saldoHoje: number; aindaEntra: number; aindaSai: number; fechaCom: number;
  diasRestantes: number;
  /** quanto dá pra gastar por dia no resto do mês pra fechar no zero */
  ritmoSeguroDia: number;
  /** quanto você está gastando por dia neste mês */
  ritmoAtualDia: number;
  /** o que sobra para o dia a dia até o fim do mês (pode ser negativo) */
  sobraParaODiaADia: number;
  receitasAReceber: ReceitaPrevista[];
  proximosMeses: { mesLabel: string; saldo: number; saldoProjetado: number; piorCaso: number }[];
  /** faixa "8 em 10" do fechamento do mês; null sem calibração (histórico curto) ou fora da visão do casal */
  faixa: { piorCaso: number; melhorCaso: number; n: number } | null;
  /** por que não há faixa: fase atual com menos de 6 meses (ou cálculo falhou) / visão de uma pessoa */
  faixaMotivo: MotivoSemFaixa | null;
  /** primeiro mês em que o saldo fica ≥ 0 e continua (horizonte de 24 meses) */
  saiDoVermelho: { provavel: string | null; piorCaso: string | null };
}

export type MotivoSemFaixa = 'historico_curto' | 'visao_individual';

/** A faixa é calibrada com os erros do casal: só vale para a visão do casal. Sem faixa, diz o motivo. */
export async function getCalibracaoPara(resp: Resp): Promise<{ calib: Calibracao | null; motivo: MotivoSemFaixa | null }> {
  if (resp !== 'casal') return { calib: null, motivo: 'visao_individual' };
  const calib = await getCalibracao();
  return { calib, motivo: calib ? null : 'historico_curto' };
}

export async function getPrevisaoResumo(resp: Resp): Promise<PrevisaoResumo> {
  const [base, { calib, motivo }] = await Promise.all([getProjecaoBase(resp), getCalibracaoPara(resp)]);
  const proj = computeProjecao(base, 24);
  const atual = proj[0];
  const ritmo = computeRitmo(base, atual);

  const aindaSai = atual.despesaFixa + atual.despesaManual + atual.despesaCasa + atual.despesaVariavel + atual.fatura;

  return {
    mes: atual.mes, mesLabel: atual.mesLabel,
    saldoHoje: base.saldoContasAtual,
    aindaEntra: atual.receita,
    aindaSai,
    fechaCom: atual.saldoProjetado,
    diasRestantes: ritmo.diasRestantes,
    ritmoSeguroDia: ritmo.ritmoSeguroDia,
    ritmoAtualDia: ritmo.ritmoAtualDia,
    sobraParaODiaADia: ritmo.sobraParaODiaADia,
    receitasAReceber: base.mesCorrente.receitasAReceber,
    proximosMeses: proj.slice(1, 7).map((m, i) => ({
      mesLabel: m.mesLabel, saldo: m.saldo, saldoProjetado: m.saldoProjetado,
      piorCaso: faixaMes(m.saldoProjetado, i + 1, calib).piorCaso,
    })),
    faixa: calib ? { ...faixaMesCorrente(atual.saldoProjetado, ritmo.diasRestantes, diasNoMes(atual.mes), calib), n: calib.n } : null,
    faixaMotivo: motivo,
    saiDoVermelho: saiDoVermelho(proj, calib),
  };
}

// promessa por mês: acessos simultâneos (home, tela e bot no 1º acesso) esperam o mesmo cálculo
const cacheCalib = new Map<string, Promise<Calibracao | null>>();

/**
 * Faixa da previsão: erros do saldo (1 mês à frente, casal, regra em uso) nos meses fechados da fase
 * atual (desde INICIO_REGIME), dentro dos 12 últimos. Calculada uma vez por mês de referência; com
 * menos de 6 meses na fase atual sai na hora, sem consultar; erro de consulta não fica em cache.
 */
export function getCalibracao(hoje: string = currentDateSP()): Promise<Calibracao | null> {
  const chave = hoje.slice(0, 7);
  const ja = cacheCalib.get(chave);
  if (ja) return ja;
  const meses = doRegime(Array.from({ length: 12 }, (_, i) => addMonths(chave, -(12 - i))));
  const p = meses.length < 6 ? Promise.resolve(null) : calcularCalibracao(meses, hoje);
  cacheCalib.clear();
  cacheCalib.set(chave, p);
  p.catch(() => cacheCalib.delete(chave));
  return p.catch((e) => { console.error('calibração da faixa falhou', e); return null; });
}

async function calcularCalibracao(meses: string[], hoje: string): Promise<Calibracao | null> {
  const erros = await Promise.all(meses.map(async (mes) => {
    const ant = addMonths(mes, -1);
    const vesp = `${ant}-${String(diasNoMes(ant)).padStart(2, '0')}`;
    const [base, real] = await Promise.all([getProjecaoBase('casal', vesp, { regraDebito: REGRA_DEBITO }), getRealizado(mes)]);
    if (real.receita === 0 && real.debito === 0) return null; // mês sem dado não calibra
    return componentesPrevistos(computeProjecao(base, 1, vesp)[1]).saldo - real.saldo;
  }));
  return calibrarValidada(erros.filter((e): e is number => e !== null), hoje);
}

/** O que de fato aconteceu num mês fechado, pelos mesmos componentes da previsão (teste contra o passado). */
/**
 * Meta do débito (15/10/2026): o débito do mês de `hoje` até hoje, com o recorte da meta e do `debito` de
 * getRealizado — despesa no débito, fora as contas da casa e os espelhos do cartão. Agendado (data futura) fica fora.
 */
export async function getDebitoMesAte(hoje: string = currentDateSP()): Promise<number> {
  const [r] = await q<any>(
    `SELECT COALESCE(SUM(valor), 0)::float8 AS v FROM financas_lancamentos
      WHERE classe = 'despesa' AND forma_pagamento = 'Débito' AND NOT (categoria = ANY($3::text[])) AND ${SEM_ESPELHO}
        AND data_lancamento >= $1::date AND data_lancamento <= $2::date`,
    [`${hoje.slice(0, 7)}-01`, hoje, CASA_CATS],
  );
  return Math.round(Number(r.v) * 100) / 100;
}

/** Tetos do Orçamento e o gasto do mês até hoje em cada um (débito e crédito: é gasto da categoria). */
export async function getOrcamentoMes(hoje: string = currentDateSP()): Promise<{ item: string; emoji: string; teto: number; gasto: number }[]> {
  const rows = await q<any>(
    `SELECT o.item, COALESCE(o.emoji, '') AS emoji, o.teto::float8 AS teto, COALESCE(SUM(l.valor), 0)::float8 AS gasto
       FROM financas_orcamento o
       LEFT JOIN financas_lancamentos l ON l.classe = 'despesa' AND l.categoria = ANY(o.categorias)
            AND l.data_lancamento >= $1::date AND l.data_lancamento <= $2::date
      WHERE o.ativo = true GROUP BY 1, 2, 3 ORDER BY 1`,
    [`${hoje.slice(0, 7)}-01`, hoje],
  );
  return rows.map((x) => ({ item: x.item, emoji: x.emoji, teto: Number(x.teto), gasto: Math.round(Number(x.gasto) * 100) / 100 }));
}

/**
 * O estado da meta do débito hoje (casal): a meta da Previsão recalculada (sair do vermelho em 12 meses), o débito
 * do mês até hoje e onde o mês fecha no ritmo da previsão (o que já foi + o débito que a previsão ainda espera).
 */
export async function getMetaMes(hoje: string = currentDateSP()) {
  const mes = hoje.slice(0, 7);
  const [base, gasto, orcamento] = await Promise.all([getProjecaoBase('casal', hoje), getDebitoMesAte(hoje), getOrcamentoMes(hoje)]);
  const atual = computeProjecao(base, 1, hoje)[0];
  const meta = debitoParaSairAte(base, hoje, addMonths(mes, 12));
  const estado = estadoMeta({
    meta, gasto, previstoFim: gasto + atual.despesaVariavel + atual.despesaFixa,
    diaHoje: Number(hoje.slice(8, 10)), diasNoMes: diasNoMes(mes),
  });
  return { mes, mesLabel: mesLabel(mes), estado, orcamento };
}

export async function getRealizado(mes: string, resp: Resp = 'casal'): Promise<Componentes> {
  const rr = rf(resp, 3);
  const [r] = await q<any>(
    `SELECT
       COALESCE(SUM(valor) FILTER (WHERE classe='receita'),0) AS receita,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND forma_pagamento='Débito' AND NOT (categoria = ANY($2::text[])) AND ${SEM_ESPELHO}),0) AS debito,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND forma_pagamento='Débito' AND categoria = ANY($2::text[])),0) AS casa,
       COALESCE(SUM(valor) FILTER (WHERE classe='pagamento_fatura' AND forma_pagamento='Débito' AND ${SO_ESPELHO_REAL}),0) AS fatura
     FROM financas_lancamentos WHERE date_trunc('month', data_lancamento) = $1::date${rr.sql}`,
    [`${mes}-01`, CASA_CATS, ...rr.p],
  );
  const c = { receita: Number(r.receita), debito: Number(r.debito), casa: Number(r.casa), fatura: Number(r.fatura) };
  return { ...c, saldo: c.receita - c.debito - c.casa - c.fatura };
}

export interface MesPassado { mes: string; previsto: Componentes; real: Componentes; saldoInicio: number; saldoFim: number }

// só o PREVISTO fica em cache (feito na véspera, não muda e é a parte cara); o real e o saldo são
// consultas leves, refeitas a cada acesso para acompanhar lançamento que a sincronização trouxer depois.
// Promessa por pessoa+mês; virou o mês, as chaves do mês anterior saem (as das outras pessoas ficam).
const cachePrevisto = new Map<string, Promise<Componentes>>();

function previstoNaVespera(resp: Resp, mes: string, mesRef: string): Promise<Componentes> {
  const chave = `${resp}|${mesRef}|${mes}`;
  const ja = cachePrevisto.get(chave);
  if (ja) return ja;
  for (const k of Array.from(cachePrevisto.keys())) if (k.split('|')[1] !== mesRef) cachePrevisto.delete(k);
  // N15: a foto tirada no começo do mês manda (sem ela, recalcula com o que se sabe hoje)
  const p = lerFotoPrevisto(resp, mes).then((foto) => foto ?? calcularPrevisto(resp, mes));
  cachePrevisto.set(chave, p);
  p.catch(() => cachePrevisto.delete(chave));
  return p;
}

function calcularPrevisto(resp: Resp, mes: string): Promise<Componentes> {
  const ant = addMonths(mes, -1);
  const vesp = `${ant}-${String(diasNoMes(ant)).padStart(2, '0')}`;
  // mesma régua da calibração: véspera do mês e a regra do débito em uso
  return getProjecaoBase(resp, vesp, { regraDebito: REGRA_DEBITO })
    .then((base) => componentesPrevistos(computeProjecao(base, 1, vesp)[1]));
}

async function lerFotoPrevisto(resp: Resp, mes: string): Promise<Componentes | null> {
  const [r] = await q<any>(`SELECT componentes FROM financas_previsto_foto WHERE resp = $1 AND mes = $2`, [resp, mes]);
  return r ? (r.componentes as Componentes) : null;
}

/**
 * N15: grava a previsão do mês (feita na véspera) uma vez; chamada no dia 1 pelo resumo mensal e na primeira
 * abertura da previsão no mês. Já existindo, devolve a foto sem recalcular nem sobrescrever.
 */
export async function fotografarPrevisto(resp: Resp, mes: string): Promise<Componentes> {
  const ja = await lerFotoPrevisto(resp, mes);
  if (ja) return ja;
  const c = await calcularPrevisto(resp, mes);
  await qw(`INSERT INTO financas_previsto_foto (resp, mes, componentes) VALUES ($1, $2, $3) ON CONFLICT (resp, mes) DO NOTHING`,
    [resp, mes, JSON.stringify(c)]);
  return (await lerFotoPrevisto(resp, mes)) ?? c;
}

/** Os `n` meses fechados antes do atual: previsto na véspera × real × saldo em conta no fim (reconstruído). */
export async function getMesesPassados(resp: Resp, hoje: string = currentDateSP(), n = 3): Promise<MesPassado[]> {
  const atual = hoje.slice(0, 7);
  const meses = Array.from({ length: n }, (_, i) => addMonths(atual, -(n - i)));
  const [saldo, movs] = await Promise.all([getSaldoContas(resp), getMovimentosDiarios(resp, `${meses[0]}-01`, hoje)]);
  return Promise.all(meses.map(async (mes) => {
    const [previsto, real] = await Promise.all([previstoNaVespera(resp, mes, atual), getRealizado(mes, resp)]);
    // saldo em conta numa data = saldo de hoje desfazendo os movimentos depois dela
    const fimDoMes = `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`;
    const desfaz = (desde: (d: string) => boolean) =>
      Math.round((saldo.total - Object.entries(movs).filter(([d]) => desde(d)).reduce((s, [, v]) => s + v, 0)) * 100) / 100;
    return { mes, previsto, real, saldoInicio: desfaz((d) => d >= `${mes}-01`), saldoFim: desfaz((d) => d > fimDoMes) };
  }));
}

/** Débito dos `n` meses fechados antes do mês de `hoje`: livre × travado, fora casa e espelhos; mês vazio = 0. */
export async function getDebitoMensal(resp: Resp, hoje: string, n = 6): Promise<MesDebito[]> {
  const r = rf(resp, 5);
  // filtros no ON do LEFT JOIN (descricao/responsavel só existem em financas_lancamentos): mês vazio fica com 0
  const rows = await q<any>(
    `WITH ms AS (
       SELECT to_char(generate_series(date_trunc('month', $1::date) - ($2::int || ' months')::interval,
                                      date_trunc('month', $1::date) - interval '1 month', interval '1 month'), 'YYYY-MM') AS mes)
     SELECT ms.mes,
            COALESCE(SUM(l.valor) FILTER (WHERE NOT (l.categoria = ANY($4::text[]))), 0)::float8 AS livre,
            COALESCE(SUM(l.valor) FILTER (WHERE l.categoria = ANY($4::text[])), 0)::float8 AS fixo
     FROM ms LEFT JOIN financas_lancamentos l
       ON to_char(l.data_lancamento, 'YYYY-MM') = ms.mes
      AND l.classe = 'despesa' AND l.forma_pagamento = 'Débito'
      AND NOT (l.categoria = ANY($3::text[]))
      AND ${SEM_ESPELHO}${r.sql}
     GROUP BY ms.mes ORDER BY ms.mes`,
    [hoje, n, CASA_CATS, FIXO_DEBITO_CATS, ...r.p],
  );
  return rows.map((x) => ({ mes: x.mes, livre: Math.round(Number(x.livre) * 100) / 100, fixo: Math.round(Number(x.fixo) * 100) / 100 }));
}

export async function getProjecaoBase(resp: Resp, hoje: string = currentDateSP(), opcoes: { regraDebito?: RegraDebito } = {}): Promise<ProjecaoBase> {
  const [patrimonioAtual, saldoContas, meses] = await Promise.all([
    getPatrimonioAtual(resp), getSaldoContas(resp), getMesesConfiaveis(resp, hoje),
  ]);
  const saldoContasAtual = saldoContas.total;

  const basesReceita = mesesBaseReceita(hoje);
  // receita por FONTE (quem paga): documento da contraparte, ou a descrição sem dígitos
  // quando o banco não manda documento. Meses-base + o mês de hoje (para o "já recebido").
  const r1 = rf(resp, 3);
  const entradaRows = await q<any>(
    `SELECT COALESCE(contraparte_doc,
              trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g'))) AS fonte,
            trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS nome,
            to_char(data_lancamento,'YYYY-MM') AS mes, EXTRACT(day FROM data_lancamento)::int AS dia,
            valor::float8 AS valor, responsavel
     FROM financas_lancamentos
     WHERE classe='receita'
       AND data_lancamento >= ($1 || '-01')::date
       AND data_lancamento <= $2::date${r1.sql}`,
    [basesReceita[basesReceita.length - 1], hoje, ...r1.p],
  );
  const entradas: EntradaReceita[] = entradaRows.map((x) => ({
    fonte: x.fonte, nome: x.nome, mes: x.mes, dia: Number(x.dia), valor: Number(x.valor), responsavel: x.responsavel,
  }));
  const fontesReceita = receitaRecorrente(entradas, basesReceita);
  const recebidoPorFonte: Record<string, number> = {};
  for (const e of entradas) {
    if (e.mes !== hoje.slice(0, 7)) continue;
    const k = chaveParte(e.fonte, e.dia);
    recebidoPorFonte[k] = (recebidoPorFonte[k] ?? 0) + e.valor;
  }

  // BASE CAIXA: só o que sai da CONTA (débito). Compra no crédito não sai aqui —
  // ela vira fatura e é descontada quando a fatura é paga.
  // dividido em gasto livre (o dia a dia) e contas travadas (consórcio, seguro, imposto…), que
  // no mês em andamento entram como compromisso e não como ritmo. A média vem da regra escolhida
  // pelo teste contra o passado (F2a): o gasto vem caindo e a média dos meses confiáveis não acompanha.
  const debito = estimarDebito(await getDebitoMensal(resp, hoje), opcoes.regraDebito ?? REGRA_DEBITO, meses.map((d) => d.slice(0, 7)));
  // perfil do mês: que fração do gasto livre saiu DEPOIS do dia de hoje, nos 6 meses anteriores
  const rpf = rf(resp, 5);
  const perfilRows = await q<any>(
    `SELECT COALESCE(SUM(valor) FILTER (WHERE EXTRACT(day FROM data_lancamento) > $4),0)::float8 AS depois,
            COALESCE(SUM(valor),0)::float8 AS total
     FROM financas_lancamentos
     WHERE classe='despesa' AND forma_pagamento='Débito'
       AND NOT (categoria = ANY($1::text[])) AND NOT (categoria = ANY($2::text[]))
       AND ${SEM_ESPELHO}
       AND data_lancamento >= date_trunc('month', $3::date) - interval '6 months'
       AND data_lancamento < date_trunc('month', $3::date)${rpf.sql}`,
    [CASA_CATS, FIXO_DEBITO_CATS, hoje, Number(hoje.slice(8, 10)), ...rpf.p],
  );
  const fracaoRestanteDebito = perfilRows[0]?.total > 0 ? perfilRows[0].depois / perfilRows[0].total : null;

  // compras novas no crédito (fora parcelamentos) — é o que vira fatura do mês seguinte
  const rcn = rf(resp, 2);
  const hcn = `$${rcn.p.length + 2}::date`;
  const creditoRows = await q<any>(
    `WITH chaves_parceladas AS (
       SELECT DISTINCT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave
       FROM financas_lancamentos
       WHERE classe='despesa' AND data_lancamento > ${hcn} AND criado_em::date <= ${hcn}
     )
     SELECT ROUND(AVG(m.total),2) AS media FROM (
       SELECT date_trunc('month',l.data_lancamento) AS mes, SUM(l.valor) AS total
       FROM financas_lancamentos l
       WHERE l.classe='despesa' AND l.forma_pagamento='Crédito'
         AND trim(regexp_replace(regexp_replace(lower(coalesce(l.descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) NOT IN (SELECT chave FROM chaves_parceladas)
         AND NOT (COALESCE(l.parcela_total,0) > 1 OR l.descricao ~ '\\s\\d{1,2}\\s*/\\s*\\d{1,2}$')
         AND date_trunc('month',l.data_lancamento) = ANY($1::date[])${rcn.sql}
       GROUP BY 1
     ) m`,
    [meses, ...rcn.p, hoje],
  );

  // gastos da casa entram pela média real por categoria (aluguel, luz, água...).
  // Ficam fora da média "variável" acima justamente pra não contar duas vezes.
  const rc = rf(resp, 3);
  const casaRows = await q<any>(
    `SELECT categoria, ROUND(AVG(total),2) AS media FROM (
       SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria,
              date_trunc('month',data_lancamento) AS mes, SUM(valor) AS total
       FROM financas_lancamentos
       WHERE classe='despesa' AND forma_pagamento='Débito' AND categoria = ANY($1::text[])
         AND date_trunc('month',data_lancamento) = ANY($2::date[])${rc.sql}
       GROUP BY 1,2
     ) m GROUP BY categoria`,
    [CASA_CATS, meses, ...rc.p],
  );
  const despesaCasaPorCategoria: Record<string, number> = {};
  casaRows.forEach((x) => { despesaCasaPorCategoria[x.categoria] = Number(x.media); });

  // Compras no crédito pelo MÊS DE VENCIMENTO da fatura em que caem, nesta ordem:
  // 1) fatura_id -> vencimento real; 2) fatura_prevista + deslocamento da conta, aprendido dos
  // lançamentos que têm os dois (no Nubank fatura_prevista é o mês do vencimento; no Neon e no
  // Santander, o mês anterior); 3) mês seguinte ao lançamento. Só o conhecido em hoje.
  const r3 = rf(resp, 2);
  const credVencRows = await q<any>(
    `WITH desloc AS (
       SELECT l.account_id,
              mode() WITHIN GROUP (ORDER BY (EXTRACT(year FROM h.vencimento) * 12 + EXTRACT(month FROM h.vencimento))
                - (left(l.fatura_prevista, 4)::int * 12 + right(l.fatura_prevista, 2)::int)) AS meses
       FROM financas_lancamentos l JOIN financas_faturas_historico h ON h.id = l.fatura_id
       WHERE l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
       GROUP BY 1
     )
     SELECT to_char(COALESCE(
              h.vencimento,
              CASE WHEN l.fatura_prevista ~ '^\\d{4}-\\d{2}$'
                   THEN (to_date(l.fatura_prevista, 'YYYY-MM') + make_interval(months => COALESCE(d.meses, 0)::int))::date END,
              (date_trunc('month', l.data_lancamento) + interval '1 month')::date), 'YYYY-MM') AS venc,
            SUM(l.valor)::float8 AS total
     FROM financas_lancamentos l
     LEFT JOIN financas_faturas_historico h ON h.id = l.fatura_id
     LEFT JOIN desloc d ON d.account_id = l.account_id
     -- parcela de parcelamento de fatura (pagamento_fatura que SAI no cartão) também vence na fatura
     WHERE (l.classe = 'despesa' OR (l.classe = 'pagamento_fatura' AND l.tipo_movimento = 'Saída'))
       AND l.forma_pagamento = 'Crédito'
       AND (l.data_lancamento <= $1::date OR l.criado_em::date <= $1::date)${r3.sql}
     GROUP BY 1`,
    [hoje, ...r3.p],
  );
  const creditoPorVencimento: Record<string, number> = {};
  credVencRows.forEach((x) => { creditoPorVencimento[x.venc] = Number(x.total); });

  // fatura real (histórico da Pluggy) das que vencem até o mês de hoje
  const filtroResp = resp === 'casal' ? '' : ' AND c.responsavel = $2';
  const faturaRows = await q<any>(
    `SELECT to_char(h.vencimento, 'YYYY-MM') AS venc, SUM(h.total)::float8 AS total
     FROM financas_faturas_historico h LEFT JOIN pluggy_contas c ON c.account_id = h.account_id
     WHERE date_trunc('month', h.vencimento) <= date_trunc('month', $1::date)${filtroResp}
     GROUP BY 1`,
    resp === 'casal' ? [hoje] : [hoje, resp],
  );
  const faturaReal: Record<string, number> = {};
  faturaRows.forEach((x) => { faturaReal[x.venc] = Number(x.total); });

  // N3: fatura do mês em andamento, por cartão. Vencida = já não sai (o que faltou virou parcelamento
  // ou rotativo e aparece nas próximas faturas); a vencer = total − o que o próprio cartão registrou
  // como pagamento desde ~10 dias antes do vencimento (o Nubank grava o mesmo pagamento 2×: data+valor conta 1×).
  const restRows = await q<any>(
    `SELECT h.account_id, to_char(h.vencimento, 'YYYY-MM-DD') AS venc, h.total::float8 AS total,
            (SELECT COALESCE(SUM(p.valor), 0)::float8 FROM (
               SELECT DISTINCT l.data_lancamento, l.valor FROM financas_lancamentos l
                WHERE l.account_id = h.account_id AND l.forma_pagamento = 'Crédito'
                  AND l.classe = 'pagamento_fatura' AND l.tipo_movimento = 'Entrada'
                  AND l.data_lancamento >= h.vencimento - 10 AND l.data_lancamento <= $1::date) p) AS pago
       FROM financas_faturas_historico h LEFT JOIN pluggy_contas c ON c.account_id = h.account_id
      WHERE date_trunc('month', h.vencimento) = date_trunc('month', $1::date)${filtroResp}`,
    resp === 'casal' ? [hoje] : [hoje, resp],
  );
  const faturaRestante = restRows.length
    ? Math.round(restRows.reduce((s, x) => s + (x.venc < hoje ? 0 : Math.max(0, Number(x.total) - Number(x.pago))), 0) * 100) / 100
    : undefined;

  // N1: cartão sem histórico de fatura (Bradesco, pago por "GASTOS CARTAO" no débito). Se os 3 meses
  // fechados tiveram o MESMO pagamento (fatura parcelada), ele se repete; valor variando = imprevisível (0).
  const rcs = rf(resp, 2);
  const semFatRows = await q<any>(
    `SELECT to_char(data_lancamento, 'YYYY-MM') AS mes, SUM(valor)::float8 AS total
       FROM financas_lancamentos
      WHERE classe = 'pagamento_fatura' AND forma_pagamento = 'Débito' AND ${CARTAO_SEM_FATURA}
        AND data_lancamento >= date_trunc('month', $1::date) - interval '3 months' AND data_lancamento <= $1::date${rcs.sql}
      GROUP BY 1`,
    [hoje, ...rcs.p],
  );
  const semFat: Record<string, number> = Object.fromEntries(semFatRows.map((x) => [x.mes, Math.round(Number(x.total) * 100) / 100]));
  const tres = [-3, -2, -1].map((k) => semFat[addMonths(hoje.slice(0, 7), k)]);
  const cartaoSemFatura = {
    mensal: tres.every((v) => v !== undefined && Math.abs(v - tres[0]!) <= 0.01) ? tres[0]! : 0,
    pagoNoMes: semFat[hoje.slice(0, 7)] ?? 0,
  };

  const compromissosCadastrados = await getCompromissosManuais(resp);
  const compromissosManuais = resp === 'casal'
    ? compromissosCadastrados
    : aplicarParteDoCasal(compromissosCadastrados, resp, await getPartesDoCasal(resp, compromissosCadastrados, hoje));
  const receitasAReceber = receitaAindaAEntrar(fontesReceita, recebidoPorFonte);

  // --- mês em andamento: o que já entrou/saiu e o que ainda falta ---
  const rmc = rf(resp, 1);
  const mesRows = await q<any>(
    `WITH sp AS (SELECT $${rmc.p.length + 2}::date AS hoje),
     lim AS (SELECT date_trunc('month',(SELECT hoje FROM sp))::date AS ini,
                    (date_trunc('month',(SELECT hoje FROM sp)) + interval '1 month')::date AS fim),
     chaves AS (
       SELECT DISTINCT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS ch
       FROM financas_lancamentos, sp
       WHERE classe='despesa' AND data_lancamento > sp.hoje AND criado_em::date <= sp.hoje
     )
     SELECT
       (SELECT COALESCE(SUM(valor),0) FROM financas_lancamentos, lim, sp
         WHERE classe='receita' AND data_lancamento > sp.hoje AND data_lancamento < lim.fim AND criado_em::date <= sp.hoje${rmc.sql}) AS receita_agendada,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND NOT (l.categoria = ANY($${rmc.p.length + 1}::text[]))
           AND NOT (l.categoria = ANY($${rmc.p.length + 3}::text[]))
           AND ${SEM_ESPELHO}${rmc.sql}) AS variavel_gasto,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND l.categoria = ANY($${rmc.p.length + 3}::text[])
           AND ${SEM_ESPELHO}${rmc.sql}) AS fixo_gasto,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento > sp.hoje AND l.data_lancamento < lim.fim AND l.criado_em::date <= sp.hoje
           AND NOT (l.categoria = ANY($${rmc.p.length + 1}::text[]))
           AND ${SEM_ESPELHO}${rmc.sql}) AS agendado_restante,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='pagamento_fatura' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND ${SEM_ESPELHO}${rmc.sql}) AS fatura_ja_paga`,
    [...rmc.p, CASA_CATS, hoje, FIXO_DEBITO_CATS],
  );

  // N12: contas travadas por categoria — média nos meses-base (mês sem a conta conta como 0, igual ao total)
  // e o que já saiu no mês de hoje
  const rfx = rf(resp, 4);
  const fixoRows = await q<any>(
    `SELECT categoria, to_char(data_lancamento, 'YYYY-MM') AS mes, SUM(valor)::float8 AS total
       FROM financas_lancamentos
      WHERE classe = 'despesa' AND forma_pagamento = 'Débito' AND categoria = ANY($1::text[])
        AND NOT (categoria = ANY($2::text[])) AND ${SEM_ESPELHO}
        AND (to_char(data_lancamento, 'YYYY-MM') = ANY($3::text[])
             OR (date_trunc('month', data_lancamento) = date_trunc('month', $${rfx.p.length + 4}::date) AND data_lancamento <= $${rfx.p.length + 4}::date))${rfx.sql}
      GROUP BY 1, 2`,
    [FIXO_DEBITO_CATS, CASA_CATS, [...meses.map((d) => d.slice(0, 7)), addMonths(hoje.slice(0, 7), -1)], ...rfx.p, hoje],
  );
  // ativa = apareceu no mês passado (empréstimo que acabou não é mais esperado)
  const fixoPorCategoria: Record<string, { media: number; pago: number; ativa: boolean }> = {};
  const mesesBase = new Set(meses.map((d) => d.slice(0, 7)));
  const nMeses = Math.max(1, meses.length);
  for (const x of fixoRows) {
    const c = (fixoPorCategoria[x.categoria] ??= { media: 0, pago: 0, ativa: false });
    if (x.mes === hoje.slice(0, 7)) c.pago = Math.round((c.pago + Number(x.total)) * 100) / 100;
    if (mesesBase.has(x.mes)) c.media = Math.round((c.media + Number(x.total) / nMeses) * 100) / 100;
    if (x.mes === addMonths(hoje.slice(0, 7), -1)) c.ativa = true;
  }

  // F1: receita já agendada no mês (data futura, conhecida em hoje), por dia — a linha do mês da home a põe no dia
  const rra = rf(resp, 2);
  const agendRows = await q<any>(
    `SELECT EXTRACT(day FROM data_lancamento)::int AS dia, SUM(valor)::float8 AS valor
       FROM financas_lancamentos
      WHERE classe = 'receita' AND data_lancamento > $1::date
        AND data_lancamento < date_trunc('month', $1::date) + interval '1 month'
        AND criado_em::date <= $1::date${rra.sql}
      GROUP BY 1 ORDER BY 1`,
    [hoje, ...rra.p],
  );
  const receitasAgendadas = agendRows.map((x) => ({ dia: Number(x.dia), valor: Math.round(Number(x.valor) * 100) / 100 }));

  const casaNoMesPorCategoria = await getCasaNoMes(resp, hoje);
  // visão individual: o que o casal já pagou da casa, para abater os compromissos do casal
  const casaNoMesCasalPorCategoria = resp === 'casal' ? undefined : await getCasaNoMes('casal', hoje);

  return {
    patrimonioAtual,
    saldoContasAtual,
    saldoContas,
    mesCorrente: {
      recebidoPorFonte,
      receitaAgendada: Number(mesRows[0]?.receita_agendada ?? 0),
      receitasAgendadas,
      receitasAReceber,
      variavelJaGasto: Number(mesRows[0]?.variavel_gasto ?? 0),
      fixoJaGasto: Number(mesRows[0]?.fixo_gasto ?? 0),
      agendadoRestante: Number(mesRows[0]?.agendado_restante ?? 0),
      faturaJaPaga: Number(mesRows[0]?.fatura_ja_paga ?? 0),
      ...(faturaRestante !== undefined ? { faturaRestante } : {}),
      fixoPorCategoria,
      casaNoMesPorCategoria,
      ...(casaNoMesCasalPorCategoria ? { casaNoMesCasalPorCategoria } : {}),
    },
    fontesReceita,
    despesaVariavelMediaMensal: debito.livre,
    despesaFixaDebitoMedia: debito.fixo,
    fracaoRestanteDebito,
    creditoNovoMedio: Number(creditoRows[0]?.media ?? 0),
    despesaCasaPorCategoria,
    creditoPorVencimento,
    faturaReal,
    cartaoSemFatura,
    compromissosManuais,
    compromissosCadastrados,
  };
}

/** Casa do mês de `hoje` por categoria: o que já saiu e o que já está agendado (conhecido em hoje). */
async function getCasaNoMes(resp: Resp, hoje: string): Promise<Record<string, number>> {
  const rcm = rf(resp, 2);
  const hcm = `$${rcm.p.length + 2}::date`;
  const rows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, ROUND(SUM(valor),2) AS total
     FROM financas_lancamentos
     -- N10: casa paga no crédito sai do caixa pela fatura; aqui só o que saiu da conta
     WHERE classe='despesa' AND forma_pagamento='Débito' AND categoria = ANY($1::text[])
       AND data_lancamento >= date_trunc('month',${hcm})
       AND data_lancamento <  date_trunc('month',${hcm}) + interval '1 month'
       AND (data_lancamento <= ${hcm} OR criado_em::date <= ${hcm})${rcm.sql}
     GROUP BY 1`,
    [CASA_CATS, ...rcm.p, hoje],
  );
  const porCategoria: Record<string, number> = {};
  rows.forEach((x) => { porCategoria[x.categoria] = Number(x.total); });
  return porCategoria;
}

/**
 * Que fração de cada conta da casa (CASA_CATS) dos compromissos do casal a pessoa pagou nos 6 meses
 * fechados antes de `hoje` (qualquer forma de pagamento), com o mesmo filtro da média da casa.
 * Fora da casa (empréstimo, seguro…) o gasto pessoal da categoria não diz nada sobre o compromisso:
 * fica de fora, e categoria fora do resultado vira meio a meio.
 */
async function getPartesDoCasal(resp: Resp, compromissos: CompromissoManual[], hoje: string): Promise<Record<string, number>> {
  const cats = Array.from(new Set(compromissos.filter((c) => c.responsavel === 'casal').map((c) => c.categoria)))
    .filter((c) => CASA_CATS.includes(c));
  if (cats.length === 0) return {};
  const rows = await q<any>(
    `SELECT cat, SUM(valor) FILTER (WHERE responsavel = $3)::float8 AS pessoa,
            SUM(valor) FILTER (WHERE responsavel IN ('Matheus','Ariane'))::float8 AS total
     FROM (SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS cat, valor, responsavel
           FROM financas_lancamentos
           WHERE classe = 'despesa' AND categoria = ANY($1::text[])
             AND data_lancamento >= date_trunc('month', $2::date) - interval '6 months'
             AND data_lancamento <  date_trunc('month', $2::date)) x
     WHERE cat = ANY($1::text[])
     GROUP BY cat`,
    [cats, hoje, resp],
  );
  const partes: Record<string, number> = {};
  for (const x of rows) if (Number(x.total) > 0) partes[x.cat] = Number(x.pessoa ?? 0) / Number(x.total);
  return partes;
}

// ==================== DIAGNÓSTICO ====================
// Cruza o passado (o que já aconteceu) com a projeção pra responder
// "onde eu estou errando" — em vez de só mostrar números.

export { GRUPOS_GASTO, type GrupoGasto } from './grupos';

export interface VariacaoCat {
  categoria: string; anterior: number; atual: number; delta: number; pct: number | null;
}
export interface Diagnostico {
  mesRef: string; mesRefLabel: string;   // último mês COMPLETO
  renda: number; gasto: number; pctGastoDaRenda: number;
  grupos: GrupoGasto[];
  travado: number; livre: number;
  /** comparação justa: mesmo dia do mês, mês passado vs este */
  diaComparacao: number;
  variacoes: VariacaoCat[];
  /** PIX/transferências que caíram como despesa sem categoria clara */
  semClassificacao: { total: number; itens: { descricao: string; valor: number; data: string }[] };
  /** sobra mensal projetada num mês cheio — base pro simulador de corte */
  sobraMensalProjetada: number;
  /** N17: de que mês é a sobra projetada (o diagnóstico é do mês passado; a sobra, do próximo mês cheio) */
  sobraMensalLabel: string;
  saldoProjetadoFim: number;
}

export async function getDiagnostico(resp: Resp): Promise<Diagnostico> {
  // mês de referência = último mês COMPLETO (o atual ainda está correndo)
  const anchor = currentMonthSP();
  const mesRef = addMonths(anchor, -1);

  const r1 = rf(resp, 2);
  const catRows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria, ROUND(SUM(valor),2) AS total
     FROM financas_lancamentos
     WHERE classe='despesa' AND ${SEM_ESPELHO}
       AND date_trunc('month',data_lancamento) = $1::date${r1.sql}
     GROUP BY 1`,
    [`${mesRef}-01`, ...r1.p],
  );

  const r2 = rf(resp, 2);
  const rendaRows = await q<any>(
    `SELECT COALESCE(SUM(valor),0) AS total FROM financas_lancamentos
     WHERE classe='receita' AND date_trunc('month',data_lancamento) = $1::date${r2.sql}`,
    [`${mesRef}-01`, ...r2.p],
  );
  const renda = Number(rendaRows[0]?.total ?? 0);

  const porCat = new Map<string, number>();
  catRows.forEach((x) => porCat.set(x.categoria, Number(x.total)));
  const gasto = [...porCat.values()].reduce((s, v) => s + v, 0);

  const grupos = agruparGastos(porCat, renda);

  const travado = grupos.filter((g) => g.travado).reduce((s, g) => s + g.total, 0);

  // --- o que mudou: mês passado vs este, até o MESMO dia (senão é injusto) ---
  const [, , diaStr] = currentDateSP().split('-');
  const diaComparacao = Number(diaStr);
  const r3 = rf(resp, 4);
  const varRows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria,
       ROUND(COALESCE(SUM(valor) FILTER (WHERE date_trunc('month',data_lancamento) = $1::date),0),2) AS anterior,
       ROUND(COALESCE(SUM(valor) FILTER (WHERE date_trunc('month',data_lancamento) = $2::date),0),2) AS atual
     FROM financas_lancamentos
     WHERE classe='despesa' AND ${SEM_ESPELHO}
       AND EXTRACT(day FROM data_lancamento) <= $3
       AND date_trunc('month',data_lancamento) IN ($1::date, $2::date)${r3.sql}
     GROUP BY 1`,
    [`${mesRef}-01`, `${anchor}-01`, diaComparacao, ...r3.p],
  );
  const variacoes: VariacaoCat[] = varRows
    .map((x) => {
      const anterior = Number(x.anterior), atual = Number(x.atual);
      return {
        categoria: x.categoria, anterior, atual, delta: atual - anterior,
        // % sobre base pequena distorce — melhor não mostrar
        pct: anterior >= 50 ? ((atual - anterior) / anterior) * 100 : null,
      };
    })
    .filter((v) => Math.abs(v.delta) >= 50)
    .sort((a, b) => b.delta - a.delta);

  // --- despesa sem categoria clara (PIX/transferência solta) ---
  const r4 = rf(resp, 2);
  const semCatRows = await q<any>(
    `SELECT COALESCE(descricao,'(sem descrição)') AS descricao, ROUND(SUM(valor),2) AS valor,
            to_char(MAX(data_lancamento),'YYYY-MM-DD') AS data
     FROM financas_lancamentos
     WHERE classe='despesa' AND ${SEM_ESPELHO}
       AND categoria_vaga(categoria_efetiva(descricao, categoria, contraparte_doc))
       AND date_trunc('month',data_lancamento) = $1::date${r4.sql}
     GROUP BY 1 ORDER BY valor DESC LIMIT 8`,
    [`${mesRef}-01`, ...r4.p],
  );
  const itens = semCatRows.map((x) => ({ descricao: x.descricao, valor: Number(x.valor), data: x.data }));

  // --- ligação com a projeção: quanto sobra num mês cheio ---
  const base = await getProjecaoBase(resp);
  const proj = computeProjecao(base, 3);
  const mesCheio = proj[1] ?? proj[0];

  return {
    mesRef, mesRefLabel: mesLabel(mesRef),
    renda, gasto, pctGastoDaRenda: renda > 0 ? (gasto / renda) * 100 : 0,
    grupos, travado, livre: Math.max(0, renda - travado),
    diaComparacao, variacoes,
    semClassificacao: { total: itens.reduce((s, i) => s + i.valor, 0), itens },
    sobraMensalProjetada: mesCheio?.saldo ?? 0,
    sobraMensalLabel: mesCheio?.mesLabel ?? '',
    saldoProjetadoFim: proj[0]?.saldoProjetado ?? 0,
  };
}

// ==================== TRILHA (F3) ====================

/** Tudo que a trilha precisa, sempre na visão do casal. `baseCasal`: a home na visão do casal já tem a base; reaproveita. */
export async function getTrilhaDados(hoje: string = currentDateSP(), baseCasal?: ProjecaoBase): Promise<DadosTrilha> {
  const mesAtual = hoje.slice(0, 7);
  const desde = `${addMonths(mesAtual, -(MESES_ATRASO - 1))}-01`; // janela de atraso: o mês anterior e o atual
  const iniPassados = `${addMonths(mesAtual, -MESES_SOBRA)}-01`;
  const [base, passados, saldo, movs, divRows, aplRows, marcas, metas] = await Promise.all([
    baseCasal ?? getProjecaoBase('casal', hoje),
    getMesesPassados('casal', hoje),
    getSaldoContas('casal'),
    getMovimentosDiarios('casal', desde, hoje),
    // lançamentos da janela e parcelas futuras já conhecidas em hoje: dívidas e juros saem daqui
    q<any>(
      `SELECT descricao, categoria, COALESCE(banco,'—') AS banco, forma_pagamento AS forma,
              to_char(data_lancamento,'YYYY-MM-DD') AS data, valor::float8 AS valor, parcela_total AS "parcelaTotal", parcela_numero AS "parcelaNumero"
       FROM financas_lancamentos
       WHERE ${SEM_ESPELHO}
         -- parcelamento de fatura e encargos do cartão o classificador grava como pagamento_fatura:
         -- entram só os do cartão (saída no crédito), nunca o pagamento da fatura pela conta
         AND (classe = 'despesa' OR (classe = 'pagamento_fatura' AND forma_pagamento = 'Crédito' AND tipo_movimento = 'Saída'))
         AND data_lancamento >= $1::date
         AND (data_lancamento <= $2::date OR criado_em::date <= $2::date)`,
      [desde, hoje],
    ),
    // aplicação líquida por mês: aplicar soma, resgatar subtrai; rendimento (receita) fica fora
    q<any>(
      `SELECT to_char(data_lancamento,'YYYY-MM') AS mes,
              SUM(CASE WHEN tipo_movimento = 'Entrada' THEN -valor ELSE valor END)::float8 AS liq
       FROM financas_lancamentos
       WHERE forma_pagamento = 'Débito' AND classe <> 'receita'
         AND (classe = 'aporte' OR categoria = 'Investments')
         AND data_lancamento >= $1::date AND data_lancamento < date_trunc('month', $2::date)
       GROUP BY 1`,
      [iniPassados, hoje],
    ),
    getMarcasDivida(),
    getMetasTrilha(),
  ]);
  const proj = computeProjecao(base, 24, hoje);
  const debitoAtual = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
  const alvo = addMonths(mesAtual, 12);
  const lancs = divRows.map((x) => ({ descricao: x.descricao ?? '', categoria: x.categoria, banco: x.banco, forma: x.forma, data: x.data, valor: Number(x.valor) }));
  const juros = lancs.filter((l) => l.data <= hoje && ehAtraso(l.descricao, l.categoria)).map((l) => l.data.slice(0, 7));
  const porMes = new Map(aplRows.map((x) => [x.mes as string, Math.round(Number(x.liq) * 100) / 100]));
  return {
    hoje,
    dividas: agruparDividas(lancs, hoje, marcas),
    atrasos: [
      ...Array.from(new Set(juros)).sort().map((mes) => ({ mes, motivo: 'juros' as const })),
      ...mesesComContaNegativa(saldo.total, movs, desde, hoje).map((mes) => ({ mes, motivo: 'conta_negativa' as const })),
    ],
    passados: passados.map((p) => ({ mes: p.mes, sobra: p.real.saldo, receita: p.real.receita })),
    sobraPrevista: proj.slice(1).map((m) => ({ mes: m.mes, sobra: m.saldo })),
    textoMeta: textoMetaAlvo(debitoParaSairAte(base, hoje, alvo), debitoAtual, mesLabel(alvo), marcaDinheiro),
    gastoTravado: { fixos: proj[1]?.despesaManual ?? 0, casa: proj[1]?.despesaCasa ?? 0, debitoTravado: base.despesaFixaDebitoMedia ?? 0 },
    aplicado: base.patrimonioAtual,
    metas,
    aplicacaoMensal: Array.from({ length: MESES_SOBRA }, (_, i) => addMonths(mesAtual, -(MESES_SOBRA - i))).map((mes) => ({ mes, valor: porMes.get(mes) ?? 0 })),
  };
}

// ==================== CATEGORIAS PELO PAINEL (F4) ====================
type Cli = { query: (t: string, p?: any[]) => Promise<{ rows: any[] }> };

async function regrasDoPainel(c: Cli): Promise<RegraPainel[]> {
  const { rows } = await c.query(`SELECT id, tipo, chave, categoria FROM financas_categoria_painel`);
  return rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, chave: x.chave, categoria: x.categoria }));
}

/** Lançamentos que uma regra alcança: a mesma seleção na prévia, na gravação e ao apagar.
 *  Texto: filtrado aqui com normalizarTexto — a mesma normalização da precedência (no SQL, translate/upper
 *  não cobrem todo acento nem todo espaço, e prévia/apagar divergiriam do que o worker aplica). */
async function alcance(c: Cli, tipo: TipoRegra, chave: string) {
  const colunas = `id_transacao, descricao, categoria, classe, COALESCE(categoria_banco, categoria) AS categoria_banco,
            contraparte_doc, tipo_movimento, forma_pagamento, responsavel`;
  if (tipo === 'texto') {
    const { rows } = await c.query(`SELECT ${colunas} FROM financas_lancamentos`);
    return rows.filter((r) => normalizarTexto(r.descricao ?? '').includes(chave));
  }
  const { rows } = await c.query(
    `SELECT ${colunas} FROM financas_lancamentos WHERE ${tipo === 'lancamento' ? 'id_transacao' : 'contraparte_doc'} = $1`,
    [chave],
  );
  return rows;
}
const paraRegra = (r: any) => ({
  id: r.id_transacao, descricao: r.descricao ?? '', contraparteDoc: r.contraparte_doc, categoriaBanco: r.categoria_banco,
  saida: r.tipo_movimento === 'Saída', forma: r.forma_pagamento, responsavel: r.responsavel,
});

/** Do pedido da tela à regra: a chave da regra por pessoa vem do lançamento, nunca do cliente. */
async function resolver(c: Cli, p: PedidoRegra): Promise<{ tipo: TipoRegra; chave: string; nome: string } | { erro: string }> {
  const { rows } = await c.query(`SELECT descricao, contraparte_doc, contraparte_nome FROM financas_lancamentos WHERE id_transacao = $1`, [p.idTransacao]);
  if (!rows[0]) return { erro: 'Lançamento não encontrado.' };
  if (p.tipo === 'lancamento') return { tipo: 'lancamento', chave: p.idTransacao, nome: rows[0].descricao ?? '' };
  if (p.tipo === 'doc') {
    if (!rows[0].contraparte_doc) return { erro: 'Este lançamento não tem CPF/CNPJ da contraparte.' };
    return { tipo: 'doc', chave: rows[0].contraparte_doc, nome: nomeSemDocumento(rows[0].contraparte_nome) ?? nomeSemDocumento(rows[0].descricao) ?? '' };
  }
  // normaliza aqui também: a chave tem que casar com normalizarTexto da descrição, venha o pedido de onde vier
  const chave = normalizarTexto(p.texto ?? '');
  if (chave.replace(/\s/g, '').length < 3) return { erro: 'O texto precisa de pelo menos 3 letras.' };
  return { tipo: 'texto', chave, nome: chave };
}

/** O que muda se `regras` passarem a valer, nos lançamentos que (tipo, chave) alcança. */
async function planejar(c: Cli, tipo: TipoRegra, chave: string, regras: RegraPainel[]) {
  const linhas = await alcance(c, tipo, chave);
  return linhas
    .map((r) => ({ r, novo: recalcular(paraRegra(r), regras) }))
    .filter(({ r, novo }) => novo.categoria !== r.categoria || novo.classe !== r.classe);
}

async function gravarMudancas(c: Cli, muda: { r: any; novo: { categoria: string; classe: string } }[]) {
  for (const { r, novo } of muda) {
    await c.query(`UPDATE financas_lancamentos SET categoria = $2, classe = $3 WHERE id_transacao = $1`, [r.id_transacao, novo.categoria, novo.classe]);
  }
}

export async function previaRegra(p: PedidoRegra): Promise<{
  afetados: number; porCategoria: Record<string, number>; mudancasDeClasse: { de: string; para: string; n: number }[];
} | { erro: string }> {
  const alvo = await resolver(writerPool, p);
  if ('erro' in alvo) return alvo;
  const outras = (await regrasDoPainel(writerPool)).filter((r) => !(r.tipo === alvo.tipo && r.chave === alvo.chave));
  const muda = await planejar(writerPool, alvo.tipo, alvo.chave, [...outras, { id: Number.MAX_SAFE_INTEGER, tipo: alvo.tipo, chave: alvo.chave, categoria: p.categoria }]);
  const porCategoria: Record<string, number> = {};
  for (const { r } of muda) porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + 1;
  // F4 (pendência): mudar a categoria pode mudar a classe (uma entrada "receita" vira "estorno"): a prévia diz
  const classes = new Map<string, number>();
  for (const { r, novo } of muda) if (novo.classe !== r.classe) classes.set(`${r.classe}|${novo.classe}`, (classes.get(`${r.classe}|${novo.classe}`) ?? 0) + 1);
  const mudancasDeClasse = Array.from(classes, ([k, n]) => { const [de, para] = k.split('|'); return { de, para, n }; });
  return { afetados: muda.length, porCategoria, mudancasDeClasse };
}

export async function salvarRegra(p: PedidoRegra): Promise<{ id: number; afetados: number } | { erro: string }> {
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    await cli.query('SELECT pg_advisory_xact_lock(4207)'); // uma escrita de regra por vez
    const alvo = await resolver(cli, p);
    if ('erro' in alvo) { await cli.query('ROLLBACK'); return alvo; }
    const { rows } = await cli.query(
      `INSERT INTO financas_categoria_painel (tipo, chave, categoria, nome) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tipo, chave) DO UPDATE SET categoria = EXCLUDED.categoria, nome = EXCLUDED.nome, criado_em = now()
       RETURNING id`,
      [alvo.tipo, alvo.chave, p.categoria, alvo.nome],
    );
    const id = Number(rows[0].id);
    const muda = await planejar(cli, alvo.tipo, alvo.chave, await regrasDoPainel(cli));
    await gravarMudancas(cli, muda);
    await cli.query(`UPDATE financas_categoria_painel SET afetados = $2 WHERE id = $1`, [id, muda.length]);
    await cli.query('COMMIT');
    return { id, afetados: muda.length };
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}

/** Apaga a regra e recalcula o que ela alcançava: volta ao banco ou a outra regra que ainda valha. */
export async function apagarRegra(id: number): Promise<{ afetados: number } | null> {
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    await cli.query('SELECT pg_advisory_xact_lock(4207)'); // uma escrita de regra por vez
    const { rows } = await cli.query(`DELETE FROM financas_categoria_painel WHERE id = $1 RETURNING tipo, chave`, [id]);
    if (!rows[0]) { await cli.query('ROLLBACK'); return null; }
    const muda = await planejar(cli, rows[0].tipo, rows[0].chave, await regrasDoPainel(cli));
    await gravarMudancas(cli, muda);
    await cli.query('COMMIT');
    return { afetados: muda.length };
  } catch (e) {
    await cli.query('ROLLBACK');
    throw e;
  } finally {
    cli.release();
  }
}

/** Para a tela Regras: sem a chave (na regra por pessoa ela é o documento). */
export interface RegraListada { id: number; tipo: TipoRegra; nome: string; categoria: string; afetados: number; criadoEm: string }
export async function listarRegras(): Promise<RegraListada[]> {
  const rows = await q<any>(
    `SELECT id, tipo, nome, categoria, afetados, to_char(criado_em, 'YYYY-MM-DD') AS criado
     FROM financas_categoria_painel ORDER BY criado_em DESC, id DESC`,
  );
  return rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, nome: x.nome ?? '', categoria: x.categoria, afetados: Number(x.afetados), criadoEm: x.criado }));
}

/** O que a folha "Mudar categoria" precisa de um lançamento — nunca o documento da contraparte. */
export interface LancCorrigir {
  id: string; data: string; valor: number; descricao: string; categoria: string; origem: Origem;
  temDoc: boolean; nomeContraparte: string | null; sugestaoTexto: string; maisUsadas: string[];
}
export async function getLancamentoParaCorrigir(id: string): Promise<LancCorrigir | null> {
  const leitor: Cli = { query: (t, p) => q<any>(t, p).then((rows) => ({ rows })) };
  const [rows, regras, usadas] = await Promise.all([
    q<any>(
      // F4 (pendência): "Agora:" com a categoria que as telas mostram (categoria_efetiva aplica as regras antigas nas vagas)
      `SELECT id_transacao, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor::float8 AS valor, descricao,
              categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria,
              COALESCE(categoria_banco, categoria) AS categoria_banco, contraparte_doc, contraparte_nome
       FROM financas_lancamentos WHERE id_transacao = $1`,
      [id],
    ),
    regrasDoPainel(leitor),
    q<any>(
      `SELECT categoria FROM financas_lancamentos
       WHERE classe = 'despesa' AND data_lancamento >= now() - interval '3 months'
       GROUP BY 1 ORDER BY count(*) DESC LIMIT 6`,
    ),
  ]);
  const r = rows[0];
  if (!r) return null;
  const e = categoriaEfetiva({ id: r.id_transacao, descricao: r.descricao ?? '', contraparteDoc: r.contraparte_doc, categoriaBanco: r.categoria_banco }, regras);
  return {
    id: r.id_transacao, data: r.data, valor: Number(r.valor), descricao: r.descricao ?? '', categoria: r.categoria, origem: e.origem,
    temDoc: !!r.contraparte_doc, nomeContraparte: r.contraparte_doc ? nomeSemDocumento(r.contraparte_nome) : null,
    sugestaoTexto: sugerirTexto(r.descricao ?? ''), maisUsadas: usadas.map((x) => x.categoria),
  };
}

// ==================== AJUSTES DA TRILHA (F4b) ====================

/** Metas ajustadas pelo casal; sem linha gravada, o padrão do código. */
export async function getMetasTrilha(): Promise<MetasTrilha> {
  const rows = await q<any>(`SELECT chave, valor::float8 AS valor FROM financas_trilha_config`);
  const m = new Map(rows.map((r) => [r.chave as string, Number(r.valor)]));
  return {
    mesesReserva: m.get('meses_reserva') ?? METAS_PADRAO.mesesReserva,
    metaPatrimonio: m.get('meta_patrimonio') ?? METAS_PADRAO.metaPatrimonio,
  };
}

async function getMarcasDivida(): Promise<MarcasDivida> {
  const rows = await q<any>(`SELECT tipo, chave FROM financas_divida_marcacao`);
  return {
    nao: new Set(rows.filter((r) => r.tipo === 'nao_divida').map((r) => r.chave)),
    sim: new Set(rows.filter((r) => r.tipo === 'divida').map((r) => r.chave)),
  };
}

/** "É dívida" vem da folha (a chave sai do lançamento, no servidor); "não é dívida" vem da trilha, com a chave
 *  do grupo exibido (descrição + banco, sem documento). Marcar um tipo apaga o oposto da mesma chave. */
export async function marcarDivida(
  p: { tipo: 'divida'; idTransacao: string } | { tipo: 'nao_divida'; chave: string; nome: string },
): Promise<{ id: number } | { erro: string }> {
  let chave: string;
  let nome: string;
  if (p.tipo === 'divida') {
    const [l] = await q<any>(
      `SELECT descricao, COALESCE(banco,'—') AS banco, classe, forma_pagamento, tipo_movimento, parcela_total FROM financas_lancamentos WHERE id_transacao = $1`,
      [p.idTransacao],
    );
    if (!l) return { erro: 'Lançamento não encontrado.' };
    // a mesma seleção da trilha (getTrilhaDados): receita ou pagamento de fatura pela conta nunca entram
    const entra = l.classe === 'despesa' || (l.classe === 'pagamento_fatura' && l.forma_pagamento === 'Crédito' && l.tipo_movimento === 'Saída');
    if (!entra) return { erro: 'Só despesa ou parcela no cartão entra na trilha.' };
    // F4b: parcelamento marca só aquele plano (antes marcava todos de mesma descrição no banco)
    const base = chaveDivida(l.descricao ?? '', l.banco);
    chave = Number(l.parcela_total) > 1 ? `${base}#${Number(l.parcela_total)}` : base;
    nome = base.split('|')[0];
  } else {
    if (!p.chave || !p.chave.includes('|')) return { erro: 'Dívida inválida.' };
    chave = p.chave;
    nome = p.nome || chave.split('|')[0];
  }
  const oposto = p.tipo === 'divida' ? 'nao_divida' : 'divida';
  const cli = await writerPool.connect();
  try {
    await cli.query('BEGIN');
    await cli.query(`DELETE FROM financas_divida_marcacao WHERE tipo = $1 AND chave = $2`, [oposto, chave]);
    const { rows } = await cli.query(
      `INSERT INTO financas_divida_marcacao (tipo, chave, nome) VALUES ($1, $2, $3)
       ON CONFLICT (tipo, chave) DO UPDATE SET nome = EXCLUDED.nome, criado_em = now() RETURNING id`,
      [p.tipo, chave, nome],
    );
    await cli.query('COMMIT');
    return { id: Number(rows[0].id) };
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cli.release();
  }
}

export async function apagarMarcacao(id: number): Promise<boolean> {
  return (await qw(`DELETE FROM financas_divida_marcacao WHERE id = $1 RETURNING id`, [id])).length > 0;
}

export async function salvarMeta(chave: ChaveMeta, valor: number): Promise<void> {
  await qw(
    `INSERT INTO financas_trilha_config (chave, valor) VALUES ($1, $2)
     ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`,
    [chave, valor],
  );
}

export async function apagarMeta(chave: ChaveMeta): Promise<boolean> {
  return (await qw(`DELETE FROM financas_trilha_config WHERE chave = $1 RETURNING chave`, [chave])).length > 0;
}

export interface AjustesTrilha {
  marcacoes: { id: number; tipo: 'nao_divida' | 'divida'; nome: string; criadoEm: string }[];
  metas: { chave: ChaveMeta; valor: number }[];
}
export async function listarAjustesTrilha(): Promise<AjustesTrilha> {
  const [m, c] = await Promise.all([
    q<any>(`SELECT id, tipo, nome, to_char(criado_em,'YYYY-MM-DD') AS criado FROM financas_divida_marcacao ORDER BY criado_em DESC, id DESC`),
    q<any>(`SELECT chave, valor::float8 AS valor FROM financas_trilha_config ORDER BY chave`),
  ]);
  return {
    marcacoes: m.map((x) => ({ id: Number(x.id), tipo: x.tipo, nome: x.nome ?? '', criadoEm: x.criado })),
    metas: c.map((x) => ({ chave: x.chave, valor: Number(x.valor) })),
  };
}


// ==================== RESUMOS DO D ====================

/** Gasto do casal por categoria (efetiva) num intervalo [inicio, fimExcl). */
export async function getGastoPorCategoriaEntre(inicio: string, fimExcl: string, resp: Resp = 'casal'): Promise<Map<string, number>> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria, contraparte_doc) AS cat, SUM(valor)::float8 AS v
     FROM financas_lancamentos
     WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date${r.sql}
     GROUP BY 1`,
    [inicio, fimExcl, ...r.p],
  );
  return new Map(rows.map((x) => [x.cat as string, Math.round(Number(x.v) * 100) / 100]));
}

/** Gasto livre por dia do mês de `hoje`, até `hoje` (o mesmo filtro do variavelJaGasto: débito, fora casa e fixos). */
export async function getGastoLivrePorDia(resp: Resp, hoje: string): Promise<{ dia: number; valor: number }[]> {
  const r = rf(resp, 1);
  const n = r.p.length;
  const rows = await q<any>(
    `SELECT extract(day from l.data_lancamento)::int AS dia, SUM(l.valor)::float8 AS valor
     FROM financas_lancamentos l
     WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
       AND l.data_lancamento >= date_trunc('month', $${n + 1}::date) AND l.data_lancamento <= $${n + 1}::date
       AND NOT (l.categoria = ANY($${n + 2}::text[])) AND NOT (l.categoria = ANY($${n + 3}::text[]))
       AND ${SEM_ESPELHO}${r.sql}
     GROUP BY 1 ORDER BY 1`,
    [...r.p, hoje, CASA_CATS, FIXO_DEBITO_CATS],
  );
  return rows.map((x) => ({ dia: Number(x.dia), valor: Math.round(Number(x.valor) * 100) / 100 }));
}

/** E1: maiores despesas de um período (grupo opcional, pelos grupos do painel). */
export async function getMaioresGastos(resp: Resp, inicio: string, fimExcl: string, grupo: string | null, limite = 10) {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT to_char(data_lancamento,'DD/MM') AS data, valor::float8 AS valor, COALESCE(descricao,'(sem descrição)') AS descricao,
            COALESCE(responsavel,'—') AS pessoa, categoria_efetiva(descricao, categoria, contraparte_doc) AS categoria
     FROM financas_lancamentos
     WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date${r.sql}
     ORDER BY valor DESC, data_lancamento`,
    [inicio, fimExcl, ...r.p],
  );
  return rows
    .filter((x) => grupo === null || (grupoDaCategoria(x.categoria)?.nome ?? 'Resto') === grupo)
    .slice(0, limite)
    // sem CPF/CNPJ: a descrição vai para a Groq e para o grupo
    .map((x) => ({ data: x.data, valor: Math.round(Number(x.valor) * 100) / 100, descricao: nomeSemDocumento(x.descricao) ?? '(sem descrição)', pessoa: x.pessoa, categoria: x.categoria }));
}

/** E2: o alvo (tipo, chave, nome) que uma regra do painel teria — o mesmo que salvarRegra usa. */
export async function alvoDaRegra(p: PedidoRegra) {
  return resolver(writerPool, p);
}

/** E2: categoria da regra do painel que já existe para (tipo, chave), ou null. */
export async function categoriaDaRegra(tipo: string, chave: string): Promise<{ id: number; categoria: string } | null> {
  const r = await writerPool.query(`SELECT id, categoria FROM financas_categoria_painel WHERE tipo = $1 AND chave = $2`, [tipo, chave]);
  return r.rows[0] ? { id: Number(r.rows[0].id), categoria: r.rows[0].categoria } : null;
}

/** E2: despesas para o bot escolher qual corrigir (texto e/ou valor), as mais recentes primeiro, até 5. */
export async function getBuscaBot(resp: Resp, inicio: string, fimExcl: string, texto: string | null, valor: number | null) {
  const r = rf(resp, 5);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'DD/MM') AS data, valor::float8 AS valor, COALESCE(descricao,'') AS descricao,
            COALESCE(responsavel,'—') AS pessoa, categoria
     FROM financas_lancamentos
     WHERE classe = 'despesa' AND data_lancamento >= $1::date AND data_lancamento < $2::date
       AND ($3::text IS NULL OR descricao ILIKE '%' || $3 || '%')
       AND ($4::float8 IS NULL OR abs(valor - $4) < 0.005)${r.sql}
     ORDER BY data_lancamento DESC, id_transacao LIMIT 5`,
    [inicio, fimExcl, texto === null ? null : escaparLike(texto), valor, ...r.p],
  );
  return rows.map((x) => ({ id: x.id, data: x.data, valor: Math.round(Number(x.valor) * 100) / 100, descricao: nomeSemDocumento(x.descricao) ?? '(sem descrição)', pessoa: x.pessoa, categoria: x.categoria }));
}

// ==================== AVISOS DO DIÁRIO (Onda 2, auditoria 13/10) ====================

/**
 * Dados dos avisos por exceção do diário (o texto sai de avisosDoDia + worker). `hoje` = dia da mensagem;
 * o dia resumido é ontem. Juros: últimos 3 dias. Fora do padrão: compra de ontem acima de R$ 100 e de 3× a
 * mediana da categoria nos 90 dias anteriores (com pelo menos 5 compras para comparar). Do casal.
 */
export async function getDadosAvisos(hoje: string = currentDateSP()): Promise<DadosAvisos> {
  const ontem = addDays(hoje, -1), anteontem = addDays(hoje, -2);
  const iniMes = `${ontem.slice(0, 7)}-01`;
  const [saldos, cand, orc, fora] = await Promise.all([
    q<any>(`SELECT banco, responsavel, saldo::float8 AS saldo FROM financas_saldos WHERE COALESCE(tipo, 'CHECKING_ACCOUNT') = 'CHECKING_ACCOUNT'`),
    q<any>(`SELECT banco, responsavel, descricao, categoria, valor::float8 AS valor FROM financas_lancamentos
             WHERE tipo_movimento = 'Saída' AND classe IN ('despesa', 'pagamento_fatura')
               AND data_lancamento > $1::date - 3 AND data_lancamento <= $1::date`, [hoje]),
    q<any>(`SELECT o.item, COALESCE(o.emoji, '') AS emoji, o.teto::float8 AS teto,
                   COALESCE(SUM(l.valor) FILTER (WHERE l.data_lancamento <= $3::date), 0)::float8 AS ate_anteontem,
                   COALESCE(SUM(l.valor), 0)::float8 AS ate_ontem
              FROM financas_orcamento o
              LEFT JOIN financas_lancamentos l ON l.classe = 'despesa' AND l.categoria = ANY(o.categorias)
                   AND l.data_lancamento >= $1::date AND l.data_lancamento <= $2::date
             WHERE o.ativo = true GROUP BY 1, 2, 3`, [iniMes, ontem, anteontem]),
    q<any>(`WITH ref AS (
              SELECT categoria, percentile_cont(0.5) WITHIN GROUP (ORDER BY valor)::float8 AS mediana, COUNT(*) AS n
                FROM financas_lancamentos
               WHERE classe = 'despesa' AND data_lancamento >= $1::date - 90 AND data_lancamento < $1::date
               GROUP BY 1)
            SELECT l.descricao, l.valor::float8 AS valor, l.categoria, ref.mediana
              FROM financas_lancamentos l JOIN ref ON ref.categoria = l.categoria
             WHERE l.classe = 'despesa' AND l.data_lancamento = $1::date AND l.valor > 100
               AND ref.n >= 5 AND l.valor > 3 * ref.mediana`, [ontem]),
  ]);
  return {
    saldos: saldos.map((x) => ({ banco: x.banco, responsavel: x.responsavel, saldo: Number(x.saldo) })),
    encargos: cand.filter((x) => ehAtraso(x.descricao ?? '', x.categoria)).map((x) => ({ banco: x.banco, responsavel: x.responsavel, valor: Number(x.valor) })),
    orcamento: orc.map((x) => ({ item: x.item, emoji: x.emoji, teto: Number(x.teto), ateAnteontem: Number(x.ate_anteontem), ateOntem: Number(x.ate_ontem) })),
    foraDoPadrao: fora.map((x) => ({ descricao: nomeSemDocumento(x.descricao) ?? 'compra', valor: Number(x.valor), categoria: x.categoria, mediana: Number(x.mediana) })),
  };
}
