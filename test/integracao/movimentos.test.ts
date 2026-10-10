import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getMovimentosDiarios (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento) VALUES
      ('a', '2026-10-02', 100, 'x', 'Débito', 'B', 'Ariane', 'receita', 'Entrada'),
      ('b', '2026-10-02', 30, 'x', 'Débito', 'B', 'Ariane', 'despesa', 'Saída'),
      ('c', '2026-10-03', 50, 'x', 'Crédito', 'B', 'Ariane', 'despesa', 'Saída'),
      ('d', '2026-10-04', 20, 'x', 'Débito', 'B', 'Matheus', 'despesa', 'Saída'),
      ('e', '2026-10-20', 999, 'x', 'Débito', 'B', 'Ariane', 'despesa', 'Saída'),
      ('esp', '2026-10-05', 4000, 'MORA CARTAO DE CREDITO - DOCTO: 1', 'Débito', 'B', 'Matheus', 'pagamento_fatura', 'Saída')`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('lançamento-espelho do cartão (MORA/PROVISAO/GASTOS CART) não move a linha', async () => {
    expect(await queries.getMovimentosDiarios('Matheus', '2026-10-01', '2026-10-10')).toEqual({ '2026-10-04': -20 });
  });

  it('líquido por dia, só débito, da pessoa, até hoje (agendado não entra)', async () => {
    expect(await queries.getMovimentosDiarios('Ariane', '2026-10-01', '2026-10-10')).toEqual({ '2026-10-02': 70 });
    expect(await queries.getMovimentosDiarios('casal', '2026-10-01', '2026-10-10')).toEqual({ '2026-10-02': 70, '2026-10-04': -20 });
  });
});
