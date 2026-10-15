// De onde cada bot lê (C2): as mesmas consultas dos nós Postgres do n8n (exportados em 11/10/2026) e, para
// o ritmo, o /api/previsao do painel — a conta continua num lugar só (computeRitmo no painel).
import type { Pool } from 'pg';
import type { Fontes } from './motor';

type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status?: number; json: () => Promise<any> }>;

const SQL_FATURA = `SELECT COALESCE(json_agg(f ORDER BY f.dias), '[]') AS faturas FROM (
  SELECT COALESCE(banco,'Cartão') AS banco, COALESCE(responsavel,'—') AS responsavel,
         valor_fatura_atual AS valor, to_char(data_vencimento,'DD/MM') AS venc,
         to_char(data_vencimento,'YYYY-MM-DD') AS venc_iso,
         (data_vencimento - (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias
  FROM financas_faturas
  WHERE valor_fatura_atual > 0 AND data_vencimento IS NOT NULL
    AND (data_vencimento - (now() AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN 0 AND 3
) f`;

const SQL_GASTO = `SELECT COALESCE(json_agg(t ORDER BY t.criado_em),'[]') AS txs FROM (
  SELECT id_transacao,
         to_char(criado_em,'YYYY-MM-DD"T"HH24:MI:SS') AS criado_em,
         valor, COALESCE(descricao,'(sem descrição)') AS descricao,
         COALESCE(banco,'—') AS banco, COALESCE(responsavel,'—') AS responsavel,
         to_char(data_lancamento,'DD/MM') AS data
  FROM financas_lancamentos
  WHERE classe='despesa' AND valor >= 500
    AND criado_em >= NOW() - interval '3 days'
    AND data_lancamento <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
) t`;

const SQL_SAUDE = `SELECT json_build_object(
  'h_lancamentos', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(criado_em)))/3600,1) FROM financas_lancamentos),
  'h_investimentos', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(atualizado_em)))/3600,1) FROM financas_investimentos),
  'h_faturas', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(atualizado_em)))/3600,1) FROM financas_faturas),
  'h_worker_ok', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(fim)))/3600,1) FROM pluggy_execucoes WHERE tarefa='transacoes' AND modo='real' AND ok),
  'worker_falhas_24h', (SELECT COUNT(*) FROM pluggy_execucoes WHERE modo='real' AND NOT ok AND inicio > NOW() - INTERVAL '24 hours'),
  'ultimo_lancamento', (SELECT TO_CHAR(MAX(data_lancamento),'DD/MM/YYYY') FROM financas_lancamentos WHERE status_pluggy='POSTED')
) AS saude`;

const SQL_BACKUP = `SELECT json_build_object(
  'h_desde_ok',      (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(feito_em)))/3600,1) FROM financas_backup WHERE ok),
  'h_desde_n8n',     (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(feito_em)))/3600,1) FROM financas_backup WHERE n8n_ok),
  'n8n_workflows',   (SELECT n8n_workflows FROM financas_backup WHERE n8n_ok ORDER BY feito_em DESC LIMIT 1),
  'h_desde_offsite', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(puxado_em)))/3600,1) FROM financas_backup),
  'tamanho',         (SELECT tamanho_bytes FROM financas_backup WHERE ok ORDER BY feito_em DESC LIMIT 1),
  'tabelas',         (SELECT tabelas FROM financas_backup WHERE ok ORDER BY feito_em DESC LIMIT 1),
  'falhas_24h',      (SELECT COUNT(*) FROM financas_backup WHERE (NOT ok OR n8n_ok = false) AND feito_em > NOW() - interval '24 hours'),
  'ultimo_erro',     (SELECT erro FROM financas_backup WHERE NOT ok AND feito_em > NOW() - interval '36 hours' ORDER BY feito_em DESC LIMIT 1)
) AS st`;

const SQL_CONSENT = `SELECT banco, responsavel,
         -- D-M3: as duas datas em SP (consent_expires_at::date usava o fuso da sessão, UTC: um dia de erro à noite)
         ((consent_expires_at AT TIME ZONE 'America/Sao_Paulo')::date - (now() AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias
  FROM pluggy_itens
  WHERE consent_expires_at IS NOT NULL AND consent_expires_at < now() + interval '30 days'
  ORDER BY consent_expires_at`;

// S2 (auditoria 13/10): o selo do painel mostrava "há 4 dias" (Inter) e nenhum alerta citava a conexão
const SQL_CONEXOES = `SELECT banco, responsavel, ROUND(EXTRACT(EPOCH FROM (now() - last_sync)) / 3600, 1) AS horas
  FROM financas_sync WHERE last_sync < now() - interval '30 hours' ORDER BY last_sync`;

/** `urlPainel`: base interna do painel (rede do Docker); os resumos do D e o ritmo vêm de lá. */
export function criarFontes(
  pool: Pool, urlPainel = 'http://finance-dashboard:3000', fetcher: Fetcher = fetch as unknown as Fetcher,
  /** E1: falhas do bot e modelos da lista que sumiram da Groq (para o aviso técnico) */
  bot?: () => Promise<{ falhas24h: number; modelosSumidos: string[] }>,
  /** auditoria 13/10: token das rotas internas do painel (/api/resumo/*); sem ele, sem cabeçalho */
  tokenInterno?: string,
): Fontes {
  const um = async (sql: string, campo: string) => (await pool.query(sql)).rows[0]?.[campo];
  const painel = async (caminho: string) => {
    const r = await fetcher(`${urlPainel}${caminho}`, { signal: AbortSignal.timeout(30000), headers: tokenInterno ? { 'x-interno': tokenInterno } : {} });
    if (!r.ok) throw new Error(`painel HTTP ${r.status}`);
    return r.json();
  };
  return {
    ritmo: () => painel('/api/previsao'),
    diario: () => painel('/api/resumo/diario'),
    semanal: () => painel('/api/resumo/semanal'),
    mensal: () => painel('/api/resumo/mensal'),
    meta: () => painel('/api/resumo/meta'),
    'alerta-meta': () => painel('/api/resumo/meta'),
    tecnico: async () => ({
      saude: await um(SQL_SAUDE, 'saude'),
      backup: await um(SQL_BACKUP, 'st'),
      consentimentos: (await pool.query(SQL_CONSENT)).rows.map((x) => ({ banco: x.banco, responsavel: x.responsavel, dias: Number(x.dias) })),
      conexoes: (await pool.query(SQL_CONEXOES)).rows.map((x) => ({ banco: x.banco, responsavel: x.responsavel, horas: Number(x.horas) })),
      // checar o bot nunca derruba o aviso técnico
      bot: bot ? await bot().catch(() => ({ falhas24h: 0, modelosSumidos: [] })) : undefined,
    }),
    fatura: () => um(SQL_FATURA, 'faturas'),
    gasto: () => um(SQL_GASTO, 'txs'),
    saude: () => um(SQL_SAUDE, 'saude'),
    backup: () => um(SQL_BACKUP, 'st'),
  };
}
