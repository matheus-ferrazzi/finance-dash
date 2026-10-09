import type { Pool } from 'pg';
import type { LinhaBanco } from './reconciliar';
import type {
  Conta, Execucao, FaturaAtual, FaturaHistorico, Investimento, Lancamento, PluggyItem, PluggyTransacao, Saldo,
} from './tipos';

export interface Repo {
  contasAtivas(): Promise<Conta[]>;
  /** Todas as contas registradas, ativas ou não. */
  idsRegistrados(): Promise<Set<string>>;
  definirItemDaConta(accountId: string, itemId: string): Promise<void>;
  inserirConta(c: Conta, tipoPluggy: string): Promise<void>;
  lancamentosDaConta(c: Conta, desde: string): Promise<Map<string, LinhaBanco>>;
  gravarCruas(txs: readonly PluggyTransacao[]): Promise<void>;
  aplicarConta(linhas: readonly Lancamento[], remover: readonly string[]): Promise<void>;
  upsertFatura(f: FaturaAtual): Promise<void>;
  upsertFaturasHistorico(h: readonly FaturaHistorico[]): Promise<void>;
  upsertSaldo(s: Saldo): Promise<void>;
  upsertInvestimento(i: Investimento): Promise<void>;
  upsertItem(itemId: string, banco: string, responsavel: string, item: PluggyItem): Promise<void>;
  registrarSync(banco: string, responsavel: string, lastSync: string): Promise<void>;
  registrarExecucao(e: Execucao): Promise<void>;
}

const COLUNAS_LINHA = `id_transacao text, data_lancamento date, valor numeric, tipo_movimento text, classe text,
  descricao text, categoria text, forma_pagamento text, banco text, responsavel text, status_pluggy text,
  account_id text, parcela_numero int, parcela_total int, data_compra date, fatura_id text, fatura_prevista text,
  contraparte_nome text, contraparte_doc text, loja_cnpj text, loja_cnae text, categoria_id text,
  tipo_operacao text, transferencia_casal boolean`;
const NOMES_LINHA = COLUNAS_LINHA.split(',').map((c) => c.trim().split(/\s+/)[0]);

export class PgRepo implements Repo {
  constructor(private readonly pool: Pool) {}

  async contasAtivas(): Promise<Conta[]> {
    const r = await this.pool.query(
      `SELECT account_id, item_id, banco, responsavel, forma, coleta_transacoes, coleta_saldo, coleta_faturas, coleta_investimentos
         FROM pluggy_contas WHERE ativo ORDER BY banco, responsavel, forma`,
    );
    return r.rows;
  }

  async idsRegistrados(): Promise<Set<string>> {
    const r = await this.pool.query<{ account_id: string }>(`SELECT account_id FROM pluggy_contas`);
    return new Set(r.rows.map((x) => x.account_id));
  }

  async definirItemDaConta(accountId: string, itemId: string) {
    await this.pool.query(`UPDATE pluggy_contas SET item_id = $2 WHERE account_id = $1`, [accountId, itemId]);
  }

  /** Conta descoberta entra DESLIGADA: muda saldo e previsão, então quem liga é o Matheus. */
  async inserirConta(c: Conta, tipoPluggy: string) {
    await this.pool.query(
      `INSERT INTO pluggy_contas (account_id, item_id, banco, responsavel, forma, tipo_pluggy,
         coleta_transacoes, coleta_saldo, coleta_faturas, coleta_investimentos, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, false) ON CONFLICT (account_id) DO NOTHING`,
      [c.account_id, c.item_id, c.banco, c.responsavel, c.forma, tipoPluggy,
        c.coleta_transacoes, c.coleta_saldo, c.coleta_faturas, c.coleta_investimentos],
    );
  }

  async lancamentosDaConta(c: Conta, desde: string): Promise<Map<string, LinhaBanco>> {
    // linha antiga (antes do C1) não tem account_id: banco + responsavel + forma identificam a conta
    const r = await this.pool.query<LinhaBanco>(
      `SELECT id_transacao, to_char(data_lancamento, 'YYYY-MM-DD') AS data_lancamento, valor::float8 AS valor,
              tipo_movimento, classe, descricao, categoria, forma_pagamento, banco, responsavel, status_pluggy
         FROM financas_lancamentos
        WHERE data_lancamento >= $1::date
          AND (account_id = $2 OR (account_id IS NULL AND banco = $3 AND responsavel = $4 AND forma_pagamento = $5))`,
      [desde, c.account_id, c.banco, c.responsavel, c.forma],
    );
    return new Map(r.rows.map((x) => [x.id_transacao, x]));
  }

