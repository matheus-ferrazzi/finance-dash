import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Ver README, seção do worker.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('gasto em dinheiro vivo (integração)', () => {
  let pool: Pool;
  let dinheiro: any;

  beforeAll(async () => {
    const u = new URL(url!);
    // o painel lê a conexão das variáveis de ambiente na importação
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/007_trilha_ajustes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/010_bot_acoes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/011_gastos_dinheiro.sql', 'utf8'));
    dinheiro = await import('../../src/lib/dinheiro');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('insere, lista e soma por categoria, pessoa e período; apagar devolve se existia', async () => {
    const a = await dinheiro.inserirDinheiro({ data: '2047-01-03', valor: 50, descricao: 'feira', categoria: 'Groceries', responsavel: 'Ariane' });
    await dinheiro.inserirDinheiro({ data: '2047-01-04', valor: 20, descricao: 'pastel', categoria: 'Eating out', responsavel: 'Matheus' });
    await dinheiro.inserirDinheiro({ data: '2047-02-01', valor: 99, descricao: 'fora do período', categoria: 'Groceries', responsavel: 'Matheus' });
    expect(Object.fromEntries(await dinheiro.getDinheiroPorCategoriaEntre('2047-01-01', '2047-02-01'))).toEqual({ Groceries: 50, 'Eating out': 20 });
    expect(Object.fromEntries(await dinheiro.getDinheiroPorCategoriaEntre('2047-01-01', '2047-02-01', 'Ariane'))).toEqual({ Groceries: 50 });
    expect((await dinheiro.getGastosDinheiro('casal', '2047-01-01', '2047-02-01')).map((g: any) => [g.data, g.valor, g.descricao, g.pessoa]))
      .toEqual([['2047-01-04', 20, 'pastel', 'Matheus'], ['2047-01-03', 50, 'feira', 'Ariane']]);
    expect(await dinheiro.apagarDinheiro(a)).toBe(true);
    expect(await dinheiro.apagarDinheiro(a)).toBe(false);
  });

  it('o banco não enxerga o dinheiro: gasto por categoria e previsão iguais com e sem', async () => {
    const queries = await import('../../src/lib/queries');
    const hoje = (await import('../../src/lib/format')).currentDateSP();
    const ini = `${hoje.slice(0, 7)}-01`;
    const antesCat = Object.fromEntries(await queries.getGastoPorCategoriaEntre(ini, '2999-01-01'));
    const antesPrev = await queries.getPrevisaoResumo('casal');
    await dinheiro.inserirDinheiro({ data: hoje, valor: 777, descricao: 'teste', categoria: 'Groceries', responsavel: 'Matheus' });
    expect(Object.fromEntries(await queries.getGastoPorCategoriaEntre(ini, '2999-01-01'))).toEqual(antesCat);
    const depoisPrev = await queries.getPrevisaoResumo('casal');
    expect([depoisPrev.fechaCom, depoisPrev.ritmoAtualDia, depoisPrev.ritmoSeguroDia]).toEqual([antesPrev.fechaCom, antesPrev.ritmoAtualDia, antesPrev.ritmoSeguroDia]);
  });

  it('somarMapas', () => {
    expect(Object.fromEntries(dinheiro.somarMapas(new Map([['A', 1], ['B', 2]]), new Map([['B', 3], ['C', 4]])))).toEqual({ A: 1, B: 5, C: 4 });
  });
});
