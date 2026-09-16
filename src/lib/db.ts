import { Pool } from 'pg';

// Pool único reaproveitado entre requests (Server Components).
const globalForPg = globalThis as unknown as { pgPool?: Pool; pgWriterPool?: Pool };

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

/**
 * Pool separado com um usuário de escrita (dash_writer) que só tem
 * GRANT em financas_compromissos — nenhuma outra tabela é gravável pelo app.
 */
export const writerPool =
  globalForPg.pgWriterPool ??
  new Pool({
    host: process.env.DB_HOST ?? 'postgres-hub',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'personal_hub_db',
    user: process.env.DB_WRITER_USER ?? 'dash_writer',
    password: process.env.DB_WRITER_PASSWORD ?? '',
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
  });

if (process.env.NODE_ENV !== 'production') globalForPg.pgWriterPool = writerPool;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function qw<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await writerPool.query(text, params);
  return res.rows as T[];
}