  async gravarCruas(txs: readonly PluggyTransacao[]) {
    if (txs.length === 0) return;
    await this.pool.query(
      `INSERT INTO pluggy_transacoes (id, account_id, raw)
       SELECT x->>'id', x->>'accountId', x FROM jsonb_array_elements($1::jsonb) AS x
       ON CONFLICT (id) DO UPDATE SET raw = EXCLUDED.raw, account_id = EXCLUDED.account_id,
         ultima_vez = now(), removida_em = NULL`,
      [JSON.stringify(txs)],
    );
  }

  async aplicarConta(linhas: readonly Lancamento[], remover: readonly string[]) {
    const cli = await this.pool.connect();
    try {
      await cli.query('BEGIN');
      if (linhas.length) {
        const atualiza = NOMES_LINHA.filter((n) => n !== 'id_transacao').map((n) => `${n} = EXCLUDED.${n}`).join(', ');
        await cli.query(
          `INSERT INTO financas_lancamentos (${NOMES_LINHA.join(', ')}, visto_pluggy_em)
           SELECT ${NOMES_LINHA.map((n) => `r.${n}`).join(', ')}, now()
             FROM jsonb_to_recordset($1::jsonb) AS r(${COLUNAS_LINHA})
           ON CONFLICT (id_transacao) DO UPDATE SET ${atualiza}, visto_pluggy_em = now()`,
          [JSON.stringify(linhas)],
        );
      }
      if (remover.length) {
        await cli.query(
          `INSERT INTO financas_lancamentos_removidos (id_transacao, dados, motivo)
           SELECT l.id_transacao, to_jsonb(l), 'sumiu_da_pluggy' FROM financas_lancamentos l WHERE l.id_transacao = ANY($1::text[])`,
          [remover],
        );
        await cli.query(`DELETE FROM financas_lancamentos WHERE id_transacao = ANY($1::text[])`, [remover]);
        await cli.query(`UPDATE pluggy_transacoes SET removida_em = now() WHERE id = ANY($1::text[])`, [remover]);
      }
      await cli.query('COMMIT');
    } catch (e) {
      await cli.query('ROLLBACK');
      throw e;
    } finally {
      cli.release();
    }
  }

  async upsertFatura(f: FaturaAtual) {
    await this.pool.query(
      `INSERT INTO financas_faturas (id_conta, banco, responsavel, limite_total, limite_disponivel, valor_fatura_atual,
         data_fechamento, data_vencimento, pagamento_minimo, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id_conta) DO UPDATE SET banco = EXCLUDED.banco, responsavel = EXCLUDED.responsavel,
         limite_total = EXCLUDED.limite_total, limite_disponivel = EXCLUDED.limite_disponivel,
         valor_fatura_atual = EXCLUDED.valor_fatura_atual, data_fechamento = EXCLUDED.data_fechamento,
         data_vencimento = EXCLUDED.data_vencimento, pagamento_minimo = EXCLUDED.pagamento_minimo,
         atualizado_em = EXCLUDED.atualizado_em`,
      [f.id_conta, f.banco, f.responsavel, f.limite_total, f.limite_disponivel, f.valor_fatura_atual,
        f.data_fechamento, f.data_vencimento, f.pagamento_minimo, f.atualizado_em],
    );
  }

  async upsertFaturasHistorico(h: readonly FaturaHistorico[]) {
    if (h.length === 0) return;
    await this.pool.query(
      `INSERT INTO financas_faturas_historico (id, account_id, vencimento, total, minimo, encargos, pagamentos)
       SELECT r.id, r.account_id, r.vencimento, r.total, r.minimo, r.encargos, r.pagamentos
         FROM jsonb_to_recordset($1::jsonb) AS r(id text, account_id text, vencimento date, total numeric,
              minimo numeric, encargos jsonb, pagamentos jsonb)
       ON CONFLICT (id) DO UPDATE SET vencimento = EXCLUDED.vencimento, total = EXCLUDED.total, minimo = EXCLUDED.minimo,
         encargos = EXCLUDED.encargos, pagamentos = EXCLUDED.pagamentos, atualizado_em = now()`,
      [JSON.stringify(h)],
    );
  }

