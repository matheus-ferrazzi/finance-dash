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
    tipo_operacao: 'CARTAO', transferencia_casal: false, categoria_banco: 'Outros',
  });

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/012_par_transferencia.sql', 'utf8'));
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

  it('N2: entrada "receita" com a saída interna de outra conta do casal (mesmo valor, ±1 dia) vira transferência; 1:1; reingestão não desfaz', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, account_id) VALUES
      ('t-sai', '2026-09-04', 123.45, 'Pix enviado', 'Débito', 'Itaú', 'Matheus', 'transferencia_interna', 'Saída', 'itau'),
      ('t-ent', '2026-09-05', 123.45, 'PIX RECEBIDO', 'Débito', 'Bradesco', 'Matheus', 'receita', 'Entrada', 'brad'),
      ('t-ent2', '2026-09-05', 123.45, 'PIX RECEBIDO OUTRO', 'Débito', 'Bradesco', 'Matheus', 'receita', 'Entrada', 'brad'),
      ('t-mesma', '2026-09-04', 50, 'PIX RECEBIDO', 'Débito', 'Itaú', 'Matheus', 'receita', 'Entrada', 'itau'),
      ('t-sai2', '2026-09-04', 50, 'Pix enviado', 'Débito', 'Itaú', 'Matheus', 'transferencia_interna', 'Saída', 'itau'),
      ('t-longe', '2026-09-10', 70, 'PIX RECEBIDO', 'Débito', 'Bradesco', 'Matheus', 'receita', 'Entrada', 'brad'),
      ('t-sai3', '2026-09-04', 70, 'Pix enviado', 'Débito', 'Itaú', 'Matheus', 'transferencia_interna', 'Saída', 'itau')`);
    expect(await repo.parearTransferencias('2026-09-01')).toBe(1);
    const r = await pool.query(`SELECT id_transacao, classe, par_transferencia FROM financas_lancamentos WHERE id_transacao IN ('t-ent','t-ent2','t-mesma','t-longe') ORDER BY 1`);
    // 1:1 (a saída casa com uma entrada só); mesma conta não é transferência entre contas; 6 dias é longe demais
    expect(r.rows).toEqual([
      { id_transacao: 't-ent', classe: 'transferencia_interna', par_transferencia: 't-sai' },
      { id_transacao: 't-ent2', classe: 'receita', par_transferencia: null },
      { id_transacao: 't-longe', classe: 'receita', par_transferencia: null },
      { id_transacao: 't-mesma', classe: 'receita', par_transferencia: null },
    ]);
    // a Pluggy reenvia a entrada classificada como receita: o par segura a transferência
    const reenvio = { ...linha('t-ent', '2026-09-05'), valor: 123.45, tipo_movimento: 'Entrada', classe: 'receita', forma_pagamento: 'Débito', banco: 'Bradesco', account_id: 'brad' } as Lancamento;
    await repo.aplicarConta([reenvio], []);
    expect((await pool.query(`SELECT classe FROM financas_lancamentos WHERE id_transacao = 't-ent'`)).rows[0].classe).toBe('transferencia_interna');
    // e a comparação da sombra não conta isso como diferença (o banco devolve a classe "crua")
    const brad: Conta = { ...conta, account_id: 'brad', banco: 'Bradesco', forma: 'Débito' };
    expect((await repo.lancamentosDaConta(brad, '2026-09-01')).get('t-ent')!.classe).toBe('receita');
    // segunda rodada: nada novo
    expect(await repo.parearTransferencias('2026-09-01')).toBe(0);
  });

  // auditoria 17/10 (L4), 22/10: Pix do dono para ele mesmo em outro banco (o outro lado já é transferência interna)
  // ficava como despesa. Casa a saída com a entrada interna de outra conta do casal, mesmo valor, ±1 dia, e o
  // destinatário da saída tem que ser o dono da entrada — sem isso, Pix a terceiros de mesmo valor casaria (medido: 2)
  it('L4: saída "despesa" para si mesmo vira transferência; Pix a terceiro de mesmo valor não; reingestão não desfaz', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, account_id) VALUES
      ('p-sai', '2026-03-03', 432.1, 'PIX ENVIADO - Cp :0000-Matheus Fulano', 'Transfer - PIX', 'Débito', 'BancoA', 'Matheus', 'despesa', 'Saída', 'conta-a'),
      ('p-ent', '2026-03-03', 432.1, 'PIX TRANSF MATHEUS03/03', 'Same person transfer', 'Débito', 'BancoB', 'Matheus', 'transferencia_interna', 'Entrada', 'conta-b'),
      ('p-terc', '2025-05-05', 88.8, 'PIX ENVIADO Beltrana Silva', 'Transfer - PIX', 'Débito', 'BancoA', 'Ariane', 'despesa', 'Saída', 'conta-c'),
      ('p-ent2', '2025-05-05', 88.8, 'TRANSF RECEBIDA', 'Same person transfer', 'Débito', 'BancoB', 'Ariane', 'transferencia_interna', 'Entrada', 'conta-d'),
      ('p-conta', '2026-03-03', 432.1, 'PAGAMENTO BOLETO Matheus', 'Electricity', 'Débito', 'BancoA', 'Matheus', 'despesa', 'Saída', 'conta-a')`);
    expect(await repo.parearTransferencias('2025-01-01')).toBe(1);
    const r = await pool.query(`SELECT id_transacao, classe, par_transferencia FROM financas_lancamentos WHERE id_transacao IN ('p-sai','p-terc','p-conta') ORDER BY 1`);
    expect(r.rows).toEqual([
      { id_transacao: 'p-conta', classe: 'despesa', par_transferencia: null },
      { id_transacao: 'p-sai', classe: 'transferencia_interna', par_transferencia: 'p-ent' },
      { id_transacao: 'p-terc', classe: 'despesa', par_transferencia: null },
    ]);
    // a Pluggy reenvia a saída como despesa: o par segura; a sombra vê a classe crua (despesa)
    const reenvio = { ...linha('p-sai', '2026-03-03'), valor: 432.1, tipo_movimento: 'Saída', classe: 'despesa', forma_pagamento: 'Débito', banco: 'BancoA', account_id: 'conta-a' } as Lancamento;
    await repo.aplicarConta([reenvio], []);
    expect((await pool.query(`SELECT classe FROM financas_lancamentos WHERE id_transacao = 'p-sai'`)).rows[0].classe).toBe('transferencia_interna');
    const contaA: Conta = { ...conta, account_id: 'conta-a', banco: 'BancoA', forma: 'Débito' };
    expect((await repo.lancamentosDaConta(contaA, '2026-01-01')).get('p-sai')!.classe).toBe('despesa');
    expect(await repo.parearTransferencias('2025-01-01')).toBe(0);
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

  it('17/10: título do Tesouro só de conexão desligada; atualizarValorTitulo grava valor e hora', async () => {
    await pool.query(`INSERT INTO pluggy_contas (account_id, banco, responsavel, forma, ativo) VALUES
      ('i-deb', 'Inter', 'Matheus', 'Débito', false), ('i-cred', 'Inter', 'Matheus', 'Crédito', false), ('it-deb', 'Itaú', 'Matheus', 'Débito', true)`);
    await pool.query(`INSERT INTO financas_investimentos (id_investimento, nome, subtipo, valor_atual, quantidade, banco, responsavel, status) VALUES
      ('t1', 'LFT - Tesouro Selic 2027', 'TREASURY', 588.74, 0.03, 'Inter', 'Matheus', 'ACTIVE'),
      ('t2', 'INTER LIQUIDEZ FIC', 'INVESTMENT_FUND', 0, NULL, 'Inter', 'Matheus', 'TOTAL_WITHDRAWAL'),
      ('t3', 'LFT - Tesouro Selic 2029', 'TREASURY', 100, 0.01, 'Inter', 'Matheus', 'TOTAL_WITHDRAWAL'),
      ('t4', 'LFT - Tesouro Selic 2027', 'TREASURY', 900, 0.05, 'Itaú', 'Matheus', 'ACTIVE')`);
    expect(await repo.titulosSemConexao()).toEqual([
      { id_investimento: 't1', nome: 'LFT - Tesouro Selic 2027', quantidade: 0.03, banco: 'Inter', responsavel: 'Matheus' },
    ]);
    await repo.atualizarValorTitulo('t1', 602.6, '2026-10-17T23:00:00Z');
    const [r] = (await pool.query(`SELECT valor_atual::float8 AS v, atualizado_em = '2026-10-17T23:00:00Z'::timestamptz AS hora FROM financas_investimentos WHERE id_investimento = 't1'`)).rows;
    expect(r).toEqual({ v: 602.6, hora: true });
  });

  it('17/10: ultimasExecucoes devolve o início mais recente de cada tarefa, só do modo pedido', async () => {
    const ex = (tarefa: string, modo: string, inicio: string) =>
      repo.registrarExecucao({ tarefa: tarefa as any, modo: modo as any, inicio, fim: inicio, ok: true, contagens: {}, erro: null });
    await ex('saldos', 'real', '2026-10-16T22:35:00Z');
    await ex('saldos', 'real', '2026-10-17T01:35:00Z');
    await ex('saldos', 'dry-run', '2026-10-17T05:00:00Z');
    await ex('tesouro', 'dry-run', '2026-10-17T05:00:00Z');
    const m = await repo.ultimasExecucoes('real');
    expect(m.get('saldos')?.toISOString()).toBe('2026-10-17T01:35:00.000Z');
    expect(m.has('tesouro')).toBe(false);
  });
});

