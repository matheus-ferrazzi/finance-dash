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
    fontes: ['pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico', 'scr'], scrBruto: { consolidado: {} },
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
    await pool.query(readFileSync('db/migrations/024_consultas_scr_bruto.sql', 'utf8'));
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
    const g = await queries.registrarConsulta('Matheus', res({ scr: null, scrBruto: null, fontes: ['pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico'], dividas: [div('protestos|cartorio b', 80)] }));
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

  it('consulta só do SCR não limpa as pendências; a contagem da tela vem do que está em aberto', async () => {
    const g = await queries.registrarConsulta('Matheus', res({ pendencias: {}, fontes: ['scr'], score: 610, dividas: [div('scr|prejuizo', 320, false)] }));
    expect(g).toMatchObject({ novas: 0, limpas: 0 });
    const [u] = await queries.getUltimasConsultas();
    expect(u).toMatchObject({ score: 610, dividas: 3 });
  });

  it('relerConsulta: relê o dossiê guardado com o leitor atual, sem tocar no SCR', async () => {
    const OK = { codigo: '1', descricao: 'OK' };
    const { rows } = await pool.query(
      `INSERT INTO financas_consultas_credito (responsavel, custo, pendencias, dividas) VALUES ('Matheus', 9.2, $1, 0) RETURNING id`,
      [JSON.stringify({ protesto_sintetico: { status_retorno: OK, quantidade_ocorrencia: '1', ocorrencias: [{ valor: '99,00', comarca: 'CIDADE X', uf: 'SP', cartorio: '1', data_ocorrencia: '01/01/2025' }] } })],
    );
    const r = await queries.relerConsulta(Number(rows[0].id));
    // o protesto entra; loja a e cartorio b (do dossiê) somem desta leitura e ficam limpas; o SCR fica
    expect(r).toMatchObject({ responsavel: 'Matheus', dividas: 1, novas: 1, limpas: 2, naoLidas: 0 });
    expect((await abertas()).filter((x) => x.aberta).map((x) => x.k)).toEqual([null, 'scr|prejuizo', 'protesto_sintetico|protesto em cartorio 1º de cidade x/sp||01/01/2025']);
    const [c] = (await pool.query(`SELECT dividas, relida_em IS NOT NULL AS relida FROM financas_consultas_credito WHERE id = $1`, [rows[0].id])).rows;
    expect(c).toEqual({ dividas: 1, relida: true });
    expect(await queries.relerConsulta(999999)).toBeNull();
  });

  it('consulta da Serasa cobre negativações e protestos: o protesto do dossiê (outra chave) sai, o SCR fica', async () => {
    const SERASA = ['serasa', 'pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico'];
    const g = await queries.registrarConsulta('Matheus', res({ scr: null, scrBruto: null, fontes: SERASA, score: 480,
      dividas: [div('protestos|cartorio 01 - cidade x/sp||2025-02-01', 99), div('serasa|fundo exemplo||2024-01-15', 1000)] }));
    expect(g).toMatchObject({ novas: 2 });
    expect((await abertas()).filter((x) => x.aberta).map((x) => x.k)).toEqual([
      null, 'scr|prejuizo', 'protestos|cartorio 01 - cidade x/sp||2025-02-01', 'serasa|fundo exemplo||2024-01-15',
    ]);
    const [u] = await queries.getUltimasConsultas();
    expect(u).toMatchObject({ score: 480, scr: { prejuizo: 300 }, dividas: 3 });
  });

  // 15/11: reler uma consulta da Serasa dava por limpas as dívidas que ela mesma trouxe (o leitor do dossiê não acha nada)
  it('relerConsulta recusa consulta sem dossiê (a da Serasa) e não mexe nas dívidas', async () => {
    const antes = await abertas();
    const { rows } = await pool.query(
      `INSERT INTO financas_consultas_credito (responsavel, custo, pendencias, dividas) VALUES ('Matheus', 16.88, $1, 2) RETURNING id`,
      [JSON.stringify({ serasa: { ocorrencias: [], resumo: {} } })],
    );
    await expect(queries.relerConsulta(Number(rows[0].id))).rejects.toThrow('não teve dossiê');
    expect(await abertas()).toEqual(antes);
    const [c] = (await pool.query(`SELECT dividas, relida_em IS NULL AS intacta FROM financas_consultas_credito WHERE id = $1`, [rows[0].id])).rows;
    expect(c).toEqual({ dividas: 2, intacta: true });
  });

  it('homologação nunca grava', async () => {
    await expect(queries.registrarConsulta('Matheus', res({ homolog: true }))).rejects.toThrow(/homologação/);
  });
});
