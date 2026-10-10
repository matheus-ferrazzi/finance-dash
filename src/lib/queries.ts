import { q, qw } from './db';
import { currentMonthSP, normalizeMes, mesLongo, mesLabel, currentDateSP } from './format';
import { detectarAssinaturas, type Assinatura } from './assinaturas';
import { agruparGastos, type GrupoGasto } from './grupos';
import {
  addMonths, chaveParte, computeProjecao, computeRitmo, mesesBaseReceita, receitaAindaAEntrar, receitaRecorrente,
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
            categoria_efetiva(descricao, categoria) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
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
            categoria_efetiva(descricao, categoria) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
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
            categoria_efetiva(descricao, categoria) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
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
              valor::float8 AS valor, categoria_efetiva(descricao, categoria) AS categoria, COALESCE(banco,'—') AS banco,
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

export async function getBusca(resp: Resp, termo: string): Promise<Lanc[]> {
  const r = rf(resp, 2);
  const rows = await q<any>(
    `SELECT id_transacao AS id, to_char(data_lancamento,'YYYY-MM-DD') AS data, valor, descricao,
            categoria_efetiva(descricao, categoria) AS categoria, COALESCE(banco,'—') AS banco, responsavel, classe
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
              descricao, valor, data_lancamento, categoria_efetiva(descricao, categoria) AS categoria,
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
    // "3/4" = parcela 3 de 4. Exige atual <= total pra não ler data como parcela
    // ("05/09" viraria "parcela 5 de 9"), e o total tem que ser > 1.
    const m = String(x.proxima_desc ?? '').match(/(?:^|\s)(\d{1,2})\s*\/\s*(\d{1,2})(?:\s|$)/);
    const pAtual = m ? Number(m[1]) : null;
    const pTotal = m ? Number(m[2]) : null;
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
  receitasAReceber: ReceitaPrevista[];
  proximosMeses: { mesLabel: string; saldo: number; saldoProjetado: number }[];
}

/**
 * Resumo da previsão num formato pronto pra consumo (site e bots do Telegram).
 * Os bots chamam isto via HTTP em vez de reimplementar a conta em SQL — assim
 * não existe uma segunda versão da lógica pra desandar em relação ao site.
 */
export async function getPrevisaoResumo(resp: Resp): Promise<PrevisaoResumo> {
  const base = await getProjecaoBase(resp);
  const proj = computeProjecao(base, 6);
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
    receitasAReceber: base.mesCorrente.receitasAReceber,
    proximosMeses: proj.slice(1).map((m) => ({
      mesLabel: m.mesLabel, saldo: m.saldo, saldoProjetado: m.saldoProjetado,
    })),
  };
}

export async function getProjecaoBase(resp: Resp, hoje: string = currentDateSP()): Promise<ProjecaoBase> {
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
       SELECT categoria_efetiva(descricao, categoria) AS categoria,
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
     WHERE l.classe = 'despesa' AND l.forma_pagamento = 'Crédito'
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

  const compromissosManuais = await getCompromissosManuais(resp);
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
           AND ${SEM_ESPELHO}${rmc.sql}) AS variavel_gasto,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='despesa' AND l.forma_pagamento='Débito'
           AND l.data_lancamento > sp.hoje AND l.data_lancamento < lim.fim AND l.criado_em::date <= sp.hoje
           AND NOT (l.categoria = ANY($${rmc.p.length + 1}::text[]))
           AND ${SEM_ESPELHO}${rmc.sql}) AS agendado_restante,
       (SELECT COALESCE(SUM(l.valor),0) FROM financas_lancamentos l, lim, sp
         WHERE l.classe='pagamento_fatura' AND l.forma_pagamento='Débito'
           AND l.data_lancamento >= lim.ini AND l.data_lancamento <= sp.hoje
           AND ${SEM_ESPELHO}${rmc.sql}) AS fatura_ja_paga`,
    [...rmc.p, CASA_CATS, hoje],
  );

  const rcm = rf(resp, 2);
  const hcm = `$${rcm.p.length + 2}::date`;
  const casaMesRows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria) AS categoria, ROUND(SUM(valor),2) AS total
     FROM financas_lancamentos
     WHERE classe='despesa' AND categoria = ANY($1::text[])
       AND data_lancamento >= date_trunc('month',${hcm})
       AND data_lancamento <  date_trunc('month',${hcm}) + interval '1 month'
       AND (data_lancamento <= ${hcm} OR criado_em::date <= ${hcm})${rcm.sql}
     GROUP BY 1`,
    [CASA_CATS, ...rcm.p, hoje],
  );
  const casaNoMesPorCategoria: Record<string, number> = {};
  casaMesRows.forEach((x) => { casaNoMesPorCategoria[x.categoria] = Number(x.total); });

  return {
    patrimonioAtual,
    saldoContasAtual,
    saldoContas,
    mesCorrente: {
      recebidoPorFonte,
      receitaAgendada: Number(mesRows[0]?.receita_agendada ?? 0),
      receitasAReceber,
      variavelJaGasto: Number(mesRows[0]?.variavel_gasto ?? 0),
      agendadoRestante: Number(mesRows[0]?.agendado_restante ?? 0),
      faturaJaPaga: Number(mesRows[0]?.fatura_ja_paga ?? 0),
      casaNoMesPorCategoria,
    },
    fontesReceita,
    despesaVariavelMediaMensal: Number(varRows[0]?.media ?? 0),
    creditoNovoMedio: Number(creditoRows[0]?.media ?? 0),
    despesaCasaPorCategoria,
    creditoPorVencimento,
    faturaReal,
    compromissosManuais,
  };
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
  saldoProjetadoFim: number;
}

export async function getDiagnostico(resp: Resp): Promise<Diagnostico> {
  // mês de referência = último mês COMPLETO (o atual ainda está correndo)
  const anchor = currentMonthSP();
  const mesRef = addMonths(anchor, -1);

  const r1 = rf(resp, 2);
  const catRows = await q<any>(
    `SELECT categoria_efetiva(descricao, categoria) AS categoria, ROUND(SUM(valor),2) AS total
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
    `SELECT categoria_efetiva(descricao, categoria) AS categoria,
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
       AND categoria_vaga(categoria_efetiva(descricao, categoria))
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
    saldoProjetadoFim: proj[0]?.saldoProjetado ?? 0,
  };
}
