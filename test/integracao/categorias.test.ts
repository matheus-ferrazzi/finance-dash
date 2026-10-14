import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('categorias pelo painel (integração)', () => {
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
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/007_trilha_ajustes.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('migração 006: preenche categoria_banco com a categoria atual e é idempotente', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('m1', '2040-01-05', 10, 'X', 'Groceries', 'Débito', 'B', 'Ariane', 'despesa', 'Saída')`);
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    const { rows } = await pool.query(`SELECT categoria_banco FROM financas_lancamentos WHERE id_transacao = 'm1'`);
    expect(rows[0].categoria_banco).toBe('Groceries');
  });
  const ins = (id: string, desc: string, cat: string, doc: string | null, nome: string | null = null) => pool.query(
    `INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, forma_pagamento, banco, responsavel, classe, tipo_movimento, contraparte_doc, contraparte_nome)
     VALUES ($1, '2040-02-05', 10, $2, $3::text, $3::text, 'Débito', 'B', 'Ariane', 'despesa', 'Saída', $4, $5)`, [id, desc, cat, doc, nome]);

  it('regra por texto: prévia = gravação; muda categoria e classe; não expõe documento', async () => {
    await ins('c1', 'LOJA DO BICHO 1', 'Shopping', '99988877766', 'Loja do Bicho Ltda');
    await ins('c2', 'Loja do Bicho 2', 'Groceries', null);
    await ins('c3', 'OUTRA LOJA', 'Shopping', null);
    const pedido = { tipo: 'texto' as const, idTransacao: 'c1', texto: 'loja do bicho', categoria: 'Pet supplies and vet' };
    expect(await queries.previaRegra(pedido)).toEqual({ afetados: 2, porCategoria: { Shopping: 1, Groceries: 1 } });
    expect(await queries.salvarRegra(pedido)).toMatchObject({ afetados: 2 });
    const { rows } = await pool.query(`SELECT id_transacao, categoria, categoria_banco FROM financas_lancamentos WHERE id_transacao IN ('c1','c2','c3') ORDER BY 1`);
    expect(rows.map((r) => r.categoria)).toEqual(['Pet supplies and vet', 'Pet supplies and vet', 'Shopping']);
    expect(rows[0].categoria_banco).toBe('Shopping');
    const lc = await queries.getLancamentoParaCorrigir('c1');
    expect(lc).toMatchObject({ categoria: 'Pet supplies and vet', origem: 'texto', temDoc: true, nomeContraparte: 'Loja do Bicho Ltda' });
    expect(JSON.stringify(lc)).not.toContain('99988877766');
    expect(JSON.stringify(await queries.listarRegras())).not.toContain('99988877766');
  });

  it('virar Investimentos tira de despesa (classe aporte); corrigir de novo a mesma chave substitui', async () => {
    await ins('c4', 'APLICA X', 'Shopping', null);
    await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c4', categoria: 'Investments' });
    expect((await pool.query(`SELECT classe FROM financas_lancamentos WHERE id_transacao='c4'`)).rows[0].classe).toBe('aporte');
    await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c4', categoria: 'Groceries' });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM financas_categoria_painel WHERE tipo='lancamento' AND chave='c4'`);
    expect(rows[0].n).toBe(1);
    expect((await pool.query(`SELECT categoria, classe FROM financas_lancamentos WHERE id_transacao='c4'`)).rows[0]).toEqual({ categoria: 'Groceries', classe: 'despesa' });
  });

  it('regra por pessoa: usa o documento do lançamento; sem documento é erro', async () => {
    await ins('c5', 'PIX FULANO', 'Transfers', '12345678901', 'Fulano');
    await ins('c6', 'PIX FULANO DE TAL', 'Transfers', '12345678901', 'Fulano');
    expect(await queries.salvarRegra({ tipo: 'doc', idTransacao: 'c5', categoria: 'Gifts' })).toMatchObject({ afetados: 2 });
    expect(await queries.salvarRegra({ tipo: 'doc', idTransacao: 'c3', categoria: 'Gifts' })).toEqual({ erro: 'Este lançamento não tem CPF/CNPJ da contraparte.' });
  });

  it('apagar: volta ao banco, ou a outra regra que ainda valha', async () => {
    await ins('c7', 'MERCADINHO BOM', 'Shopping', null);
    const fraca = await queries.salvarRegra({ tipo: 'texto', idTransacao: 'c7', texto: 'mercadinho', categoria: 'Groceries' });
    const forte = await queries.salvarRegra({ tipo: 'lancamento', idTransacao: 'c7', categoria: 'Gifts' });
    expect('id' in forte && (await queries.apagarRegra(forte.id))).toEqual({ afetados: 1 });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='c7'`)).rows[0].categoria).toBe('Groceries');
    expect('id' in fraca && (await queries.apagarRegra(fraca.id))).toEqual({ afetados: 1 });
    expect((await pool.query(`SELECT categoria FROM financas_lancamentos WHERE id_transacao='c7'`)).rows[0].categoria).toBe('Shopping');
    expect(await queries.apagarRegra(999999)).toBeNull();
  });

  it('texto com % e _ casa literalmente', async () => {
    await ins('c8', 'PAGTO 100% SAUDE', 'Shopping', null);
    await ins('c9', 'PAGTO 1000 SAUDE', 'Shopping', null);
    expect(await queries.previaRegra({ tipo: 'texto', idTransacao: 'c8', texto: '100% saude', categoria: 'Healthcare' })).toMatchObject({ afetados: 1 });
  });
  it('texto: a mesma normalização no alcance e na precedência (ñ, espaço especial); nome sem documento', async () => {
    await ins('d1', 'PIÑATA  FESTAS', 'Shopping', '55566677788', 'FESTAS MEI 55566677788');
    expect(await queries.previaRegra({ tipo: 'texto', idTransacao: 'd1', texto: 'pinata festas', categoria: 'Gifts' })).toMatchObject({ afetados: 1 });
    expect((await queries.getLancamentoParaCorrigir('d1'))!.nomeContraparte).toBe('FESTAS MEI');
    await queries.salvarRegra({ tipo: 'doc', idTransacao: 'd1', categoria: 'Gifts' });
    expect(JSON.stringify(await queries.listarRegras())).not.toContain('55566677788');
  });
  it('trilha: "é dívida" pelo lançamento, "não é dívida" pela chave; o oposto substitui; apagar', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('tj1', '2041-01-05', 50, 'CREDIARIO LOJA Y 2/8', 'Shopping', 'Shopping', 'Crédito', 'B9', 'Ariane', 'despesa', 'Saída')`);
    expect(await queries.marcarDivida({ tipo: 'divida', idTransacao: 'tj1' })).toHaveProperty('id');
    const nao = await queries.marcarDivida({ tipo: 'nao_divida', chave: 'crediario loja y|B9', nome: 'crediario loja y' });
    const aj = await queries.listarAjustesTrilha();
    expect(aj.marcacoes.filter((m) => m.nome === 'crediario loja y').map((m) => m.tipo)).toEqual(['nao_divida']); // o oposto saiu
    expect('id' in nao && (await queries.apagarMarcacao(nao.id))).toBe(true);
    expect(await queries.apagarMarcacao(999999)).toBe(false);
    expect(await queries.marcarDivida({ tipo: 'divida', idTransacao: 'nao-existe' })).toEqual({ erro: 'Lançamento não encontrado.' });
    expect(await queries.marcarDivida({ tipo: 'nao_divida', chave: 'sem barra', nome: 'x' })).toEqual({ erro: 'Dívida inválida.' });
    // receita (ou pagamento de fatura pela conta) não entra na trilha: marcar seria enganoso
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, categoria_banco, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('tj2', '2041-01-06', 500, 'PIX RECEBIDO', 'Transfers', 'Transfers', 'Débito', 'B9', 'Ariane', 'receita', 'Entrada')`);
    expect(await queries.marcarDivida({ tipo: 'divida', idTransacao: 'tj2' })).toEqual({ erro: 'Só despesa ou parcela no cartão entra na trilha.' });
  });

  it('trilha: metas gravadas e apagadas (volta ao padrão)', async () => {
    expect(await queries.getMetasTrilha()).toEqual({ mesesReserva: 6, metaPatrimonio: 0.1 });
    await queries.salvarMeta('meses_reserva', 3);
    await queries.salvarMeta('meta_patrimonio', 0.2);
    expect(await queries.getMetasTrilha()).toEqual({ mesesReserva: 3, metaPatrimonio: 0.2 });
    expect((await queries.listarAjustesTrilha()).metas).toEqual([{ chave: 'meses_reserva', valor: 3 }, { chave: 'meta_patrimonio', valor: 0.2 }]);
    expect(await queries.apagarMeta('meses_reserva')).toBe(true);
    expect((await queries.getMetasTrilha()).mesesReserva).toBe(6);
    await queries.apagarMeta('meta_patrimonio');
  });

  // F4 (pendência): "Agora:" mostrava a categoria crua; as telas usam categoria_efetiva (regras antigas nas vagas)
  it('F4: "Agora:" com a categoria que as telas mostram (regra antiga numa categoria vaga)', async () => {
    await pool.query(readFileSync('db/migrations/005_regras_por_documento.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_regras_categoria (padrao, contraparte_doc, categoria) VALUES ('PADARIA DO ZE F4', NULL, 'Groceries')`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, classe, banco, responsavel)
      VALUES ('f4ag', '2046-05-01', 12, 'PIX PADARIA DO ZE F4', 'Transfer - PIX', 'despesa', 'B', 'X')`);
    expect((await queries.getLancamentoParaCorrigir('f4ag'))!.categoria).toBe('Groceries');
  });
});
