import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Meta do débito (15/10/2026): o "gasto" tem o recorte da meta.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('meta do débito (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    const l = (id: string, data: string, valor: number, categoria: string, forma: string, classe = 'despesa', descricao = 'compra') =>
      `('${id}', '${data}', ${valor}, '${descricao}', '${categoria}', '${forma}', 'B', 'Matheus', '${classe}', 'Saída', '${data}')`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ${[
        l('a', '2031-03-02', 100, 'Groceries', 'Débito'),
        l('b', '2031-03-10', 50.5, 'Insurance', 'Débito'),           // débito fixo: conta na meta
        l('c', '2031-03-05', 900, 'Housing', 'Débito'),             // casa: fora
        l('d', '2031-03-06', 300, 'Groceries', 'Crédito'),          // crédito: fora (vira fatura)
        l('e', '2031-03-20', 70, 'Groceries', 'Débito'),            // depois de hoje (agendado): fora
        l('f', '2031-02-27', 40, 'Groceries', 'Débito'),            // mês anterior: fora
        l('g', '2031-03-07', 1000, 'Transfers', 'Débito', 'pagamento_fatura'), // fatura: fora
      ].join(',')}`);
    await pool.query(`INSERT INTO financas_orcamento (item, emoji, categorias, teto) VALUES ('Mercado', '🛒', ARRAY['Groceries'], 500)`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('débito do mês até hoje: livre + fixo no débito; fora casa, crédito, fatura, futuro e mês anterior', async () => {
    expect(await queries.getDebitoMesAte('2031-03-15')).toBeCloseTo(150.5, 2);
  });
  it('orçamento do mês até hoje: crédito conta (é gasto da categoria), futuro não', async () => {
    expect(await queries.getOrcamentoMes('2031-03-15')).toEqual([{ item: 'Mercado', emoji: '🛒', teto: 500, gasto: 400 }]);
  });
  it('série diária: por dia, só até hoje e no recorte da meta (o gráfico da mensagem)', async () => {
    expect(await queries.getDebitoPorDia('2031-03-15')).toEqual([{ dia: 2, valor: 100 }, { dia: 10, valor: 50.5 }]);
  });
});
