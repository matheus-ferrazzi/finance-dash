import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('resumos do D (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');

  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('gasto por categoria num intervalo [inicio, fimExcl): o dia final fica fora; só despesa', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, banco, responsavel) VALUES
      ('rs1', '2042-03-02', 100, 'MERCADO', 'Groceries', 'despesa', 'B', 'X'),
      ('rs2', '2042-03-08', 50, 'MERCADO', 'Groceries', 'despesa', 'B', 'Y'),
      ('rs3', '2042-03-09', 999, 'MERCADO', 'Groceries', 'despesa', 'B', 'X'),
      ('rs4', '2042-03-03', 30, 'IFOOD', 'Food delivery', 'despesa', 'B', 'X'),
      ('rs5', '2042-03-04', 700, 'SALARIO', 'Salary', 'receita', 'B', 'X')`);
    const m = await queries.getGastoPorCategoriaEntre('2042-03-02', '2042-03-09');
    expect(Object.fromEntries(m)).toEqual({ Groceries: 150, 'Food delivery': 30 });
  });
});
