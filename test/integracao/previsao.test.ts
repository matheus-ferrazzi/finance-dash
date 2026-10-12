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

  it('débito mensal: 6 meses fechados, mês vazio = 0, livre × travado, sem espelho; a regra muda a média', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('dm-1', '2029-04-10', 600, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-04-10'),
      ('dm-2', '2029-06-10', 300, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-06-10'),
      ('dm-3', '2029-06-11', 50, 'seguro', 'Insurance', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-06-11'),
      ('dm-4', '2029-07-10', 900, 'MORA CARTAO DE CREDITO', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-07-10'),
      ('dm-5', '2029-08-10', 100, 'mercado', 'Groceries', 'Crédito', 'X', 'Ariane', 'despesa', 'Saída', '2029-08-10'),
      ('dm-6', '2029-09-10', 150, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2029-09-10')`);
    const meses = await queries.getDebitoMensal('Ariane', '2029-10-15');
    expect(meses).toEqual([
      { mes: '2029-04', livre: 600, fixo: 0 }, { mes: '2029-05', livre: 0, fixo: 0 }, { mes: '2029-06', livre: 300, fixo: 50 },
      { mes: '2029-07', livre: 0, fixo: 0 }, { mes: '2029-08', livre: 0, fixo: 0 }, { mes: '2029-09', livre: 150, fixo: 0 },
    ]);
    const b = await queries.getProjecaoBase('Ariane', '2029-10-15', { regraDebito: 'media3' });
    expect(b.despesaVariavelMediaMensal).toBe(50); // (0 + 0 + 150) / 3
  });

  it('realizado do mês filtra pela pessoa', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('rz-1', '2033-03-05', 1000, 'salario', 'Salary', 'Débito', 'X', 'Ariane', 'receita', 'Entrada', '2033-03-05'),
      ('rz-2', '2033-03-06', 300, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2033-03-06'),
      ('rz-3', '2033-03-07', 500, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2033-03-07')`);
    expect(await queries.getRealizado('2033-03', 'Ariane')).toMatchObject({ receita: 1000, debito: 300, saldo: 700 });
    expect(await queries.getRealizado('2033-03')).toMatchObject({ receita: 1000, debito: 800, saldo: 200 });
  });

  it('coerência: a linha do mês atual na lista fecha com o mesmo valor da home; o detalhe futuro fecha com a lista', async () => {
    const { linhasDaLista, detalheMesFuturo } = await import('../../src/lib/mesAMes');
    const hoje = '2026-08-15';
    const b = await queries.getProjecaoBase('casal', hoje);
    const proj = queries.computeProjecao(b, 24, hoje);
    const r = queries.computeRitmo(b, proj[0], hoje);
    const l = linhasDaLista(proj, [], null, r.diasRestantes, 31);
    expect(l[0]).toMatchObject({ tipo: 'atual', saldoFim: r.fechaCom });
    for (const k of [1, 2, 12]) {
      const d = detalheMesFuturo(b, proj[k], []);
      const t = Object.fromEntries(d.linhas.map((x) => [x.chave, x.total]));
      expect(t.entra - t.casa - t.debito - t.cartao).toBeCloseTo(l[k].sobra, 2);
    }
  });

  it('meses passados: previsto na véspera, real e saldo no fim reconstruído, por pessoa', async () => {
    await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo) VALUES ('mp-c', 'X', 'Ariane', 'checking', 900)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('mp-1', '2034-02-10', 200, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2034-02-10'),
      ('mp-2', '2034-03-10', 100, 'mercado', 'Groceries', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2034-03-10'),
      ('mp-3', '2034-03-11', 70, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2034-03-11')`);
    const r = await queries.getMesesPassados('Ariane', '2034-04-15');
    expect(r.map((m) => m.mes)).toEqual(['2034-01', '2034-02', '2034-03']);
    expect(r[1].real.debito).toBe(200);
    expect(r[2].saldoFim).toBe(900);       // nada depois de março
    expect(r[1].saldoFim).toBe(1000);      // desfaz os 100 de março (os 70 são de outra pessoa)
    expect(r[0].saldoFim).toBe(1200);
    expect(r[0].real).toMatchObject({ receita: 0, debito: 0, saldo: 0 }); // mês sem lançamento
    expect(typeof r[0].previsto.saldo).toBe('number');
    // cache: mesma pessoa e mês devolve o mesmo resultado; outra pessoa no mesmo mês não apaga
    expect((await queries.getMesesPassados('Ariane', '2034-04-15'))[0].previsto).toBe(r[0].previsto);
    await queries.getMesesPassados('Matheus', '2034-04-15');
    expect((await queries.getMesesPassados('Ariane', '2034-04-20'))[1].previsto).toBe(r[1].previsto);
  });

  it('meses passados: saldo no início + sobra + transferências e aplicações = saldo no fim', async () => {
    await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo) VALUES ('ct-c', 'X', 'Matheus', 'checking', 0)
      ON CONFLICT (id_conta) DO NOTHING`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('ct-1', '2036-02-05', 1000, 'salario', 'Salary', 'Débito', 'X', 'Matheus', 'receita', 'Entrada', '2036-02-05'),
      ('ct-2', '2036-02-06', 300, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2036-02-06'),
      ('ct-3', '2036-02-07', 250, 'pix da outra conta', 'Transfers', 'Débito', 'X', 'Matheus', 'transferencia_interna', 'Entrada', '2036-02-07')`);
    const r = await queries.getMesesPassados('Matheus', '2036-04-10');
    const fev = r[1];
    expect(fev.mes).toBe('2036-02');
    expect(fev.real.saldo).toBe(700);
    expect(fev.saldoInicio).toBe(r[0].saldoFim);
    expect(fev.saldoFim - fev.saldoInicio).toBe(950);
  });

  it('meses passados: o real e o saldo no fim acompanham lançamento que chega depois (só o previsto fica em cache)', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('mc-1', '2035-02-10', 100, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2035-02-10')`);
    const antes = await queries.getMesesPassados('Matheus', '2035-04-01');
    expect(antes[2].real.debito).toBe(0);
    // sincronização atrasada: o lançamento de 31/03 chega depois do primeiro acesso do mês
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('mc-2', '2035-03-31', 40, 'mercado', 'Groceries', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2035-04-01')`);
    const depois = await queries.getMesesPassados('Matheus', '2035-04-01');
    expect(depois[2].real.debito).toBe(40);
    expect(depois[1].saldoFim - antes[1].saldoFim).toBe(40); // desfaz a saída de março no saldo do fim de fevereiro
    expect(depois[2].previsto).toBe(antes[2].previsto);
  });
  it('visão individual: compromisso do casal entra com a parte que a pessoa paga (6 meses); as duas somam o casal', async () => {
    await pool.query(`INSERT INTO financas_compromissos (nome, categoria, valor, responsavel, data_inicio) VALUES
      ('aluguel teste', 'Housing', 1000, 'casal', '2037-01-01'), ('agua teste', 'Water', 100, 'casal', '2037-01-01'),
      ('gas teste', 'Gas', 60, 'casal', '2037-01-01'), ('emprestimo teste', 'Loans and financing', 400, 'casal', '2037-01-01')`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('pc-1', '2037-04-05', 1000, 'aluguel', 'Housing', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2037-04-05'),
      ('pc-2', '2037-05-05', 1000, 'aluguel', 'Housing', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2037-05-05'),
      ('pc-3', '2037-05-08', 90, 'agua', 'Water', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2037-05-08'),
      ('pc-4', '2037-05-09', 30, 'agua', 'Water', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2037-05-09'),
      ('pc-5', '2036-01-05', 999, 'aluguel antigo', 'Housing', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2036-01-05'),
      ('pc-6', '2037-05-12', 700, 'emprestimo pessoal', 'Loans and financing', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2037-05-12'),
      ('pc-7', '2037-07-05', 1000, 'aluguel do mes', 'Housing', 'Débito', 'X', 'Matheus', 'despesa', 'Saída', '2037-07-05')`);
    try {
      const hoje = '2037-07-10';
      const [a, m, c] = await Promise.all(['Ariane', 'Matheus', 'casal'].map((r) => queries.getProjecaoBase(r as any, hoje)));
      const v = (b: any, cat: string) => b.compromissosManuais.find((x: any) => x.categoria === cat)?.valor;
      expect([v(a, 'Housing'), v(a, 'Water'), v(a, 'Gas')]).toEqual([0, 75, 30]); // fora da janela de 6 meses não conta; Gas sem histórico: meio a meio
      expect([v(m, 'Housing'), v(m, 'Water'), v(m, 'Gas')]).toEqual([1000, 25, 30]);
      for (const cat of ['Housing', 'Water', 'Gas', 'Loans and financing']) expect(v(a, cat) + v(m, cat)).toBe(v(c, cat));
      // fora das contas da casa, gasto pessoal da categoria não decide a parte: meio a meio
      expect(v(a, 'Loans and financing')).toBe(200);
      // o aluguel do mês que o Matheus pagou aparece no "pago pelo casal" da visão da Ariane
      expect(a.mesCorrente.casaNoMesCasalPorCategoria).toMatchObject({ Housing: 1000 });
      // o cadastro continua com o valor cheio
      expect(a.compromissosCadastrados.find((x) => x.categoria === 'Housing')!.valor).toBe(1000);
    } finally {
      await pool.query(`UPDATE financas_compromissos SET ativo = false WHERE nome LIKE '% teste'`);
    }
  });
});
