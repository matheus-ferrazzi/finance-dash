import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgRegistroBot } from '../../src/worker/bot/registro';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('registro do bot (integração)', () => {
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
    await pool.query(readFileSync('db/migrations/009_bot.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/016_bot_tokens.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('grava, devolve contexto recente na ordem, conta falhas e limpa antigas', async () => {
    const reg = new PgRegistroBot(pool);
    const base = { ferramentas: [], modelo: 'm', ms: 10, trava: false, semFerramenta: false, tokens: 0 };
    await reg.gravar({ ...base, pessoa: 'Matheus', pergunta: 'p1', resposta: 'r1', erro: null });
    await reg.gravar({ ...base, pessoa: 'Ariane', pergunta: 'p2', resposta: 'r2', erro: null });
    await reg.gravar({ ...base, pessoa: 'Ariane', pergunta: 'p3', resposta: null, erro: 'Groq fora' });
    // E1-M3: com quem perguntou
    expect(await reg.contexto(30, 3)).toEqual([{ pessoa: 'Matheus', pergunta: 'p1', resposta: 'r1' }, { pessoa: 'Ariane', pergunta: 'p2', resposta: 'r2' }]);
    expect(await reg.falhas24h()).toBe(1);
    await pool.query(`UPDATE financas_bot_conversas SET criado_em = now() - interval '91 days' WHERE pergunta = 'p1'`);
    expect(await reg.limpar(90)).toBe(1);
    expect((await reg.contexto(60 * 24 * 365, 10)).map((c) => c.pergunta)).toEqual(['p2']);
  });
});
