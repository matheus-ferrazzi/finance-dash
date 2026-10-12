import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('ações do bot no painel (integração)', () => {
  let pool: Pool;
  let executarAcao: any, desfazerAcao: any, salvarRegra: any, getBuscaBot: any;

  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/007_trilha_ajustes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/003_contas_do_mes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/004_contas_pela_tela.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/010_bot_acoes.sql', 'utf8'));
    ({ salvarRegra, getBuscaBot } = await import('../../src/lib/queries'));
    ({ executarAcao, desfazerAcao } = await import('../../src/lib/botAcoes'));
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  const acao = async (tipo: string, params: object, estado = 'confirmada', pessoa = 'Matheus') =>
    Number((await pool.query(`INSERT INTO financas_bot_acoes (pessoa, tipo, params, resumo, estado) VALUES ($1,$2,$3,'r',$4) RETURNING id`,
      [pessoa, tipo, JSON.stringify(params), estado])).rows[0].id);

  it('categoria sem regra antes: executa, muda o lançamento, desfazer apaga a regra e volta ao banco', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, classe, forma_pagamento, banco, responsavel)
      VALUES ('ea1', '2046-01-03', 50, 'PIX ENVIADO ALGUEM', 'Transfers', 'Transfers', 'despesa', 'Débito', 'B', 'Matheus')`);
    const id = await acao('categoria', { tipo: 'lancamento', idTransacao: 'ea1', categoria: 'Groceries' });
    expect(await executarAcao(id)).toMatchObject({ ok: true, afetados: 1 });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='ea1'`)).rows[0].categoria).toBe('Groceries');
    expect(await executarAcao(id)).toMatchObject({ ok: false }); // já feita: não executa de novo
    expect(await desfazerAcao(id, 'Matheus')).toEqual({ ok: true });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='ea1'`)).rows[0].categoria).toBe('Transfers');
    expect((await pool.query(`SELECT count(*)::int n FROM financas_categoria_painel WHERE chave='ea1'`)).rows[0].n).toBe(0);
  });

  it('categoria sobre regra existente: desfazer restaura a categoria da regra anterior', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, classe, forma_pagamento, banco, responsavel)
      VALUES ('ea2', '2046-01-04', 60, 'PIX ENVIADO OUTRO', 'Transfers', 'Transfers', 'despesa', 'Débito', 'B', 'Matheus')`);
    await salvarRegra({ tipo: 'lancamento', idTransacao: 'ea2', categoria: 'Pharmacy' });
    const id = await acao('categoria', { tipo: 'lancamento', idTransacao: 'ea2', categoria: 'Groceries' });
    expect(await executarAcao(id)).toMatchObject({ ok: true });
    expect(await desfazerAcao(id, 'Matheus')).toEqual({ ok: true });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='ea2'`)).rows[0].categoria).toBe('Pharmacy');
    expect((await pool.query(`SELECT categoria FROM financas_categoria_painel WHERE chave='ea2'`)).rows[0].categoria).toBe('Pharmacy');
  });

  it('avulsa: cria a marcação; desfazer apaga; não confirmada, de outra pessoa ou velha: recusa', async () => {
    const id = await acao('avulsa', { mes: '2046-01', nome: 'Dentista', valor: 150, responsavel: 'Ariane' });
    expect(await executarAcao(id)).toMatchObject({ ok: true });
    expect((await pool.query(`SELECT count(*)::int n FROM financas_contas_marcas WHERE nome='Dentista'`)).rows[0].n).toBe(1);
    expect(await desfazerAcao(id, 'Ariane')).toMatchObject({ ok: false }); // pediu o Matheus
    expect(await desfazerAcao(id, 'Matheus')).toEqual({ ok: true });
    expect((await pool.query(`SELECT count(*)::int n FROM financas_contas_marcas WHERE nome='Dentista'`)).rows[0].n).toBe(0);
    expect(await executarAcao(await acao('avulsa', { mes: '2046-01', nome: 'X', valor: 1, responsavel: 'Matheus' }, 'pendente'))).toMatchObject({ ok: false });
    const velha = await acao('avulsa', { mes: '2046-01', nome: 'Y', valor: 1, responsavel: 'Matheus' });
    await executarAcao(velha);
    await pool.query(`UPDATE financas_bot_acoes SET atualizado_em = now() - interval '25 hours' WHERE id = $1`, [velha]);
    expect(await desfazerAcao(velha, 'Matheus')).toMatchObject({ ok: false });
  });

  it('busca: casa texto e valor, sem CPF, até 5', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, forma_pagamento, banco, responsavel)
      VALUES ('eb1', '2046-02-03', 50, 'PIX ENVIADO FULANO 123.456.789-00', 'Transfers', 'despesa', 'Débito', 'B', 'Matheus')`);
    const r = await getBuscaBot('casal', '2046-02-01', '2046-03-01', 'fulano', 50);
    expect(r).toEqual([{ id: 'eb1', data: '03/02', valor: 50, descricao: 'PIX ENVIADO FULANO', pessoa: 'Matheus', categoria: 'Transfers' }]);
    expect(await getBuscaBot('casal', '2046-02-01', '2046-03-01', 'fulano', 51)).toEqual([]);
  });
  it('revisão E2: dois executar ao mesmo tempo no mesmo id gravam uma vez', async () => {
    const id = await acao('avulsa', { mes: '2046-03', nome: 'Duplo', valor: 10, responsavel: 'Matheus' });
    const rs = await Promise.all([executarAcao(id), executarAcao(id)]);
    expect(rs.filter((r: any) => r.ok)).toHaveLength(1);
    expect((await pool.query(`SELECT count(*)::int n FROM financas_contas_marcas WHERE nome='Duplo'`)).rows[0].n).toBe(1);
  });

  it('revisão E2: desfazer avulsa já apagada no painel ou regra mudada depois: recusa e não mexe', async () => {
    const av = await acao('avulsa', { mes: '2046-03', nome: 'Sumiu', valor: 10, responsavel: 'Matheus' });
    await executarAcao(av);
    await pool.query(`DELETE FROM financas_contas_marcas WHERE nome='Sumiu'`);
    expect(await desfazerAcao(av, 'Matheus')).toMatchObject({ ok: false });
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, classe, forma_pagamento, banco, responsavel)
      VALUES ('ea3', '2046-03-04', 70, 'PIX ENVIADO TERCEIRO', 'Transfers', 'Transfers', 'despesa', 'Débito', 'B', 'Matheus')`);
    const cat = await acao('categoria', { tipo: 'lancamento', idTransacao: 'ea3', categoria: 'Groceries' });
    await executarAcao(cat);
    await salvarRegra({ tipo: 'lancamento', idTransacao: 'ea3', categoria: 'Pharmacy' }); // mudou depois, pela tela
    expect(await desfazerAcao(cat, 'Matheus')).toMatchObject({ ok: false });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='ea3'`)).rows[0].categoria).toBe('Pharmacy');
  });
});
