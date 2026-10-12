import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgAcoes } from '../../src/worker/bot/acoes';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('ações do bot (integração)', () => {
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
    await pool.query(readFileSync('db/migrations/010_bot_acoes.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('cria, substitui, confirma uma vez só, expira, cancela e acha a última feita', async () => {
    const a = new PgAcoes(pool);
    const p1 = await a.criar('Matheus', 'avulsa', { nome: 'A' }, 'r1');
    const p2 = await a.criar('Matheus', 'avulsa', { nome: 'B' }, 'r2');
    expect((await pool.query('SELECT estado FROM financas_bot_acoes WHERE id = $1', [p1])).rows[0].estado).toBe('substituida');
    expect(await a.pendente('Matheus')).toMatchObject({ id: p2, resumo: 'r2', expirada: false });
    expect(await a.pendente('Ariane')).toBeNull();
    expect(await a.confirmar(p2)).toBe(true);
    expect(await a.confirmar(p2)).toBe(false); // segundo "sim" não confirma de novo
    const p3 = await a.criar('Ariane', 'categoria', {}, 'r3');
    await pool.query(`UPDATE financas_bot_acoes SET criado_em = now() - interval '6 minutes' WHERE id = $1`, [p3]);
    expect(await a.pendente('Ariane')).toMatchObject({ id: p3, expirada: true });
    expect(await a.confirmar(p3)).toBe(false);
    const p4 = await a.criar('Ariane', 'categoria', {}, 'r4');
    await a.cancelar(p4);
    expect(await a.pendente('Ariane')).toBeNull();
    await pool.query(`UPDATE financas_bot_acoes SET estado = 'feita', atualizado_em = now() WHERE id = $1`, [p2]);
    expect(await a.ultimaFeita('Matheus')).toMatchObject({ id: p2, resumo: 'r2' });
    await pool.query(`UPDATE financas_bot_acoes SET atualizado_em = now() - interval '25 hours' WHERE id = $1`, [p2]);
    expect(await a.ultimaFeita('Matheus')).toBeNull();
  });
});
