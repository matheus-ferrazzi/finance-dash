import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('consultas do bot (integração)', () => {
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

  it('gasto por categoria filtra pessoa; maiores gastos ordena, filtra grupo e período', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, forma_pagamento, banco, responsavel) VALUES
      ('bt1', '2044-02-03', 300, 'MERCADO A', 'Groceries', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt2', '2044-02-04', 120, 'MERCADO B', 'Groceries', 'despesa', 'Crédito', 'B', 'Ariane'),
      ('bt3', '2044-02-05', 80, 'IFOOD', 'Food delivery', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt4', '2044-03-01', 999, 'MARCO', 'Groceries', 'despesa', 'Débito', 'B', 'Matheus'),
      ('bt5', '2044-02-06', 5000, 'SALARIO', 'Salary', 'receita', 'Débito', 'B', 'Matheus')`);
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre('2044-02-01', '2044-03-01', 'Matheus'))).toEqual({ Groceries: 300, 'Food delivery': 80 });
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre('2044-02-01', '2044-03-01'))).toEqual({ Groceries: 420, 'Food delivery': 80 });
    const top = await queries.getMaioresGastos('casal', '2044-02-01', '2044-03-01', null);
    expect(top.map((t) => [t.data, t.valor, t.descricao, t.pessoa])).toEqual([['03/02', 300, 'MERCADO A', 'Matheus'], ['04/02', 120, 'MERCADO B', 'Ariane'], ['05/02', 80, 'IFOOD', 'Matheus']]);
    expect((await queries.getMaioresGastos('casal', '2044-02-01', '2044-03-01', 'Mercado')).length).toBe(2);
  });
  it('maiores gastos sem CPF/CNPJ na descrição (vai para a Groq e para o grupo)', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, forma_pagamento, banco, responsavel) VALUES
      ('bt9', '2045-01-03', 77, 'PIX ENVIADO FULANO DE TAL 123.456.789-00', 'Transfers', 'despesa', 'Débito', 'B', 'Matheus')`);
    const [g] = await queries.getMaioresGastos('casal', '2045-01-01', '2045-02-01', null);
    expect(g.descricao).toBe('PIX ENVIADO FULANO DE TAL');
  });
});
