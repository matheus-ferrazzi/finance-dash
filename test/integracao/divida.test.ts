import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Auditoria 17/10 (L2), decisão do Matheus em 20/10: a dívida
// antiga sai do gasto (o mesmo recorte da meta) — o Nubank antecipa as parcelas do plano velho como despesa e o plano
// novo também é despesa: somar as duas contava a mesma dívida duas vezes. Valores inventados.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('dívida antiga fora do gasto (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    const l = (id: string, data: string, valor: number, descricao: string, categoria: string) =>
      `('${id}', '${data}', ${valor}, '${descricao}', '${categoria}', 'Crédito', 'B', 'Matheus', 'despesa', 'Saída', '${data}')`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ${[
        l('d1', '2033-04-03', 210, 'MERCADO', 'Groceries'),
        l('d2', '2033-04-06', 1471.16, 'Renegociação de pendências 3/7', 'Loans and financing'),
        l('d3', '2033-04-06', 367.79, 'Renegociação de pendências 1/4', 'Transfers'),
        l('d4', '2033-04-09', 9.4, 'ENCARGOS DE ATRASO', 'Bank fees'),
        l('d5', '2033-04-12', 95, 'LOJA 2/3', 'Shopping'),
      ].join(',')}`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('gasto por categoria (Zeca: quanto gastamos, comparar): sem a dívida antiga; compra parcelada comum fica', async () => {
    const m = await queries.getGastoPorCategoriaEntre('2033-04-01', '2033-05-01');
    expect(Object.fromEntries(m)).toEqual({ Groceries: 210, Shopping: 95 });
  });
  it('dívida antiga do período, à parte', async () => {
    expect(await queries.getDividaEntre('2033-04-01', '2033-05-01')).toBeCloseTo(1848.35, 2);
    expect(await queries.getDividaEntre('2033-05-01', '2033-06-01')).toBe(0);
  });
  it('maiores gastos: a antecipação da renegociação não aparece', async () => {
    expect((await queries.getMaioresGastos('casal', '2033-04-01', '2033-05-01', null)).map((x) => x.valor)).toEqual([210, 95]);
  });
});
