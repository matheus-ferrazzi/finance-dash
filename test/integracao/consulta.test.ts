import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). 28/10 (Zeca fase 3): a consulta livre tem que bater com o
// gasto_periodo (a tela de Gastos) e o dia a dia não pode ter aluguel nem dívida. Valores inventados.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('consulta livre do Zeca (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');
  let consulta: typeof import('../../src/lib/consulta');
  let bot: typeof import('../../src/lib/bot');
  let dinheiro: typeof import('../../src/lib/dinheiro');
  const per = { inicio: '2033-04-01', fimExcl: '2033-05-01', label: 'abr/33' };
  const pedido = (x: object = {}) => ({
    oQue: 'gastos' as const, periodo: per, pessoa: 'casal' as const, grupo: null, categoria: null, texto: null, forma: null,
    min: null, max: null, agrupar: 'grupo' as const, ordem: 'valor' as const, limite: 20, ...x,
  });

  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    for (const m of ['001_c1_ingestao', '006_categorias_painel', '007_trilha_ajustes', '010_bot_acoes', '011_gastos_dinheiro']) {
      await pool.query(readFileSync(`db/migrations/${m}.sql`, 'utf8'));
    }
    const l = (id: string, data: string, valor: number, descricao: string, categoria: string, forma: string, classe = 'despesa', quem = 'Matheus') =>
      `('${id}', '${data}', ${valor}, '${descricao}', '${categoria}', '${forma}', 'B', '${quem}', '${classe}', '${classe === 'receita' ? 'Entrada' : 'Saída'}', '${data}')`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ${[
        l('c1', '2033-04-03', 210, 'MERCADO BOM', 'Groceries', 'Débito'),
        l('c2', '2033-04-04', 80, 'RESTAURANTE X', 'Eating out', 'Crédito', 'despesa', 'Ariane'),
        l('c3', '2033-04-05', 1500, 'ALUGUEL', 'Housing', 'Débito'),
        l('c4', '2033-04-06', 367.79, 'Renegociação de pendências 1/4', 'Transfers', 'Débito'),
        l('c5', '2033-04-07', 40, 'PADARIA', 'Bakery', 'Débito', 'despesa', 'Ariane'),
        l('c6', '2033-04-08', 5000, 'SALARIO', 'Salary', 'Débito', 'receita'),
      ].join(',')}`);
    await pool.query(`INSERT INTO financas_gastos_dinheiro (data, valor, descricao, categoria, responsavel) VALUES ('2033-04-09', 30, 'feira', 'Groceries', 'Ariane')`);
    queries = await import('../../src/lib/queries');
    consulta = await import('../../src/lib/consulta');
    bot = await import('../../src/lib/bot');
    dinheiro = await import('../../src/lib/dinheiro');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('gastos por grupo = gasto_periodo (com dinheiro vivo, sem dívida antiga)', async () => {
    const r = consulta.agregarConsulta(await queries.getLinhasConsulta(pedido()), pedido());
    const g = bot.montarGasto(await queries.getGastoPorCategoriaEntre(per.inicio, per.fimExcl),
      null, await dinheiro.getDinheiroPorCategoriaEntre(per.inicio, per.fimExcl));
    expect(r.total).toBe(g.total);
    expect(r.totalDinheiro).toBe(g.totalDinheiro);
    expect(r.linhas.map((x) => [x.chave, x.valor])).toEqual(g.itens.map((x) => [x.nome, x.valor]));
  });
  // o recorte é o do ritmo (variavel_gasto da previsão), que conta a dívida paga no débito: tem que bater com ele
  it('dia a dia = recorte do ritmo: sem aluguel, sem crédito, sem dinheiro vivo', async () => {
    const p = pedido({ oQue: 'dia_a_dia', agrupar: 'loja' });
    const r = consulta.agregarConsulta(await queries.getLinhasConsulta(p), p);
    expect(r.linhas.map((x) => x.chave).sort()).toEqual(['MERCADO BOM', 'PADARIA', 'Renegociação de pendências 1/4']);
    expect(r.total).toBe(617.79);
  });
  it('entradas: só a receita; pessoa e texto filtram', async () => {
    const e = pedido({ oQue: 'entradas', agrupar: 'nada' });
    expect(consulta.agregarConsulta(await queries.getLinhasConsulta(e), e).total).toBe(5000);
    const t = pedido({ texto: 'mercado', agrupar: 'nada' });
    expect(consulta.agregarConsulta(await queries.getLinhasConsulta(t), t).total).toBe(210);
    const a = pedido({ pessoa: 'Ariane', agrupar: 'nada' });
    expect(consulta.agregarConsulta(await queries.getLinhasConsulta(a), a).total).toBe(150);
  });
});
