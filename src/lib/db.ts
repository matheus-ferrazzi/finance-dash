import { Pool } from 'pg';

// Pool único reaproveitado entre requests (Server Components).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    host: process.env.DB_HOST ?? 'postgres-hub',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'personal_hub_db',
    user: process.env.DB_USER ?? 'bot_readonly',
    password: process.env.DB_PASSWORD ?? '',
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

/** Filtro de responsável: 'casal' = sem filtro; 'Matheus'/'Ariane' = filtra. */
export function respClause(resp: string, start = 1): { sql: string; params: string[] } {
  if (resp === 'Matheus' || resp === 'Ariane') {
    return { sql: ` AND responsavel = $${start}`, params: [resp] };
  }
  return { sql: '', params: [] };
}
