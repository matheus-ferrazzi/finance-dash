import { q } from './db';
import { currentMonthSP, normalizeMes, mesLongo } from './format';

export type Resp = 'casal' | 'Matheus' | 'Ariane';

// ---------- período (mês ou janela de dias) ----------
export function currentDateSP(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
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

export type PeriodKind = '7d' | '15d' | '30d' | 'mes';
export interface Periodo {
  kind: PeriodKind;
  start: string; endExcl: string;
  prevStart: string; prevEndExcl: string;
  label: string; mesAnchor: string;
}

export function resolvePeriodo(p?: string, mes?: string): Periodo {
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

export interface BancoRow { banco: string; total: number; }

export async function getPorBanco(resp: Resp, per: Periodo): Promise<BancoRow[]> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT COALESCE(banco,'Outros') AS banco, SUM(valor) AS total
     FROM financas_lancamentos WHERE classe='despesa' AND ${RANGE}${r.sql}
     GROUP BY 1 ORDER BY total DESC`,
    [per.start, per.endExcl, ...r.p],
  );
  return rows.map((x) => ({ banco: x.banco, total: Number(x.total) }));
}

export interface Lanc {
  id: string; data: string; valor: number; descricao: string;
  categoria: string; banco: string; responsavel: string; classe: string;
}
function mapLanc(rows: any[]): Lanc[] {
  return rows.map((r) => ({
    id: r.id, data: r.data, valor: Number(r.valor), descricao: r.descricao,
    categoria: r.categoria, banco: r.banco, responsavel: r.responsavel, classe: r.classe,
  }));
}

export async function getDespesas(resp: Resp, per: Periodo): Promise<Lanc[]> {
  const r = rf(resp, 3);
  const rows = await q<any>(
    `SELECT id_transacao AS id, data_lancamento AS data, valor, descricao,
            COALESCE(categoria,'Outros') AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
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
            COALESCE(categoria,'Outros') AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE classe IN ('despesa','receita') AND ${RANGE}${r.sql}
     ORDER BY data_lancamento DESC, criado_em DESC LIMIT ${limit}`,
    [per.start, per.endExcl, ...r.p],
  );
  return mapLanc(rows);
}

export interface Fatura {
  id: string; banco: string; responsavel: string; valor: number;
  limite: number; disponivel: number; vencimento: string | null; fechamento: string | null;
}
export async function getFaturas(resp: Resp): Promise<Fatura[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT id_conta AS id, COALESCE(banco,'—') AS banco, responsavel,
            COALESCE(valor_fatura_atual,0) AS valor, COALESCE(limite_total,0) AS limite,
            COALESCE(limite_disponivel,0) AS disponivel,
            to_char(data_vencimento,'YYYY-MM-DD') AS vencimento, to_char(data_fechamento,'YYYY-MM-DD') AS fechamento
     FROM financas_faturas WHERE 1=1${r.sql} ORDER BY data_vencimento NULLS LAST`,
    r.p,
  );
  return rows.map((x) => ({
    id: x.id, banco: x.banco, responsavel: x.responsavel,
    valor: Number(x.valor), limite: Number(x.limite), disponivel: Number(x.disponivel),
    vencimento: x.vencimento, fechamento: x.fechamento,
  }));
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

export const CASA_CATS = ['Housing', 'Electricity', 'Water', 'Internet', 'Telecommunications', 'Gas'];

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

export interface SyncConn { banco: string; responsavel: string; lastSync: string; horas: number; }
export interface SyncStatus { oldestH: number; conns: SyncConn[] }

export async function getSyncStatus(): Promise<SyncStatus> {
  const rows = await q<any>(
    `SELECT banco, responsavel, to_char(last_sync,'YYYY-MM-DD"T"HH24:MI:SSOF') AS last_sync,
            ROUND(EXTRACT(EPOCH FROM (now()-last_sync))/3600, 1) AS horas
     FROM financas_sync ORDER BY last_sync ASC`,
  );
  const conns: SyncConn[] = rows.map((r) => ({
    banco: r.banco, responsavel: r.responsavel, lastSync: r.last_sync, horas: Number(r.horas),
  }));
  const oldestH = conns.length ? Math.max(...conns.map((c) => c.horas)) : 0;
  return { oldestH, conns };
}

/** compras de crédito (despesa) numa janela ampla, pra montar a composição da fatura por cartão */
export async function getCreditoDespesas(resp: Resp): Promise<Lanc[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor, descricao,
            COALESCE(categoria,'Outros') AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE classe='despesa' AND forma_pagamento='Crédito'
       AND data_lancamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 75
       AND data_lancamento <  (now() AT TIME ZONE 'America/Sao_Paulo')::date + 75${r.sql}
     ORDER BY data_lancamento DESC, valor DESC`,
    r.p,
  );
  return mapLanc(rows);
}

export interface Assinatura { nome: string; valorMedio: number; meses: number; categoria: string; banco: string; ultima: string; }

/** gastos recorrentes (aparecem em >= 3 meses distintos) — assinaturas/mensalidades */
export async function getAssinaturas(resp: Resp): Promise<Assinatura[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `WITH base AS (
       SELECT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave,
              valor, COALESCE(categoria,'Outros') AS categoria, COALESCE(banco,'—') AS banco,
              date_trunc('month', data_lancamento) AS mes, data_lancamento
       FROM financas_lancamentos
       WHERE classe='despesa'
         AND data_lancamento >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '6 months'
         AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     )
     SELECT chave AS nome, ROUND(AVG(valor),2) AS valor_medio, COUNT(DISTINCT mes) AS meses,
            mode() WITHIN GROUP (ORDER BY categoria) AS categoria,
            mode() WITHIN GROUP (ORDER BY banco) AS banco,
            to_char(MAX(data_lancamento),'YYYY-MM-DD') AS ultima
     FROM base
     WHERE length(chave) >= 4
     GROUP BY chave
     HAVING COUNT(DISTINCT mes) >= 3 AND ROUND(AVG(valor),2) >= 5
     ORDER BY valor_medio DESC LIMIT 30`,
    r.p,
  );
  return rows.map((x) => ({
    nome: x.nome, valorMedio: Number(x.valor_medio), meses: Number(x.meses),
    categoria: x.categoria, banco: x.banco, ultima: x.ultima,
  }));
}

export async function getBusca(resp: Resp, termo: string): Promise<Lanc[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor, descricao,
            COALESCE(categoria,'Outros') AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
     FROM financas_lancamentos
     WHERE descricao ILIKE '%' || $1 || '%'
       AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     ORDER BY data_lancamento DESC LIMIT 80`,
    [termo, ...r.p],
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
