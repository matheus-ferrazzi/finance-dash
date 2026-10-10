import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('contas do mês (integração)', () => {
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
    await pool.query(readFileSync('db/migrations/003_contas_do_mes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/004_contas_pela_tela.sql', 'utf8'));
    await pool.query(`INSERT INTO financas_contas_fixas (id, nome, responsavel, valor_previsto, padrao, inicio, ordem) VALUES
      (1, 'Seguro', 'Ariane', 330.35, 'SEGURADORA', '2026-01-01', 1), (2, 'Sabesp', 'Ariane', 86, 'SABESP', '2026-01-01', 2),
      (3, 'Internet', 'Matheus', 120, 'VIVO FIBRA', '2026-01-01', 1)`);
    await pool.query(`SELECT setval('financas_contas_fixas_id_seq', 3)`); // ids fixos acima: a sequência continua depois deles
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento) VALUES
      ('s', '2026-09-01', 330.35, 'BOLETO SEGURADORA EXEMPLO', 'Insurance', 'Débito', 'Santander', 'Ariane', 'despesa', 'Saída'),
      ('r', '2026-09-01', 4000, 'PIX RECEBIDO SALARIO', 'Income', 'Débito', 'Santander', 'Ariane', 'receita', 'Entrada'),
      ('e', '2026-09-02', 86, 'SABESP ESTORNO', 'Water', 'Débito', 'Santander', 'Ariane', 'estorno', 'Entrada')`);
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('monta o mês da pessoa: paga pelo banco, entrada não confirma conta, salário no topo', async () => {
    const r = await queries.getContasDoMes('Ariane', '2026-09');
    expect(r.entrou).toBe(4000);
    expect(r.itens.map((i) => [i.nome, i.status, i.pago])).toEqual([['Seguro', 'pago', 330.35], ['Sabesp', 'falta', null]]);
  });

  it('casal traz as contas das duas pessoas', async () => {
    const r = await queries.getContasDoMes('casal', '2026-09');
    expect(r.itens.map((i) => i.nome).sort()).toEqual(['Internet', 'Sabesp', 'Seguro']);
  });

  it('✓ manual grava, fica "a confirmar" e pode ser desfeito; repetir o ✓ não duplica', async () => {
    const id = await queries.criarMarca({ mes: '2026-09', contaId: 2, responsavel: 'Ariane', nome: null, valor: null, pago: true });
    await queries.criarMarca({ mes: '2026-09', contaId: 2, responsavel: 'Ariane', nome: null, valor: null, pago: true });
    let r = await queries.getContasDoMes('Ariane', '2026-09');
    expect(r.itens.find((i) => i.nome === 'Sabesp')).toMatchObject({ status: 'a_confirmar', marcaId: id });
    await queries.apagarMarca(id);
    r = await queries.getContasDoMes('Ariane', '2026-09');
    expect(r.itens.find((i) => i.nome === 'Sabesp')?.status).toBe('falta');
  });

  it('avulsa entra no mês e é confirmada por pagamento de mesmo valor', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento)
      VALUES ('ipva', '2026-09-04', 274.19, 'PAGAMENTO IPVA', 'Taxes', 'Débito', 'Santander', 'Ariane', 'despesa', 'Saída')`);
    await queries.criarMarca({ mes: '2026-09', contaId: null, responsavel: 'Ariane', nome: 'IPVA', valor: 274.19, pago: true });
    const r = await queries.getContasDoMes('Ariane', '2026-09');
    expect(r.itens.at(-1)).toMatchObject({ nome: 'IPVA', status: 'pago', avulsa: true });
  });

  it('tirar do mês e depois marcar ✓ troca a marcação (não duplica); desfazer volta para "falta"', async () => {
    const id = await queries.criarMarca({ mes: '2026-08', contaId: 2, responsavel: 'Ariane', nome: null, valor: null, pago: false });
    let r = await queries.getContasDoMes('Ariane', '2026-08');
    expect(r.tiradas.map((t) => t.nome)).toEqual(['Sabesp']);
    expect(await queries.criarMarca({ mes: '2026-08', contaId: 2, responsavel: 'Ariane', nome: null, valor: null, pago: true })).toBe(id);
    r = await queries.getContasDoMes('Ariane', '2026-08');
    expect(r.itens.find((i) => i.nome === 'Sabesp')?.status).toBe('a_confirmar');
    await queries.apagarMarca(id);
    r = await queries.getContasDoMes('Ariane', '2026-08');
    expect(r.itens.find((i) => i.nome === 'Sabesp')?.status).toBe('falta');
  });

  it('repetir todo mês: avulsa confirmada vira conta fixa pelo pagamento real; sem confirmação, recusa', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento) VALUES
      ('acad9', '2026-07-05', 99.9, 'PIX ENVIADO Academia Exemplo 07/26', 'Sports', 'Débito', 'Nubank', 'Ariane', 'despesa', 'Saída'),
      ('acad10', '2026-08-06', 99.9, 'PIX ENVIADO Academia Exemplo 08/26', 'Sports', 'Débito', 'Nubank', 'Ariane', 'despesa', 'Saída')`);
    const semBanco = await queries.criarMarca({ mes: '2026-07', contaId: null, responsavel: 'Ariane', nome: 'Curso', valor: 10, pago: true });
    await expect(queries.repetirTodoMes(semBanco)).rejects.toThrow(/banco/);

    const id = await queries.criarMarca({ mes: '2026-07', contaId: null, responsavel: 'Ariane', nome: 'Academia', valor: 99.9, pago: true });
    await queries.repetirTodoMes(id);
    const jul = await queries.getContasDoMes('Ariane', '2026-07');
    expect(jul.itens.filter((i) => i.nome === 'Academia')).toMatchObject([{ status: 'pago', avulsa: false, pago: 99.9 }]);
    const ago = await queries.getContasDoMes('Ariane', '2026-08');
    expect(ago.itens.find((i) => i.nome === 'Academia')).toMatchObject({ status: 'pago', pago: 99.9 });
  });

  it('alterar valor da conta fixa vale do mês em diante; avulsa só se o banco ainda não confirmou', async () => {
    await queries.alterarValorConta(1, 400, '2026-11');
    expect((await queries.getContasDoMes('Ariane', '2026-11')).itens.find((i) => i.nome === 'Seguro')?.previsto).toBe(400);
    expect((await queries.getContasDoMes('Ariane', '2026-10')).itens.find((i) => i.nome === 'Seguro')?.previsto).toBe(330.35);

    const aberta = await queries.criarMarca({ mes: '2026-11', contaId: null, responsavel: 'Ariane', nome: 'Presente', valor: 50, pago: true });
    await queries.alterarValorAvulsa(aberta, 80);
    expect((await queries.getContasDoMes('Ariane', '2026-11')).itens.find((i) => i.nome === 'Presente')?.previsto).toBe(80);

    const ipva = (await queries.getContasDoMes('Ariane', '2026-09')).itens.find((i) => i.nome === 'IPVA')!;
    await expect(queries.alterarValorAvulsa(ipva.marcaId!, 1)).rejects.toThrow(/banco/);
  });

  it('remover de vez: some a partir do mês seguinte ao último, e o histórico continua', async () => {
    await queries.encerrarConta(2, '2026-09');
    expect((await queries.getContasDoMes('Ariane', '2026-09')).itens.map((i) => i.nome)).toContain('Sabesp');
    expect((await queries.getContasDoMes('Ariane', '2026-10')).itens.map((i) => i.nome)).not.toContain('Sabesp');
  });
});
