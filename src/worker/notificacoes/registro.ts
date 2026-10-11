import type { Pool } from 'pg';
import type { LinhaNotif, RegistroNotif } from './motor';
import type { Bot } from './textos';

/** financas_notificacoes: log de tudo o que os bots mandaram (ou mandariam) e o estado de cada um. */
export class PgRegistroNotif implements RegistroNotif {
  constructor(private readonly pool: Pool) {}

  async ultimoEstado(bot: Bot): Promise<unknown | null> {
    const r = await this.pool.query(
      `SELECT estado FROM financas_notificacoes WHERE bot = $1 AND estado IS NOT NULL ORDER BY id DESC LIMIT 1`,
      [bot],
    );
    return r.rows[0]?.estado ?? null;
  }

  async gravar(l: LinhaNotif): Promise<void> {
    await this.pool.query(
      `INSERT INTO financas_notificacoes (bot, modo, texto, enviado, erro, estado) VALUES ($1, $2, $3, $4, $5, $6)`,
      [l.bot, l.modo, l.texto, l.enviado, l.erro, l.estado === null ? null : JSON.stringify(l.estado)],
    );
  }
}
