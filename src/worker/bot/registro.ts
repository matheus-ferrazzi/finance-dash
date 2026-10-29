import type { Pool } from 'pg';

export interface LinhaBot {
  pessoa: string; pergunta: string; ferramentas: { nome: string; args: unknown; ok: boolean }[];
  resposta: string | null; modelo: string | null; ms: number; trava: boolean; semFerramenta: boolean; erro: string | null;
  /** 27/10: tokens do Groq na pergunta (migração 016) */
  tokens: number;
  /** 28/10: ms esperando a cota do Groq (migração 017) */
  esperaMs: number;
  /** 28/10: veredito do conferente (migração 018) */
  conferencia: 'aprovada' | 'reescrita' | 'segura' | null; problemas: string[]; tokensConferente: number;
}

/** financas_bot_conversas: perguntas que passaram pelo filtro (grupo, membro, chamado) e o que o bot respondeu. */
export class PgRegistroBot {
  constructor(private readonly pool: Pool) {}

  async gravar(l: LinhaBot): Promise<void> {
    await this.pool.query(
      `INSERT INTO financas_bot_conversas (pessoa, pergunta, ferramentas, resposta, modelo, ms, trava, sem_ferramenta, erro, tokens, espera_ms, conferencia, problemas, tokens_conferente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [l.pessoa, l.pergunta, JSON.stringify(l.ferramentas), l.resposta, l.modelo, l.ms, l.trava, l.semFerramenta, l.erro, l.tokens, l.esperaMs, l.conferencia, JSON.stringify(l.problemas ?? []), l.tokensConferente ?? 0],
    );
  }

  /** Últimas `n` trocas respondidas dos últimos `minutos`, da mais antiga para a mais nova. */
  async contexto(minutos: number, n: number): Promise<{ pessoa: string; pergunta: string; resposta: string }[]> {
    const r = await this.pool.query(
      `SELECT pessoa, pergunta, resposta FROM financas_bot_conversas
       WHERE resposta IS NOT NULL AND erro IS NULL AND criado_em > now() - make_interval(mins => $1)
       ORDER BY id DESC LIMIT $2`, [minutos, n]);
    return r.rows.reverse().map((x) => ({ pessoa: x.pessoa, pergunta: x.pergunta, resposta: x.resposta }));
  }

  async falhas24h(): Promise<number> {
    const r = await this.pool.query(`SELECT count(*)::int AS n FROM financas_bot_conversas WHERE erro IS NOT NULL AND criado_em > now() - interval '24 hours'`);
    return r.rows[0].n;
  }

  async limpar(dias: number): Promise<number> {
    const r = await this.pool.query(`DELETE FROM financas_bot_conversas WHERE criado_em < now() - make_interval(days => $1)`, [dias]);
    return r.rowCount ?? 0;
  }
}
