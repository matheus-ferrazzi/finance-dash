import { q, qw } from './db';
import { currentMonthSP, normalizeMes, mesLongo, mesLabel, currentDateSP } from './format';

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

/**
 * Lançamentos-espelho do Bradesco: o banco replica a dívida do cartão na conta
 * corrente ("MORA CARTAO", "PROVISAO"). Não é dinheiro saindo — se entrar na
 * conta de caixa, inventa saídas de R$ 13 mil que nunca existiram.
 */
const SEM_ESPELHO = `descricao NOT ILIKE '%MORA CARTAO%'
  AND descricao NOT ILIKE '%PROVISAO%' AND descricao NOT ILIKE '%GASTOS CART%'`;
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
              descricao, valor, data_lancamento, COALESCE(categoria,'Outros') AS categoria,
              COALESCE(banco,'—') AS banco, responsavel
       FROM financas_lancamentos
       WHERE classe='despesa' AND data_lancamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     )
     SELECT chave, COUNT(*) AS restantes, ROUND(AVG(valor),2) AS valor_parcela,
            to_char(MAX(data_lancamento),'YYYY-MM-DD') AS data_fim,
            mode() WITHIN GROUP (ORDER BY categoria) AS categoria,
            mode() WITHIN GROUP (ORDER BY banco) AS banco,
            mode() WITHIN GROUP (ORDER BY responsavel) AS responsavel,
            (array_agg(descricao ORDER BY data_lancamento ASC))[1] AS proxima_desc
     FROM fut
     WHERE length(chave) >= 4
     GROUP BY chave
     ORDER BY data_fim DESC`,
    r.p,
  );
  return rows.map((x) => {
    const m = String(x.proxima_desc ?? '').match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    return {
      chave: x.chave, categoria: x.categoria, banco: x.banco, responsavel: x.responsavel,
      valorParcela: Number(x.valor_parcela), restantes: Number(x.restantes), dataFim: x.data_fim,
      parcelaAtual: m ? Number(m[1]) : null, parcelaTotal: m ? Number(m[2]) : null,
    };
  });
}

/** compromissos cadastrados manualmente (aluguel, luz, água, financiamentos — a Pluggy não sabe "até quando") */
export interface CompromissoManual {
  id: number; nome: string; categoria: string; valor: number; responsavel: string;
  dataInicio: string; mesesTotais: number | null; observacao: string | null; dataFim: string | null;
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

export interface SaldoConta {
  banco: string; responsavel: string; saldo: number; atualizadoPluggy: string | null;
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

/** ingredientes crus da projeção — combinados por computeProjecao (função pura, sem DB) */
export interface ProjecaoBase {
  patrimonioAtual: number;
  saldoContasAtual: number;
  /** reaproveitado pela página — evita refazer as mesmas consultas */
  saldoContas: { total: number; contas: SaldoConta[] };
  receitaMediaMensal: number;
  /** gasto no DÉBITO (fora casa) — o que sai direto da conta */
  despesaVariavelMediaMensal: number;
  /** compras novas no crédito por mês (fora parcelamentos) — vira fatura */
  creditoNovoMedio: number;
  /** média mensal por categoria da casa (aluguel/luz/água/internet/telefone/gás) */
  despesaCasaPorCategoria: Record<string, number>;
  despesaFixaPorMes: Record<string, number>; // 'YYYY-MM' -> soma de lançamentos futuros já confirmados pela Pluggy
  compromissosManuais: CompromissoManual[];
  /** o que já aconteceu no mês em andamento — usado pra fechar o mês corrente */
  mesCorrente: {
    receitaJaRecebida: number;
    receitaAgendada: number;
    /** entradas recorrentes que ainda não caíram (ex.: salário do dia 20) */
    receitasAReceber: ReceitaPrevista[];
    variavelJaGasto: number;               // no débito, fora casa
    agendadoRestante: number;              // débito já datado no resto do mês (fora casa)
    faturaJaPaga: number;                  // fatura de cartão já paga neste mês
    casaNoMesPorCategoria: Record<string, number>; // inclui o que já saiu e o que está agendado
  };
}

/**
 * Meses cujos dados dão pra confiar. Detector: transferência entre contas próprias
 * tem que se anular (sai de uma, entra na outra). Quando não anula, é porque alguma
 * conta ainda não estava conectada na Pluggy e faltam lançamentos naquele mês.
 * Sem esse filtro as médias ficam infladas por meses pela metade.
 */
async function getMesesConfiaveis(resp: Resp): Promise<string[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `SELECT to_char(mes,'YYYY-MM-DD') AS mes FROM (
       SELECT date_trunc('month',data_lancamento) AS mes,
              ABS(COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Entrada'),0)
                - COALESCE(SUM(valor) FILTER (WHERE tipo_movimento='Saída'),0)) AS gap
       FROM financas_lancamentos
       WHERE classe='transferencia_interna' AND forma_pagamento='Débito'
         AND data_lancamento >= date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '6 months'
         AND data_lancamento <  date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date)${r.sql}
       GROUP BY 1
     ) x WHERE gap < 1000 ORDER BY mes DESC LIMIT 3`,
    r.p,
  );
  const confiaveis = rows.map((x) => x.mes);
  if (confiaveis.length > 0) return confiaveis;
  // nenhum mês passou no teste — cai pros últimos 3 pra não zerar a projeção
  const hoje = currentDateSP().slice(0, 7);
  return [1, 2, 3].map((i) => `${addMonthsSP(hoje, -i)}-01`);
}

export interface ReceitaPrevista {
  nome: string; valor: number; diaTipico: number; responsavel: string;
}

/**
 * Entradas recorrentes que AINDA não caíram neste mês (ex.: a 2ª parcela do
 * salário, que cai sempre no dia 20). Agrupa por descrição + metade do mês,
 * porque o mesmo salário pode vir em duas parcelas com a mesma descrição.
 */
async function getReceitasAReceber(resp: Resp): Promise<ReceitaPrevista[]> {
  const r = rf(resp, 1);
  const rows = await q<any>(
    `WITH base AS (
       SELECT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave,
              CASE WHEN EXTRACT(day FROM data_lancamento) <= 15 THEN 'inicio' ELSE 'fim' END AS metade,
              valor, responsavel, date_trunc('month',data_lancamento) AS mes,
              EXTRACT(day FROM data_lancamento) AS dia
       FROM financas_lancamentos
       WHERE classe='receita' AND valor >= 300
         AND data_lancamento >= date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date) - interval '3 months'
         AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date${r.sql}
     ),
     por_mes AS (
       SELECT chave, metade, mes, SUM(valor) AS total, MIN(dia) AS dia,
              mode() WITHIN GROUP (ORDER BY responsavel) AS responsavel
       FROM base GROUP BY 1,2,3
     )
     SELECT chave, metade,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY total)
                  FILTER (WHERE mes < date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date))::numeric, 2) AS media,
            ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY dia)
                  FILTER (WHERE mes < date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date))::numeric) AS dia_tipico,
            mode() WITHIN GROUP (ORDER BY responsavel) AS responsavel,
            COUNT(*) FILTER (WHERE mes < date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date)) AS meses_antes,
            COUNT(*) FILTER (WHERE mes = date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date)) AS ja_caiu
     FROM por_mes GROUP BY 1,2`,
    r.p,
  );
  return rows
    .filter((x) => Number(x.meses_antes) >= 2 && Number(x.ja_caiu) === 0 && Number(x.media) > 0)
    .map((x) => ({
      nome: String(x.chave).trim(), valor: Number(x.media),
      diaTipico: Number(x.dia_tipico), responsavel: x.responsavel,
    }));
}

export async function getProjecaoBase(resp: Resp): Promise<ProjecaoBase> {
  const [patrimonioAtual, saldoContas, meses] = await Promise.all([
    getPatrimonioAtual(resp), getSaldoContas(resp), getMesesConfiaveis(resp),
  ]);
  const saldoContasAtual = saldoContas.total;

  const r1 = rf(resp, 2);
  const receitaRows = await q<any>(
    `SELECT ROUND(AVG(m.total),2) AS media FROM (
       SELECT date_trunc('month',data_lancamento) AS mes, SUM(valor) AS total
       FROM financas_lancamentos
       WHERE classe='receita'
         AND date_trunc('month',data_lancamento) = ANY($1::date[])${r1.sql}
       GROUP BY 1
     ) m`,
    [meses, ...r1.p],
  );

  // BASE CAIXA: só o que sai da CONTA (débito). Compra no crédito não sai aqui —
  // ela vira fatura e é descontada quando a fatura é paga.
  const r2 = rf(resp, 3);
  const varRows = await q<any>(
    `SELECT ROUND(AVG(m.total),2) AS media FROM (
       SELECT date_trunc('month',l.data_lancamento) AS mes, SUM(l.valor) AS total
       FROM financas_lancamentos l
       WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
         AND NOT (l.categoria = ANY($1::text[]))
         AND ${SEM_ESPELHO}
         AND date_trunc('month',l.data_lancamento) = ANY($2::date[])${r2.sql}
       GROUP BY 1
     ) m`,
    [CASA_CATS, meses, ...r2.p],
  );

  // compras novas no crédito (fora parcelamentos) — é o que vira fatura do mês seguinte
  const rcn = rf(resp, 2);
  const creditoRows = await q<any>(
    `WITH chaves_parceladas AS (
       SELECT DISTINCT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS chave
       FROM financas_lancamentos
       WHERE classe='despesa' AND data_lancamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date
     )
     SELECT ROUND(AVG(m.total),2) AS media FROM (
       SELECT date_trunc('month',l.data_lancamento) AS mes, SUM(l.valor) AS total
       FROM financas_lancamentos l
       WHERE l.classe='despesa' AND l.forma_pagamento='Crédito'
         AND trim(regexp_replace(regexp_replace(lower(coalesce(l.descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) NOT IN (SELECT chave FROM chaves_parceladas)
         AND date_trunc('month',l.data_lancamento) = ANY($1::date[])${rcn.sql}
       GROUP BY 1
     ) m`,
    [meses, ...rcn.p],
  );

  // gastos da casa entram pela média real por categoria (aluguel, luz, água...).
  // Ficam fora da média "variável" acima justamente pra não contar duas vezes.
  const rc = rf(resp, 3);
  const casaRows = await q<any>(
    `SELECT categoria, ROUND(AVG(total),2) AS media FROM (
       SELECT COALESCE(categoria,'Outros') AS categoria,
              date_trunc('month',data_lancamento) AS mes, SUM(valor) AS total
       FROM financas_lancamentos
       WHERE classe='despesa' AND categoria = ANY($1::text[])
         AND date_trunc('month',data_lancamento) = ANY($2::date[])${rc.sql}
       GROUP BY 1,2
     ) m GROUP BY categoria`,
    [CASA_CATS, meses, ...rc.p],
  );
  const despesaCasaPorCategoria: Record<string, number> = {};
  casaRows.forEach((x) => { despesaCasaPorCategoria[x.categoria] = Number(x.media); });

  const r3 = rf(resp, 1);
  const fixaRows = await q<any>(
    `SELECT to_char(date_trunc('month',data_lancamento),'YYYY-MM') AS mes, SUM(valor) AS total
     FROM financas_lancamentos
     WHERE classe='despesa' AND data_lancamento > (now() AT TIME ZONE 'America/Sao_Paulo')::date${r3.sql}
     GROUP BY 1 ORDER BY 1`,
    r3.p,
  );
  const despesaFixaPorMes: Record<string, number> = {};
  fixaRows.forEach((x) => { despesaFixaPorMes[x.mes] = Number(x.total); });

  const compromissosManuais = await getCompromissosManuais(resp);
  const receitasAReceber = await getReceitasAReceber(resp);

  // --- mês em andamento: o que já entrou/saiu e o que ainda falta ---
  const rmc = rf(resp, 1);
  const mesRows = await q<any>(
    `WITH sp AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje),
     lim AS (SELECT date_trunc('month',(SELECT hoje FROM sp))::date AS ini,
                    (date_trunc('month',(SELECT hoje FROM sp)) + interval '1 month')::date AS fim),
     chaves AS (
       SELECT DISTINCT trim(regexp_replace(regexp_replace(lower(coalesce(descricao,'')), '[0-9]', '', 'g'), '\\s+', ' ', 'g')) AS ch
       FROM financas_lancamentos, sp
       WHERE classe='despesa' AND data_lancamento > sp.hoje
     )
     SELECT
       (SELECT COALESCE(SUM(valor),0) FROM financas_lancamentos, lim, sp
         WHERE classe='receita' AND data_lancamento >= lim.ini AND data_lancamento <= sp.hoje${rmc.sql}) AS receita_recebida,
       (SELECT COALESCE(SUM(valor),0) FROM financas_lancamentos, lim, sp
         WHERE classe='receita' AND data_lancamento > sp.hoje AND data_lancamento < lim.fim${rmc.sql}) AS receita_agendada,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND NOT (l.categoria = ANY($${rmc.p.length + 1}::text[]))
           AND ${SEM_ESPELHO}${rmc.sql}) AS variavel_gasto,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento > sp.hoje AND l.data_lancamento < lim.fim
           AND NOT (l.categoria = ANY($${rmc.p.length + 1}::text[]))
           AND ${SEM_ESPELHO}${rmc.sql}) AS agendado_restante,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='pagamento_fatura' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND ${SEM_ESPELHO}${rmc.sql}) AS fatura_ja_paga`,
    [...rmc.p, CASA_CATS],
  );

  const rcm = rf(resp, 2);
  const casaMesRows = await q<any>(
    `SELECT COALESCE(categoria,'Outros') AS categoria, ROUND(SUM(valor),2) AS total
     FROM financas_lancamentos
     WHERE classe='despesa' AND categoria = ANY($1::text[])
       AND data_lancamento >= date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date)
       AND data_lancamento <  date_trunc('month',(now() AT TIME ZONE 'America/Sao_Paulo')::date) + interval '1 month'${rcm.sql}
     GROUP BY 1`,
    [CASA_CATS, ...rcm.p],
  );
  const casaNoMesPorCategoria: Record<string, number> = {};
  casaMesRows.forEach((x) => { casaNoMesPorCategoria[x.categoria] = Number(x.total); });

  return {
    patrimonioAtual,
    saldoContasAtual,
    saldoContas,
    mesCorrente: {
      receitaJaRecebida: Number(mesRows[0]?.receita_recebida ?? 0),
      receitaAgendada: Number(mesRows[0]?.receita_agendada ?? 0),
      receitasAReceber,
      variavelJaGasto: Number(mesRows[0]?.variavel_gasto ?? 0),
      agendadoRestante: Number(mesRows[0]?.agendado_restante ?? 0),
      faturaJaPaga: Number(mesRows[0]?.fatura_ja_paga ?? 0),
      casaNoMesPorCategoria,
    },
    receitaMediaMensal: Number(receitaRows[0]?.media ?? 0),
    despesaVariavelMediaMensal: Number(varRows[0]?.media ?? 0),
    creditoNovoMedio: Number(creditoRows[0]?.media ?? 0),
    despesaCasaPorCategoria,
    despesaFixaPorMes,
    compromissosManuais,
  };
}

export interface ProjecaoMes {
  mes: string; mesLabel: string;
  receita: number;
  despesaFixa: number;     // débito já agendado no mês
  despesaManual: number;   // fixos cadastrados
  despesaCasa: number;
  despesaVariavel: number; // gasto no débito
  fatura: number;          // fatura de cartão que sai da conta no mês
  parcelas: number;        // parte da fatura já contratada (parcelamentos)
  saldo: number;           // fluxo de CAIXA do mês
  saldoProjetado: number;  // dinheiro em conta no fim daquele mês
  /** no mês em andamento os valores são o que AINDA falta acontecer, não o mês inteiro */
  emAndamento?: boolean;
}

function compromissoAtivoNoMes(c: CompromissoManual, mes: string): boolean {
  if (mes < c.dataInicio.slice(0, 7)) return false;
  if (c.dataFim && mes > c.dataFim.slice(0, 7)) return false;
  return true;
}

/**
 * Fatura que sai da conta no mês: as parcelas já agendadas para ele
 * (a Pluggy lança as futuras) mais as compras novas no crédito, que você
 * faz todo mês e caem na fatura seguinte.
 */
function faturaDoMes(base: ProjecaoBase, mes: string): number {
  return (base.despesaFixaPorMes[mes] ?? 0) + base.creditoNovoMedio;
}

function addMonthsSP(anchorYYYYMM: string, n: number): string {
  const [y, m] = anchorYYYYMM.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Função pura (sem DB) — monta a série mês a mês.
 * Regra central: mês futuro NUNCA fica vazio. Mesmo sem nada lançado nele, ele já
 * nasce com as parcelas conhecidas + os fixos cadastrados + a média real de gasto
 * variável. É isso que evita o falso otimismo de planilha ("não preenchi, logo sobrou").
 * `saldoProjetado` parte do saldo REAL das contas correntes (Pluggy) e vai
 * somando o fluxo de cada mês = quanto dinheiro você teria em conta naquele mês.
 */
export function computeProjecao(base: ProjecaoBase, horizonMeses: number): ProjecaoMes[] {
  const anchor = currentMonthSP();
  const out: ProjecaoMes[] = [];
  let saldoProjetado = base.saldoContasAtual;

  // --- mês em andamento: só o que AINDA falta acontecer ---
  // O saldo de hoje já reflete tudo que passou, então somar o mês inteiro contaria duplicado.
  {
    const mc = base.mesCorrente;
    const ativos = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, anchor));
    const cobertas = new Set(ativos.map((c) => c.categoria));

    // fixo cadastrado que ainda não saiu neste mês
    const despesaManual = ativos.reduce(
      (s, c) => s + Math.max(0, c.valor - (mc.casaNoMesPorCategoria[c.categoria] ?? 0)), 0,
    );
    // casa: o que falta pra atingir a média de cada categoria ainda não coberta por cadastro
    const despesaCasa = Object.entries(base.despesaCasaPorCategoria)
      .filter(([cat]) => !cobertas.has(cat))
      .reduce((s, [cat, media]) => s + Math.max(0, media - (mc.casaNoMesPorCategoria[cat] ?? 0)), 0);
    // Gasto do dia a dia é diário. Depois da 1ª semana o ritmo REAL do mês é um
    // previsor melhor que a média histórica — se você está gastando menos, a
    // projeção acompanha em vez de insistir que você vai recuperar o atraso.
    const [, , diaHojeStr] = currentDateSP().split('-');
    const diaHoje = Number(diaHojeStr);
    const [anoA, mesA] = anchor.split('-').map(Number);
    const diasNoMes = new Date(Date.UTC(anoA, mesA, 0)).getUTCDate();
    const ritmo = diaHoje >= 7
      ? mc.variavelJaGasto / diaHoje
      : base.despesaVariavelMediaMensal / diasNoMes;
    const despesaVariavel = ritmo * (diasNoMes - diaHoje);
    const despesaFixa = mc.agendadoRestante;
    // Entradas recorrentes que ainda não caíram (salário do dia 20, etc).
    // Mais preciso que "média menos o que já entrou": sabe QUAL entrada falta.
    const recorrentes = mc.receitasAReceber.reduce((s, r) => s + r.valor, 0);
    const receita = (recorrentes > 0
      ? recorrentes
      : Math.max(0, base.receitaMediaMensal - mc.receitaJaRecebida)) + mc.receitaAgendada;
    const fatura = Math.max(0, faturaDoMes(base, anchor) - mc.faturaJaPaga);
    const parcelas = Math.min(fatura, base.despesaFixaPorMes[anchor] ?? 0);

    const saldo = receita - despesaFixa - despesaManual - despesaCasa - despesaVariavel - fatura;
    saldoProjetado += saldo;
    out.push({
      mes: anchor, mesLabel: mesLabel(anchor), receita, despesaFixa, despesaManual,
      despesaCasa, despesaVariavel, fatura, parcelas, saldo, saldoProjetado, emAndamento: true,
    });
  }

  for (let i = 1; i <= horizonMeses; i++) {
    const mes = addMonthsSP(anchor, i);
    const despesaFixa = 0; // no caixa, parcela de cartão sai dentro da fatura
    const ativosNoMes = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, mes));
    const despesaManual = ativosNoMes.reduce((s, c) => s + c.valor, 0);

    // se você cadastrou um compromisso naquela categoria da casa, o SEU número manda
    // e a média histórica daquela categoria não entra (senão contaria duas vezes)
    const categoriasCobertas = new Set(ativosNoMes.map((c) => c.categoria));
    const despesaCasa = Object.entries(base.despesaCasaPorCategoria)
      .filter(([cat]) => !categoriasCobertas.has(cat))
      .reduce((s, [, v]) => s + v, 0);

    const despesaVariavel = base.despesaVariavelMediaMensal;
    const receita = base.receitaMediaMensal;
    const fatura = faturaDoMes(base, mes);
    const parcelas = base.despesaFixaPorMes[mes] ?? 0;
    const saldo = receita - despesaFixa - despesaManual - despesaCasa - despesaVariavel - fatura;
    saldoProjetado += saldo;
    out.push({ mes, mesLabel: mesLabel(mes), receita, despesaFixa, despesaManual, despesaCasa, despesaVariavel, fatura, parcelas, saldo, saldoProjetado });
  }
  return out;
}
