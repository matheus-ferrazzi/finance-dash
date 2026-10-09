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
    // criado_em = quando a linha passou a existir no banco (é isso que diz se era "conhecida" em hoje)
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
      VALUES ('jul', '2026-07-10', 100, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-07-11'),
             ('set', '2026-09-10', 999, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-09-11'),
             ('ago-agendado', '2026-08-20', 50, 'boleto', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-08-05'),
             ('ago-depois', '2026-08-25', 70, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-08-26')`);
    const base = await queries.getProjecaoBase('casal', '2026-08-15');
    // em 15/08: o de 20/08 já estava agendado (gravado em 05/08); o de 25/08 e o de setembro ainda não existiam
    expect(base.mesCorrente.variavelJaGasto).toBe(0);
    expect(base.mesCorrente.agendadoRestante).toBe(50);
    const cedo = await queries.getProjecaoBase('casal', '2026-07-31');
    expect(cedo.mesCorrente.variavelJaGasto).toBe(100);
  });

  it('crédito por vencimento: fatura_id exato; fatura_prevista + deslocamento aprendido da conta; senão mês seguinte', async () => {
    // conta "neon": fatura_prevista é o mês ANTERIOR ao vencimento (aprende +1 pelo lançamento ligado à fatura)
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES ('fat-ago', 'neon', '2026-08-05', 300)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id, fatura_id, fatura_prevista)
      VALUES ('c1', '2026-07-10', 100, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2026-07-10', 'neon', 'fat-ago', '2026-07'),
             ('c2', '2026-08-10', 40, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2026-08-10', 'neon', NULL, '2026-08'),
             ('c3', '2026-08-12', 25, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2026-08-12', 'nu', NULL, NULL)`);
    const base = await queries.getProjecaoBase('casal', '2026-08-15');
    expect(base.creditoPorVencimento['2026-08']).toBe(100);  // pelo fatura_id
    expect(base.creditoPorVencimento['2026-09']).toBe(65);   // 40 (prevista ago + 1) + 25 (sem nada: mês seguinte)
    expect(base.faturaReal).toEqual({ '2026-08': 300 });
  });

  it('gasto no débito e compras novas no crédito: mediana dos 6 últimos meses fechados', async () => {
    await pool.query(`DELETE FROM financas_lancamentos`);
    const linhas = [['2026-01', 100], ['2026-02', 100], ['2026-03', 100], ['2026-04', 900], ['2026-05', 100], ['2026-06', 100]]
      .flatMap(([m, v], i) => [
        `('d${i}', '${m}-10', ${v}, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '${m}-10')`,
        `('k${i}', '${m}-11', ${Number(v) * 2}, 'loja', 'Shopping', 'Crédito', 'Nubank', 'Matheus', 'despesa', 'Saída', '${m}-11')`,
      ]).join(',');
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES ${linhas}`);
    const base = await queries.getProjecaoBase('casal', '2026-07-01');
    expect(base.despesaVariavelMediaMensal).toBe(100);
    expect(base.creditoNovoMedio).toBe(200);
  });

  it('receita sem documento agrupa pela descrição sem dígitos e com espaços normalizados', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
      VALUES ('r1', '2026-05-05', 3000, 'PIX RECEBIDO  SILVA 0501', 'Débito', 'Itaú', 'Matheus', 'receita', 'Entrada', '2026-05-05'),
             ('r2', '2026-06-05', 3000, 'PIX RECEBIDO SILVA 0602', 'Débito', 'Itaú', 'Matheus', 'receita', 'Entrada', '2026-06-05')`);
    const base = await queries.getProjecaoBase('casal', '2026-07-01');
    expect(base.fontesReceita.map((f) => [f.nome, f.valor])).toEqual([['pix recebido silva', 3000]]);
  });
});
