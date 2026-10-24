import type { RegraPainel } from '../lib/categoriaPainel';
import type { Pool } from 'pg';
import type { LinhaBanco } from './reconciliar';
import type {
  Conta, Execucao, FaturaAtual, FaturaHistorico, Investimento, Lancamento, Modo, PluggyItem, PluggyTransacao, Saldo,
} from './tipos';
import type { NomeTarefa } from './tarefas';

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
  /** 17/10: títulos do Tesouro com quantidade, de banco/pessoa sem nenhuma conta ativa (conexão desligada) */
  titulosSemConexao(): Promise<{ id_investimento: string; nome: string; quantidade: number; banco: string; responsavel: string }[]>;
  atualizarValorTitulo(idInvestimento: string, valor: number, quando: string): Promise<void>;
  upsertItem(itemId: string, banco: string, responsavel: string, item: PluggyItem): Promise<void>;
  registrarSync(banco: string, responsavel: string, lastSync: string): Promise<void>;
  registrarExecucao(e: Execucao): Promise<void>;
  /** 17/10: início da última execução de cada tarefa no modo dado (repor rodada perdida na subida) */
  ultimasExecucoes(modo: Modo): Promise<Map<NomeTarefa, Date>>;
  /** regras de categoria criadas pelo painel (F4): aplicadas antes de gravar */
  regrasPainel(): Promise<RegraPainel[]>;
  /** N2: entrada "receita" que é a outra ponta de uma transferência interna do casal → transferência. Devolve quantas. */
  parearTransferencias(desde: string): Promise<number>;
}

const COLUNAS_LINHA = `id_transacao text, data_lancamento date, valor numeric, tipo_movimento text, classe text,
  descricao text, categoria text, forma_pagamento text, banco text, responsavel text, status_pluggy text,
  account_id text, parcela_numero int, parcela_total int, data_compra date, fatura_id text, fatura_prevista text,
  contraparte_nome text, contraparte_doc text, loja_cnpj text, loja_cnae text, categoria_id text,
  tipo_operacao text, transferencia_casal boolean, categoria_banco text`;
const NOMES_LINHA = COLUNAS_LINHA.split(',').map((c) => c.trim().split(/\s+/)[0]);

/** N8 (23/10): categorias que não dizem o que foi — uma nova sincronização com elas não apaga a categoria específica */
const CATS_VAGAS = ['Transfers', 'Transfer - PIX', 'Transfer - Bank Slip', 'Outros', 'Others'].map((c) => `'${c}'`).join(', ');

export class PgRepo implements Repo {
  constructor(private readonly pool: Pool) {}

