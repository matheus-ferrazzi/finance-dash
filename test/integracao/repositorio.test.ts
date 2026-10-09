import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgRepo } from '../../src/worker/repositorio';
import type { Conta, Lancamento } from '../../src/worker/tipos';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Ver README, seção do worker.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PgRepo (integração)', () => {
  let pool: Pool;
  let repo: PgRepo;
  const conta: Conta = {
    account_id: 'acc', item_id: 'item', banco: 'Nubank', responsavel: 'Matheus', forma: 'Crédito',
    coleta_transacoes: true, coleta_saldo: false, coleta_faturas: true, coleta_investimentos: false,
  };
  const linha = (id: string, data: string): Lancamento => ({
    id_transacao: id, data_lancamento: data, valor: 10, tipo_movimento: 'Saída', classe: 'despesa', descricao: 'x',
    categoria: 'Shopping', forma_pagamento: 'Crédito', banco: 'Nubank', responsavel: 'Matheus', status_pluggy: 'POSTED',
    account_id: 'acc', parcela_numero: 1, parcela_total: 3, data_compra: data, fatura_id: null, fatura_prevista: null,
    contraparte_nome: null, contraparte_doc: null, loja_cnpj: null, loja_cnae: null, categoria_id: '05000000',
    tipo_operacao: 'CARTAO', transferencia_casal: false,
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    repo = new PgRepo(pool);
  });
  afterAll(async () => pool?.end());

  it('linha antiga sem account_id é achada por banco + responsável + forma', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel)
                      VALUES ('velha', '2026-09-05', 5, 'y', 'Crédito', 'Nubank', 'Matheus'),
                             ('outra', '2026-09-05', 5, 'y', 'Débito', 'Nubank', 'Matheus')`);
    const m = await repo.lancamentosDaConta(conta, '2026-09-01');
    expect([...m.keys()]).toEqual(['velha']);
    expect(m.get('velha')).toMatchObject({ data_lancamento: '2026-09-05', valor: 5 });
  });

  it('aplicarConta faz upsert e move as removidas para financas_lancamentos_removidos', async () => {
    await repo.gravarCruas([{ id: 'velha', accountId: 'acc', date: '2026-09-05', description: 'y', amount: -5, type: 'DEBIT' }]);
    await repo.aplicarConta([linha('nova', '2026-09-10')], ['velha']);
    const l = await pool.query(`SELECT id_transacao, parcela_total, visto_pluggy_em IS NOT NULL AS visto FROM financas_lancamentos WHERE account_id = 'acc'`);
    expect(l.rows).toEqual([{ id_transacao: 'nova', parcela_total: 3, visto: true }]);
    const r = await pool.query(`SELECT id_transacao, dados->>'descricao' AS d, motivo FROM financas_lancamentos_removidos`);
    expect(r.rows).toEqual([{ id_transacao: 'velha', d: 'y', motivo: 'sumiu_da_pluggy' }]);
    const c = await pool.query(`SELECT removida_em IS NOT NULL AS removida FROM pluggy_transacoes WHERE id = 'velha'`);
    expect(c.rows[0].removida).toBe(true);
  });

  it('registrarSync só escreve no log quando o lastUpdatedAt muda', async () => {
    await repo.registrarSync('Itaú', 'Matheus', '2026-10-08T18:52:00Z');
    await repo.registrarSync('Itaú', 'Matheus', '2026-10-08T18:52:00Z');
    await repo.registrarSync('Itaú', 'Matheus', '2026-10-09T18:52:00Z');
    const n = await pool.query(`SELECT count(*)::int AS n FROM financas_sync_log`);
    expect(n.rows[0].n).toBe(2);
  });

  it('contasAtivas lê o seed', async () => {
    await pool.query(`INSERT INTO pluggy_contas (account_id, banco, responsavel, forma, coleta_faturas) VALUES ('acc', 'Nubank', 'Matheus', 'Crédito', true)`);
    expect(await repo.contasAtivas()).toEqual([{ ...conta, item_id: null }]);
  });

  it('conta descoberta entra desligada: registrada, mas fora de contasAtivas', async () => {
    await repo.inserirConta({ ...conta, account_id: 'poupanca', forma: 'Débito' }, 'BANK');
    expect((await repo.contasAtivas()).map((c) => c.account_id)).toEqual(['acc']);
    expect(await repo.idsRegistrados()).toEqual(new Set(['acc', 'poupanca']));
  });

  it('002 liga as linhas antigas à conta do seed, nunca à conta descoberta', async () => {
    // 'outra' (Nubank/Matheus/Débito) tem conta de seed e uma poupança descoberta com a mesma combinação
    await pool.query(`INSERT INTO pluggy_contas (account_id, banco, responsavel, forma) VALUES ('seed-debito', 'Nubank', 'Matheus', 'Débito')`);
    await pool.query(readFileSync('db/migrations/002_virada.sql', 'utf8'));
    const r = await pool.query(`SELECT id_transacao, account_id FROM financas_lancamentos WHERE id_transacao = 'outra'`);
    expect(r.rows).toEqual([{ id_transacao: 'outra', account_id: 'seed-debito' }]);
  });
});
