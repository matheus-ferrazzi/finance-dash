import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Roda só com TEST_DATABASE_URL (Postgres descartável). Ver README, seção do worker.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('getProjecaoBase com hoje no passado (integração)', () => {
  let pool: Pool;
  let queries: typeof import('../../src/lib/queries');

  beforeAll(async () => {
    const u = new URL(url!);
    // o painel lê a conexão das variáveis de ambiente na importação
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    queries = await import('../../src/lib/queries');
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
  });

  it('não enxerga lançamento posterior a hoje como já gasto nem como agendado no mês', async () => {
    // criado_em = quando a linha passou a existir no banco (é isso que diz se era "conhecida" em hoje)
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
      VALUES ('jul', '2026-07-10', 100, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-07-11'),
             ('set', '2026-09-10', 999, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-09-11'),
             ('ago-agendado', '2026-08-20', 50, 'boleto', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-08-05'),
             ('ago-depois', '2026-08-25', 70, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2026-08-26')`);
    const base = await queries.getProjecaoBase('casal', '2026-08-15');
    // em 15/08: o de 20/08 já estava agendado (gravado em 05/08); o de 25/08 e o de setembro ainda não existiam
    expect(base.mesCorrente.variavelJaGasto).toBe(0);
    expect(base.mesCorrente.agendadoRestante).toBe(50);
    const cedo = await queries.getProjecaoBase('casal', '2026-07-31');
    expect(cedo.mesCorrente.variavelJaGasto).toBe(100);
  });

  it('crédito por vencimento: fatura_id exato; fatura_prevista + deslocamento aprendido da conta; senão mês seguinte', async () => {
    // conta "neon": fatura_prevista é o mês ANTERIOR ao vencimento (aprende +1 pelo lançamento ligado à fatura)
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES ('fat-ago', 'neon', '2026-08-05', 300)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id, fatura_id, fatura_prevista)
      VALUES ('c1', '2026-07-10', 100, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2026-07-10', 'neon', 'fat-ago', '2026-07'),
             ('c2', '2026-08-10', 40, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2026-08-10', 'neon', NULL, '2026-08'),
             ('c3', '2026-08-12', 25, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2026-08-12', 'nu', NULL, NULL)`);
    const base = await queries.getProjecaoBase('casal', '2026-08-15');
    expect(base.creditoPorVencimento['2026-08']).toBe(100);  // pelo fatura_id
    expect(base.creditoPorVencimento['2026-09']).toBe(65);   // 40 (prevista ago + 1) + 25 (sem nada: mês seguinte)
    expect(base.faturaReal).toEqual({ '2026-08': 300 });
  });

  it('receita sem documento agrupa pela descrição sem dígitos e com espaços normalizados', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
      VALUES ('r1', '2026-05-05', 3000, 'PIX RECEBIDO  SILVA 0501', 'Débito', 'Itaú', 'Matheus', 'receita', 'Entrada', '2026-05-05'),
             ('r2', '2026-06-05', 3000, 'PIX RECEBIDO SILVA 0602', 'Débito', 'Itaú', 'Matheus', 'receita', 'Entrada', '2026-06-05')`);
    const base = await queries.getProjecaoBase('casal', '2026-07-01');
    expect(base.fontesReceita.map((f) => [f.nome, f.valor])).toEqual([['pix recebido silva', 3000]]);
  });

  it('fechamento da linha do mês (home) = fechaCom da previsão', async () => {
    const { serieDoMes } = await import('../../src/lib/linhaDoMes');
    const hoje = '2026-08-15';
    const b = await queries.getProjecaoBase('casal', hoje);
    const m0 = queries.computeProjecao(b, 1, hoje)[0];
    const r = queries.computeRitmo(b, m0, hoje);
    const entra = b.mesCorrente.receitasAReceber.reduce((s, x) => s + x.valor, 0);
    const s = serieDoMes({ mes: '2026-08', hoje, saldoHoje: b.saldoContasAtual, movimentos: {},
      receitas: b.mesCorrente.receitasAReceber.map((x) => ({ dia: x.diaTipico, valor: x.valor })),
      aindaSai: b.saldoContasAtual + entra - r.fechaCom });
    expect(s.fechamento).toBeCloseTo(r.fechaCom, 2);
  });

  it('conta travada no débito fica fora do ritmo (fixoJaGasto) e o perfil mede o que sai depois de hoje', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
      VALUES ('p-ini', '2026-10-03', 300, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2026-10-03'),
             ('p-fim', '2026-10-25', 100, 'mercado', 'Groceries', 'Débito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2026-10-25'),
             ('cons', '2026-11-02', 575, 'BOLETO CONSORCIO', 'Consortium', 'Débito', 'Santander', 'Ariane', 'despesa', 'Saída', '2026-11-02'),
             ('livre', '2026-11-05', 40, 'padaria', 'Groceries', 'Débito', 'Santander', 'Ariane', 'despesa', 'Saída', '2026-11-05')`);
    const base = await queries.getProjecaoBase('Ariane', '2026-11-10');
    expect(base.mesCorrente.fixoJaGasto).toBe(575);
    expect(base.mesCorrente.variavelJaGasto).toBe(40);
    expect(base.fracaoRestanteDebito).toBeCloseTo(0.25); // em out: 100 de 400 saiu depois do dia 10
  });
});