  async regrasPainel(): Promise<RegraPainel[]> {
    const r = await this.pool.query(`SELECT id, tipo, chave, categoria FROM financas_categoria_painel`);
    return r.rows.map((x) => ({ id: Number(x.id), tipo: x.tipo, chave: x.chave, categoria: x.categoria }));
  }

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
    // classe pareada (N2) volta "crua" ('receita', como a Pluggy manda): a comparação da sombra é contra o
    // que montarLinha produz, e o par não é diferença da ingestão
    const r = await this.pool.query<LinhaBanco>(
      `SELECT id_transacao, to_char(data_lancamento, 'YYYY-MM-DD') AS data_lancamento, valor::float8 AS valor,
              tipo_movimento, CASE WHEN par_transferencia IS NOT NULL THEN (CASE WHEN tipo_movimento = 'Saída' THEN 'despesa' ELSE 'receita' END) ELSE classe END AS classe,
              descricao, categoria, forma_pagamento, banco, responsavel, status_pluggy
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
        // N2: linha pareada como transferência interna continua transferência quando a Pluggy reenvia "receita"
        const atualiza = NOMES_LINHA.filter((n) => n !== 'id_transacao')
          .map((n) => (n === 'classe'
            // L4 (22/10): vale também para a saída pareada que a Pluggy reenvia como "despesa"
            ? `classe = CASE WHEN financas_lancamentos.par_transferencia IS NOT NULL AND EXCLUDED.classe IN ('receita', 'despesa') THEN financas_lancamentos.classe ELSE EXCLUDED.classe END`
            // N8 (23/10): a Pluggy às vezes rebaixa a categoria numa nova sincronização (delivery virou "Transfers"):
            // categoria vaga não troca uma específica já gravada; outra específica troca normalmente
            : n === 'categoria'
              ? `categoria = CASE WHEN EXCLUDED.categoria IN (${CATS_VAGAS}) AND financas_lancamentos.categoria IS NOT NULL
                   AND financas_lancamentos.categoria NOT IN (${CATS_VAGAS}) THEN financas_lancamentos.categoria ELSE EXCLUDED.categoria END`
              : `${n} = EXCLUDED.${n}`))
          .join(', ');
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

  async titulosSemConexao() {
    const r = await this.pool.query(
      `SELECT id_investimento, nome, quantidade::float8 AS quantidade, banco, responsavel FROM financas_investimentos i
        WHERE subtipo = 'TREASURY' AND quantidade > 0 AND COALESCE(status, '') <> 'TOTAL_WITHDRAWAL'
          AND NOT EXISTS (SELECT 1 FROM pluggy_contas c WHERE c.banco = i.banco AND c.responsavel = i.responsavel AND c.ativo)
        ORDER BY banco, responsavel, nome`,
    );
    return r.rows.map((x) => ({ ...x, quantidade: Number(x.quantidade) }));
  }

  async atualizarValorTitulo(idInvestimento: string, valor: number, quando: string) {
    await this.pool.query(`UPDATE financas_investimentos SET valor_atual = $2, atualizado_em = $3 WHERE id_investimento = $1`, [idInvestimento, valor, quando]);
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
  async parearTransferencias(desde: string): Promise<number> {
    // candidatos: entrada "receita" no débito × saída interna de OUTRA conta do casal, mesmo valor, ±1 dia.
    // 1:1 — cada entrada fica com a saída mais próxima, e cada saída com a entrada mais próxima; só o par
    // que é o primeiro dos dois lados é gravado (empate de valor no mesmo dia não casa duas vezes).
    const r = await this.pool.query(
      `WITH c AS (
         SELECT e.id_transacao AS eid, s.id_transacao AS sid, abs(e.data_lancamento - s.data_lancamento) AS d
           FROM financas_lancamentos e
           JOIN financas_lancamentos s
             ON s.classe = 'transferencia_interna' AND s.tipo_movimento = 'Saída' AND s.forma_pagamento = 'Débito'
            AND abs(s.valor - e.valor) < 0.005 AND abs(e.data_lancamento - s.data_lancamento) <= 1
            AND COALESCE(s.account_id, s.banco || '/' || s.responsavel) <> COALESCE(e.account_id, e.banco || '/' || e.responsavel)
            AND NOT EXISTS (SELECT 1 FROM financas_lancamentos u WHERE u.par_transferencia = s.id_transacao)
          WHERE e.classe = 'receita' AND e.tipo_movimento = 'Entrada' AND e.forma_pagamento = 'Débito'
            AND e.par_transferencia IS NULL AND e.data_lancamento >= $1::date
       ), r AS (
         SELECT eid, sid, row_number() OVER (PARTITION BY eid ORDER BY d, sid) AS re,
                row_number() OVER (PARTITION BY sid ORDER BY d, eid) AS rs FROM c
       )
       UPDATE financas_lancamentos l SET classe = 'transferencia_interna', par_transferencia = r.sid
         FROM r WHERE r.re = 1 AND r.rs = 1 AND l.id_transacao = r.eid`,
      [desde],
    );
    // L4 (22/10): o espelho — saída "despesa" (Pix do dono para ele mesmo em outro banco) × entrada interna de OUTRA
    // conta do casal, mesmo valor, ±1 dia, categoria de transferência E o destinatário é o dono da entrada (o nome
    // dele, da coluna responsavel, está na descrição ou na contraparte). Sem essa última, 2 Pix a terceiros de mesmo
    // valor casariam (medido em 22/10). Mesma regra 1:1.
    const s = await this.pool.query(
      `WITH c AS (
         SELECT s.id_transacao AS sid, e.id_transacao AS eid, abs(e.data_lancamento - s.data_lancamento) AS d
           FROM financas_lancamentos s
           JOIN financas_lancamentos e
             ON e.classe = 'transferencia_interna' AND e.tipo_movimento = 'Entrada' AND e.forma_pagamento = 'Débito'
            AND abs(s.valor - e.valor) < 0.005 AND abs(e.data_lancamento - s.data_lancamento) <= 1
            AND COALESCE(s.account_id, s.banco || '/' || s.responsavel) <> COALESCE(e.account_id, e.banco || '/' || e.responsavel)
            AND (s.descricao ILIKE '%' || e.responsavel || '%' OR COALESCE(s.contraparte_nome, '') ILIKE '%' || e.responsavel || '%')
            AND NOT EXISTS (SELECT 1 FROM financas_lancamentos u WHERE u.par_transferencia = e.id_transacao)
          WHERE s.classe = 'despesa' AND s.tipo_movimento = 'Saída' AND s.forma_pagamento = 'Débito'
            AND categoria_efetiva(s.descricao, s.categoria, s.contraparte_doc) IN ('Transfers', 'Transfer - PIX', 'Transfer - Bank Slip', 'Same person transfer')
            AND s.par_transferencia IS NULL AND s.data_lancamento >= $1::date
       ), r AS (
         SELECT sid, eid, row_number() OVER (PARTITION BY sid ORDER BY d, eid) AS rs,
                row_number() OVER (PARTITION BY eid ORDER BY d, sid) AS re FROM c
       )
       UPDATE financas_lancamentos l SET classe = 'transferencia_interna', par_transferencia = r.eid
         FROM r WHERE r.rs = 1 AND r.re = 1 AND l.id_transacao = r.sid`,
      [desde],
    );
    return (r.rowCount ?? 0) + (s.rowCount ?? 0);
  }

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

  async ultimasExecucoes(modo: Modo) {
    const r = await this.pool.query(`SELECT tarefa, MAX(inicio) AS inicio FROM pluggy_execucoes WHERE modo = $1 GROUP BY tarefa`, [modo]);
    return new Map(r.rows.map((x) => [x.tarefa as NomeTarefa, new Date(x.inicio)]));
  }
}