  async upsertSaldo(s: Saldo) {
    await this.pool.query(
      `INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo, atualizado_pluggy)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id_conta) DO UPDATE SET banco = EXCLUDED.banco, responsavel = EXCLUDED.responsavel,
         tipo = EXCLUDED.tipo, saldo = EXCLUDED.saldo, atualizado_pluggy = EXCLUDED.atualizado_pluggy, atualizado_em = now()`,
      [s.id_conta, s.banco, s.responsavel, s.tipo, s.saldo, s.atualizado_pluggy],
    );
  }

  async upsertInvestimento(i: Investimento) {
    await this.pool.query(
      `INSERT INTO financas_investimentos (id_investimento, item_id, nome, tipo, subtipo, valor_investido, valor_atual,
         lucro_acumulado, quantidade, rentabilidade_anual, data_vencimento, banco, responsavel, status, atualizado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id_investimento) DO UPDATE SET item_id = EXCLUDED.item_id, nome = EXCLUDED.nome, tipo = EXCLUDED.tipo,
         subtipo = EXCLUDED.subtipo, valor_investido = EXCLUDED.valor_investido, valor_atual = EXCLUDED.valor_atual,
         lucro_acumulado = EXCLUDED.lucro_acumulado, quantidade = EXCLUDED.quantidade,
         rentabilidade_anual = EXCLUDED.rentabilidade_anual, data_vencimento = EXCLUDED.data_vencimento,
         banco = EXCLUDED.banco, responsavel = EXCLUDED.responsavel, status = EXCLUDED.status,
         atualizado_em = EXCLUDED.atualizado_em`,
      [i.id_investimento, i.item_id, i.nome, i.tipo, i.subtipo, i.valor_investido, i.valor_atual, i.lucro_acumulado,
        i.quantidade, i.rentabilidade_anual, i.data_vencimento, i.banco, i.responsavel, i.status, i.atualizado_em],
    );
  }

  async upsertItem(itemId: string, banco: string, responsavel: string, it: PluggyItem) {
    await this.pool.query(
      `INSERT INTO pluggy_itens (item_id, banco, responsavel, status, execution_status, last_updated_at,
         next_auto_sync_at, consent_expires_at, checado_em)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (item_id) DO UPDATE SET banco = EXCLUDED.banco, responsavel = EXCLUDED.responsavel,
         status = EXCLUDED.status, execution_status = EXCLUDED.execution_status,
         last_updated_at = EXCLUDED.last_updated_at, next_auto_sync_at = EXCLUDED.next_auto_sync_at,
         consent_expires_at = EXCLUDED.consent_expires_at, checado_em = now()`,
      [itemId, banco, responsavel, it.status ?? null, it.executionStatus ?? null, it.lastUpdatedAt ?? null,
        it.nextAutoSyncAt ?? null, it.consentExpiresAt ?? null],
    );
  }

  /** Mesma semântica do sync_pluggy.sh: log só quando o lastUpdatedAt muda. */
  async registrarSync(banco: string, responsavel: string, lastSync: string) {
    await this.pool.query(
      `INSERT INTO financas_sync_log (banco, responsavel, last_sync)
       SELECT $1::varchar, $2::varchar, $3::timestamptz
        WHERE $3::timestamptz IS DISTINCT FROM
              (SELECT last_sync FROM financas_sync WHERE banco = $1::varchar AND responsavel = $2::varchar)`,
      [banco, responsavel, lastSync],
    );
    await this.pool.query(
      `INSERT INTO financas_sync (banco, responsavel, last_sync, checked_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (banco, responsavel) DO UPDATE SET last_sync = EXCLUDED.last_sync, checked_at = now()`,
      [banco, responsavel, lastSync],
    );
  }

  async registrarExecucao(e: Execucao) {
    await this.pool.query(
      `INSERT INTO pluggy_execucoes (tarefa, modo, inicio, fim, ok, contagens, erro) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [e.tarefa, e.modo, e.inicio, e.fim, e.ok, JSON.stringify(e.contagens), e.erro],
    );
  }
}
