import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Auditoria 17/10 (W5, L5), 23/10. Valores inventados.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('conta desligada e aplicação automática (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, { DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1), DB_USER: u.username, DB_PASSWORD: u.password });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(`INSERT INTO pluggy_contas (account_id, banco, responsavel, forma, ativo) VALUES
      ('cd-ativa', 'BancoA', 'Matheus', 'Débito', true), ('cd-desl', 'BancoD', 'Matheus', 'Débito', false),
      ('cd-cart-desl', 'BancoD', 'Matheus', 'Crédito', false)`);
    await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo) VALUES
      ('cd-ativa', 'BancoA', 'Matheus', 'CHECKING_ACCOUNT', 300), ('cd-desl', 'BancoD', 'Matheus', 'CHECKING_ACCOUNT', 77),
      ('cd-sem-ligacao', 'BancoS', 'Ariane', 'CHECKING_ACCOUNT', 20)`);
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, limite_total, limite_disponivel, valor_fatura_atual) VALUES
      ('cd-cart-desl', 'BancoD', 'Matheus', 1000, 900, 100), ('cd-cart-sem', 'BancoS', 'Ariane', 500, 500, 0)`);
    const l = (id: string, data: string, valor: number, desc: string, mov: string, classe: string) =>
      `('${id}', '${data}', ${valor}, '${desc}', 'Débito', 'BancoA', 'Matheus', '${classe}', '${mov}', '${data}')`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ${[
        l('ap1', '2030-03-03', 410.5, 'Resgate RES APLIC AUT MAIS', 'Entrada', 'aporte'),
        l('ap2', '2030-03-04', 0.37, 'Rendimentos REND PAGO APLIC AUT MAIS', 'Entrada', 'receita'),
        l('ap3', '2030-03-05', 120, 'MERCADO', 'Saída', 'despesa'),
      ].join(',')}`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('W5: saldo e fatura de conta desligada saem; sem ligação com pluggy_contas continua', async () => {
    const s = await queries.getSaldoContas('casal');
    expect(s.contas.map((c) => c.banco).sort()).toEqual(['BancoA', 'BancoS']);
    expect(s.total).toBe(320);
    const f = await queries.getFaturas('casal', '2030-03-10');
    expect(f.map((x) => x.id)).toEqual(['cd-cart-sem']);
  });
  it('L5: aplicar e resgatar da aplicação automática não mexe no saldo reconstruído; o rendimento mexe', async () => {
    expect(await queries.getMovimentosDiarios('casal', '2030-03-01', '2030-03-10')).toEqual({ '2030-03-04': 0.37, '2030-03-05': -120 });
  });
});
