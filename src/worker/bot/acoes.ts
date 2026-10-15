// E2: propostas do bot. Quem confirma é o código (UPDATE condicional = um "sim" vale uma vez só).
import type { Pool } from 'pg';

const JANELA = "interval '5 minutes'";

export class PgAcoes {
  constructor(private readonly pool: Pool) {}

  /** Nova proposta; a pendente anterior da mesma pessoa vira 'substituida'. */
  async criar(pessoa: string, tipo: 'categoria' | 'avulsa' | 'dinheiro', params: object, resumo: string): Promise<number> {
    await this.pool.query(`UPDATE financas_bot_acoes SET estado = 'substituida', atualizado_em = now() WHERE pessoa = $1 AND estado = 'pendente'`, [pessoa]);
    const r = await this.pool.query(
      `INSERT INTO financas_bot_acoes (pessoa, tipo, params, resumo) VALUES ($1, $2, $3, $4) RETURNING id`,
      [pessoa, tipo, JSON.stringify(params), resumo]);
    return Number(r.rows[0].id);
  }

  /**
   * E2-M4: limpeza diária — pendente com mais de 5 min vira 'expirada' (ninguém mais pode confirmar) e
   * registro com mais de 1 ano sai (retenção da spec do E2).
   */
  async limpar(): Promise<{ expiradas: number; apagadas: number }> {
    const e = await this.pool.query(`UPDATE financas_bot_acoes SET estado = 'expirada', atualizado_em = now()
      WHERE estado = 'pendente' AND criado_em <= now() - ${JANELA}`);
    const a = await this.pool.query(`DELETE FROM financas_bot_acoes WHERE criado_em < now() - interval '1 year'`);
    return { expiradas: e.rowCount ?? 0, apagadas: a.rowCount ?? 0 };
  }

  /** A proposta pendente mais recente da pessoa nos últimos 30 min; `expirada` se passou de 5 min. */
  async pendente(pessoa: string) {
    const r = await this.pool.query(
      `SELECT id, tipo, params, resumo, criado_em <= now() - ${JANELA} AS expirada FROM financas_bot_acoes
       WHERE pessoa = $1 AND estado = 'pendente' AND criado_em > now() - interval '30 minutes' ORDER BY id DESC LIMIT 1`, [pessoa]);
    const x = r.rows[0];
    if (!x) return null;
    if (x.expirada) await this.pool.query(`UPDATE financas_bot_acoes SET estado = 'expirada', atualizado_em = now() WHERE id = $1`, [x.id]);
    return { id: Number(x.id), tipo: x.tipo, params: x.params, resumo: x.resumo, expirada: x.expirada as boolean };
  }

  async confirmar(id: number): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE financas_bot_acoes SET estado = 'confirmada', atualizado_em = now()
       WHERE id = $1 AND estado = 'pendente' AND criado_em > now() - ${JANELA} RETURNING id`, [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async cancelar(id: number): Promise<void> {
    await this.pool.query(`UPDATE financas_bot_acoes SET estado = 'cancelada', atualizado_em = now() WHERE id = $1 AND estado = 'pendente'`, [id]);
  }

  async ultimaFeita(pessoa: string) {
    const r = await this.pool.query(
      `SELECT id, resumo, tipo FROM financas_bot_acoes WHERE pessoa = $1 AND estado = 'feita' AND atualizado_em > now() - interval '24 hours'
       ORDER BY atualizado_em DESC LIMIT 1`, [pessoa]);
    return r.rows[0] ? { id: Number(r.rows[0].id), resumo: r.rows[0].resumo, tipo: r.rows[0].tipo } : null;
  }
}
