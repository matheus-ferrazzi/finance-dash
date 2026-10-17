import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). A bolinha de sincronização do painel.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('bolinha de sincronização (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_sync (banco, responsavel, last_sync) VALUES
      ('Itaú', 'Matheus', now() - interval '3 hours'), ('Inter', 'Matheus', now() - interval '80 hours'), ('Neon', 'Ariane', NULL)`);
    await pool.query(`INSERT INTO pluggy_contas (account_id, item_id, banco, responsavel, forma, ativo) VALUES
      ('a1', 'i1', 'Itaú', 'Matheus', 'Débito', true),
      ('a2', 'i2', 'Inter', 'Matheus', 'Débito', false), ('a3', 'i2', 'Inter', 'Matheus', 'Crédito', false),
      ('a4', 'i3', 'Neon', 'Ariane', 'Crédito', true)`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('17/10: conexão com todas as contas desligadas não pinta a bolinha; nunca sincronizou segue vermelha', async () => {
    const s = await queries.getSyncStatus();
    expect(s.conns.map((c) => c.banco)).toEqual(['Neon', 'Itaú']);
    expect(s.oldestH).toBe(queries.NUNCA_SINCRONIZOU);
  });
});
