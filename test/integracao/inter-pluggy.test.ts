import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 14/11: o Inter volta pela segunda conta da Pluggy. 021 liga as contas novas; 022 tira os registros da conexão antiga.
// Valores inventados.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('migrações 021/022: Inter pela segunda conta da Pluggy', () => {
  let pool: Pool;
  const mig = (n: string) => pool.query(readFileSync(`db/migrations/${n}`, 'utf8'));

  beforeAll(async () => {
    // uma conexão só: o ROLLBACK depois da migração que falha precisa cair na mesma sessão
    pool = new Pool({ connectionString: url, max: 1 });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(`INSERT INTO pluggy_contas (account_id, item_id, banco, responsavel, forma, ativo, coleta_investimentos, criado_em) VALUES
      ('velha-deb', 'item-velho', 'Inter', 'Matheus', 'Débito', false, false, '2025-04-01'),
      ('velha-cred', 'item-velho', 'Inter', 'Matheus', 'Crédito', false, true, '2025-04-01'),
      ('nu', 'item-nu', 'Nubank', 'Matheus', 'Débito', true, true, '2025-04-01')`);
    await pool.query(`INSERT INTO pluggy_itens (item_id, banco, responsavel) VALUES ('item-velho', 'Inter', 'Matheus'), ('item-nu', 'Nubank', 'Matheus')`);
    await pool.query(`INSERT INTO financas_investimentos (id_investimento, item_id, nome, subtipo, valor_atual, banco, responsavel, status, atualizado_em) VALUES
      ('t-velho', 'item-velho', 'LFT - Tesouro Selic 2027', 'TREASURY', 100, 'Inter', 'Matheus', 'ACTIVE', now()),
      ('t-nu', 'item-nu', 'CDB', 'CDB', 50, 'Nubank', 'Matheus', 'ACTIVE', now())`);
  });
  afterAll(async () => pool?.end());

  it('021 falha sem mudar nada enquanto as contas novas não foram descobertas', async () => {
    await expect(mig('021_inter_pluggy_ligar.sql')).rejects.toThrow(/ainda nao descobertas/);
    await pool.query('ROLLBACK').catch(() => {});
  });

  it('022 falha sem mudar nada enquanto a conexão nova não gravou investimentos', async () => {
    await expect(mig('022_inter_pluggy_antigos.sql')).rejects.toThrow(/ainda sem investimentos/);
    await pool.query('ROLLBACK').catch(() => {});
    expect((await pool.query(`SELECT count(*)::int AS n FROM financas_investimentos WHERE item_id = 'item-velho'`)).rows[0].n).toBe(1);
  });

  it('021 liga só as contas novas de débito do Inter, com saldo, lançamentos e investimentos', async () => {
    await pool.query(`INSERT INTO pluggy_contas (account_id, item_id, banco, responsavel, forma, ativo, criado_em) VALUES
      ('nova-cc', 'item-novo', 'Inter', 'Matheus', 'Débito', false, '2026-11-14T12:00:00Z'),
      ('nova-pp', 'item-novo', 'Inter', 'Matheus', 'Débito', false, '2026-11-14T12:00:00Z')`);
    await mig('021_inter_pluggy_ligar.sql');
    const r = await pool.query(`SELECT account_id, ativo, coleta_saldo, coleta_investimentos FROM pluggy_contas WHERE banco = 'Inter' ORDER BY account_id`);
    expect(r.rows).toEqual([
      { account_id: 'nova-cc', ativo: true, coleta_saldo: true, coleta_investimentos: true },
      { account_id: 'nova-pp', ativo: true, coleta_saldo: true, coleta_investimentos: true },
      { account_id: 'velha-cred', ativo: false, coleta_saldo: false, coleta_investimentos: true },
      { account_id: 'velha-deb', ativo: false, coleta_saldo: false, coleta_investimentos: false },
    ]);
  });

  it('022 tira os títulos e o item da conexão antiga; não toca na nova nem em outro banco', async () => {
    await pool.query(`INSERT INTO financas_investimentos (id_investimento, item_id, nome, subtipo, valor_atual, banco, responsavel, status, atualizado_em)
      VALUES ('t-novo', 'item-novo', 'Tesouro Selic 2027', 'TREASURY', 95, 'Inter', 'Matheus', 'ACTIVE', '2026-11-14T19:25:00Z')`);
    await mig('022_inter_pluggy_antigos.sql');
    const inv = await pool.query(`SELECT id_investimento FROM financas_investimentos ORDER BY id_investimento`);
    expect(inv.rows.map((x) => x.id_investimento)).toEqual(['t-novo', 't-nu']);
    const itens = await pool.query(`SELECT item_id FROM pluggy_itens ORDER BY item_id`);
    expect(itens.rows.map((x) => x.item_id)).toEqual(['item-nu']);
  });
});
