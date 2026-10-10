import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('regra de categoria por documento da contraparte (integração)', () => {
  let pool: Pool;
  const cat = async (desc: string, c: string | null, doc: string | null) =>
    (await pool.query('SELECT categoria_efetiva($1, $2, $3) AS c', [desc, c, doc])).rows[0].c;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/005_regras_por_documento.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_regras_categoria (padrao, contraparte_doc, categoria) VALUES
      (NULL, '11122233344', 'Gifts'), ('ALMOCO RACHADO', NULL, 'Eating out'), ('FULANO', NULL, 'Services')`);
  });
  afterAll(async () => { await pool?.end(); });

  it('o documento casa em qualquer banco e grafia, só quando a categoria é vaga', async () => {
    expect(await cat('Pix enviado FULANO DE TAL', 'Transfer - PIX', '11122233344')).toBe('Gifts');
    expect(await cat('PIX ENVIADO   Fulano de Tal', 'Transfers', '11122233344')).toBe('Gifts');
    expect(await cat('qualquer', 'Groceries', '11122233344')).toBe('Groceries');
  });

  it('documento vence a regra por texto; sem documento, a regra por texto continua valendo', async () => {
    expect(await cat('PIX FULANO', 'Transfer - PIX', '11122233344')).toBe('Gifts');
    expect(await cat('PIX FULANO', 'Transfer - PIX', null)).toBe('Services');
    expect(await cat('ALMOCO RACHADO COM X', 'Transfer - PIX', '99988877766')).toBe('Eating out');
  });

  it('chamada antiga, com 2 argumentos (bots do n8n), continua funcionando', async () => {
    expect((await pool.query(`SELECT categoria_efetiva('ALMOCO RACHADO', 'Outros') AS c`)).rows[0].c).toBe('Eating out');
  });
});
