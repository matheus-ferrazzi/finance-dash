import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Meta de gastos (17/10/2026; era do débito): o "gasto" tem o recorte da meta.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('meta de gastos (integração)', () => {
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
    // tetos do Orçamento (mar/2031)
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ${[
        l('a', '2031-03-02', 100, 'Groceries', 'Débito'),
        l('b', '2031-03-10', 50.5, 'Insurance', 'Débito'),
        l('c', '2031-03-05', 900, 'Housing', 'Débito'),
        l('d', '2031-03-06', 300, 'Groceries', 'Crédito'),          // crédito: conta no orçamento
        l('e', '2031-03-20', 70, 'Groceries', 'Débito'),            // depois de hoje: fora
        l('f', '2031-02-27', 40, 'Groceries', 'Débito'),            // mês anterior: fora
        l('g', '2031-03-07', 1000, 'Transfers', 'Débito', 'pagamento_fatura'),
      ].join(',')}`);
    // 17/10: meta de todos os gastos — débito + crédito, sem casa, sem dívida antiga, menos estorno de compra
    const g = (id: string, data: string, valor: number, forma: string, descricao: string, extra: { classe?: string; categoria?: string; parc?: [number, number]; criado?: string } = {}) =>
      `('${id}', '${data}', ${valor}, '${descricao}', '${extra.categoria ?? 'Groceries'}', '${forma}', 'B', 'Matheus', '${extra.classe ?? 'despesa'}', '${extra.classe === 'estorno' ? 'Entrada' : 'Saída'}', '${extra.criado ?? data}', ${extra.parc ? extra.parc[0] : 'NULL'}, ${extra.parc ? extra.parc[1] : 'NULL'})`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, parcela_numero, parcela_total) VALUES
      ${[
        g('t1', '2032-05-03', 100, 'Débito', 'mercado'),
        g('t2', '2032-05-04', 200, 'Crédito', 'restaurante'),                                  // crédito à vista: conta
        g('t3', '2032-05-05', 50, 'Crédito', 'Loja 2/3', { parc: [2, 3], criado: '2032-04-05' }), // parcela do mês: conta
        g('t4', '2032-05-25', 50, 'Crédito', 'Loja 3/3', { parc: [3, 3], criado: '2032-04-05' }), // parcela futura: restante
        g('t5', '2032-05-06', 700, 'Crédito', 'Renegociação de pendências 2/6', { categoria: 'Loans and financing' }), // dívida antiga: fora
        g('t6', '2032-05-07', 30, 'Crédito', 'ENCARGOS DE ATRASO', { categoria: 'Bank fees' }),  // encargo: fora
        g('t7', '2032-05-08', 900, 'Crédito', 'aluguel', { categoria: 'Housing' }),             // casa: fora
        g('t8', '2032-05-09', 40, 'Crédito', 'Estorno de compra', { classe: 'estorno', categoria: 'Shopping' }), // estorno de compra: abate
        g('t9', '2032-05-09', 3000, 'Crédito', 'Crédito de parcelamento', { classe: 'estorno', categoria: 'Transfers' }), // financeiro: fora
        g('t10', '2032-05-10', 80, 'Débito', 'GASTOS CARTAO', { categoria: 'Transfers' }),    // espelho: fora
        g('t11', '2032-05-20', 60, 'Débito', 'agendado'),                                       // depois de hoje, sem parcela: fora
        g('t12', '2032-04-10', 1000, 'Débito', 'abril'),
        g('t13', '2032-04-11', 500, 'Crédito', 'abril cred'),
        g('t14', '2032-03-10', 900, 'Débito', 'março'),
      ].join(',')}`);
    await pool.query(`INSERT INTO financas_orcamento (item, emoji, categorias, teto) VALUES ('Mercado', '🛒', ARRAY['Groceries'], 500)`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('orçamento do mês até hoje: crédito conta (é gasto da categoria), futuro não', async () => {
    expect(await queries.getOrcamentoMes('2031-03-15')).toEqual([{ item: 'Mercado', emoji: '🛒', teto: 500, gasto: 400 }]);
  });

  it('gastos do mês até hoje: débito + crédito, parcela do mês, menos estorno de compra; fora casa, dívida e espelho', async () => {
    const r = await queries.getGastosMes('2032-05-15');
    expect(r.gasto).toBeCloseTo(100 + 200 + 50 - 40, 2);
    expect(r.avista).toBeCloseTo(100 + 200 - 40, 2);
    expect(r.parcelasRestantes).toBeCloseTo(50, 2);
    expect(r.porDia).toEqual([{ dia: 3, valor: 100 }, { dia: 4, valor: 200 }, { dia: 5, valor: 50 }, { dia: 9, valor: -40 }]);
  });
  it('meses fechados antes de hoje, do mais antigo ao mais recente (mês sem dado = 0)', async () => {
    expect(await queries.getGastosMesesFechados('2032-05-15', 3)).toEqual([0, 900, 1500]);
  });
});
