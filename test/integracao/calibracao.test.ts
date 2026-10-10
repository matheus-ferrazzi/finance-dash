import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getCalibracao (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('sem histórico suficiente: null (a tela segue sem faixa)', async () => {
    expect(await queries.getCalibracao('2030-06-15')).toBeNull();
  });

  it('com 12 meses de histórico no regime: p10 ≤ p90 e n = 12; segunda chamada no mesmo dia vem do cache', async () => {
    const vals: string[] = [];
    for (let i = 0; i < 18; i++) {
      const d = new Date(Date.UTC(2031, i, 5)).toISOString().slice(0, 10);
      vals.push(`('cr-${i}', '${d}', ${3000 + (i % 3) * 100}, 'salario', 'Salary', 'Débito', 'X', 'Matheus', 'receita', 'Entrada', '${d}')`);
      vals.push(`('cd-${i}', '${d}', ${1000 + (i % 4) * 150}, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '${d}')`);
    }
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES ${vals.join(',')}`);
    const c = await queries.getCalibracao('2032-06-15');
    expect(c).not.toBeNull();
    expect(c!.n).toBe(12);
    expect(c!.p10).toBeLessThanOrEqual(c!.p90);
    expect(await queries.getCalibracao('2032-06-15')).toBe(c); // mesmo objeto: cache
  });
});
