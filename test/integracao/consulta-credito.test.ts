import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ResultadoConsulta } from '../../src/lib/apiBrasil';

// 14/11: registrarConsulta grava a consulta e acerta as dívidas de origem 'consulta'. Valores inventados.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('consulta de crédito (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  const res = (p: Partial<ResultadoConsulta>): ResultadoConsulta => ({
    homolog: false, custo: 9.2, score: 500, faixa: 'MEDIO', pendencias: { pend_financeiras: { ocorrencias: [] } }, naoLidas: 0, avisos: [],
    scr: { aVencer: 100, vencido: 0, prejuizo: 300, limite: 0, instituicoes: 1, operacoes: 1, database: '9/2026' },
    dividas: [], ...p,
  });
  const div = (chave: string, valor: number, negativada = true) => ({ credor: chave.split('|')[1] ?? chave, valor, negativada, chave, observacao: 'x' });

  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/019_dividas_externas.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/023_consultas_credito.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  const abertas = async () => (await pool.query(
    `SELECT chave_consulta AS k, valor::float8 AS v, quitada_em IS NULL AS aberta FROM financas_dividas_externas WHERE responsavel = 'Matheus' ORDER BY id`,
  )).rows;

  it('primeira consulta: grava a consulta e as dívidas; o cadastro à mão fica intocado', async () => {
    await pool.query(`INSERT INTO financas_dividas_externas (credor, responsavel, valor) VALUES ('Manual', 'Matheus', 50)`);
    const g = await queries.registrarConsulta('Matheus', res({ dividas: [div('pend_financeiras|loja a', 200), div('scr|prejuizo', 300, false)] }));
    expect(g).toMatchObject({ novas: 2, limpas: 0 });
    expect(await abertas()).toEqual([{ k: null, v: 50, aberta: true }, { k: 'pend_financeiras|loja a', v: 200, aberta: true }, { k: 'scr|prejuizo', v: 300, aberta: true }]);
    const [u] = await queries.getUltimasConsultas();
    expect(u).toMatchObject({ responsavel: 'Matheus', custo: 9.2, score: 500, dividas: 2, scr: { prejuizo: 300 } });
    expect(await queries.horasDesdeConsulta('Matheus')).toBeLessThan(1);
    expect(await queries.horasDesdeConsulta('Ariane')).toBeNull();
  });

  it('segunda consulta com SCR fora do ar: atualiza o valor, limpa a pendência que sumiu, não toca no SCR', async () => {
    const g = await queries.registrarConsulta('Matheus', res({ scr: null, dividas: [div('protestos|cartorio b', 80)] }));
    expect(g).toMatchObject({ novas: 1, limpas: 1 });
    expect(await abertas()).toEqual([
      { k: null, v: 50, aberta: true }, { k: 'pend_financeiras|loja a', v: 200, aberta: false },
      { k: 'scr|prejuizo', v: 300, aberta: true }, { k: 'protestos|cartorio b', v: 80, aberta: true },
    ]);
  });

  it('a dívida dada por limpa que volta a aparecer reabre, com o valor novo', async () => {
    const g = await queries.registrarConsulta('Matheus', res({ dividas: [div('pend_financeiras|loja a', 230), div('protestos|cartorio b', 80), div('scr|prejuizo', 310, false)] }));
    expect(g).toMatchObject({ novas: 0, limpas: 0 });
    expect((await abertas()).filter((x) => x.aberta).map((x) => [x.k, x.v])).toEqual([
      [null, 50], ['pend_financeiras|loja a', 230], ['scr|prejuizo', 310], ['protestos|cartorio b', 80],
    ]);
  });

  it('homologação nunca grava', async () => {
    await expect(queries.registrarConsulta('Matheus', res({ homolog: true }))).rejects.toThrow(/homologação/);
  });
});
