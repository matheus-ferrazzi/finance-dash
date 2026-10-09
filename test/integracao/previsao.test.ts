import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Ver README, seção do worker.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getProjecaoBase com hoje no passado (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');

  beforeAll(async () => {
    const u = new URL(url!);
    // o painel lê a conexão das variáveis de ambiente na importação
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password,
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
  });

  it('não enxerga lançamento posterior a hoje como já gasto nem como agendado no mês', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('jul', '2026-07-10', 100, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída'),
             ('set', '2026-09-10', 999, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída'),
             ('ago', '2026-08-20', 50, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída')`);
    const base = await queries.getProjecaoBase('casal', '2026-08-15');
    // em 15/08: o de 20/08 é "agendado no resto do mês"; o de setembro não existe para essa data
    expect(base.mesCorrente.variavelJaGasto).toBe(0);
    expect(base.mesCorrente.agendadoRestante).toBe(50);
    const cedo = await queries.getProjecaoBase('casal', '2026-07-31');
    expect(cedo.mesCorrente.variavelJaGasto).toBe(100);
  });
});
