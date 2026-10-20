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
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/006_categorias_painel.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/007_trilha_ajustes.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/013_previsto_foto.sql', 'utf8'));
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

  it('N9: estorno de compra e desconto de antecipação abatem a fatura do vencimento; crédito de parcelamento não', async () => {
    // medido contra financas_faturas_historico (18/10): fatura real = compras − estorno de compra;
    // jul e ago/26 do Matheus fecharam iguais ao previsto mesmo com "Crédito de parcelamento" no ciclo
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id, fatura_prevista)
      VALUES ('n9-c', '2041-03-03', 200, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2041-03-03', 'n9', '2041-04'),
             ('n9-e', '2041-03-05', 20, 'Estorno de compra', 'Crédito', 'Nubank', 'Ariane', 'estorno', 'Entrada', '2041-03-05', 'n9', '2041-04'),
             ('n9-q', '2041-03-06', 30, 'Crédito de "LOJA X"', 'Crédito', 'Nubank', 'Ariane', 'estorno', 'Entrada', '2041-03-06', 'n9', '2041-04'),
             ('n9-d', '2041-03-07', 10, 'Desconto de antecipação', 'Crédito', 'Nubank', 'Ariane', 'estorno', 'Entrada', '2041-03-07', 'n9', '2041-04'),
             ('n9-p', '2041-03-08', 500, 'Crédito de parcelamento', 'Crédito', 'Nubank', 'Ariane', 'estorno', 'Entrada', '2041-03-08', 'n9', '2041-04'),
             ('n9-x', '2041-03-09', 999, 'CRED RENEG DIVIDA', 'Crédito', 'Bradesco', 'Matheus', 'estorno', 'Entrada', '2041-03-09', 'n9b', '2041-04')`);
    const base = await queries.getProjecaoBase('casal', '2041-03-20');
    expect(base.creditoPorVencimento['2041-04']).toBeCloseTo(140, 2);
  });

  it('N6/L3: cartão com compras faltando (Neon) põe na próxima fatura o limite usado que nenhuma compra explica', async () => {
    // 4 faturas fechadas; em 2 delas o total passou das compras gravadas → cartão incompleto
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES
      ('n6-1', 'n6', '2042-06-05', 100), ('n6-2', 'n6', '2042-07-05', 300), ('n6-3', 'n6', '2042-08-05', 250), ('n6-4', 'n6', '2042-09-05', 80),
      ('n6c-1', 'n6c', '2042-08-10', 50), ('n6c-2', 'n6c', '2042-09-10', 60)`);
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, limite_total, limite_disponivel, valor_fatura_atual)
      VALUES ('n6', 'Neon', 'Ariane', 500, 100, 400), ('n6c', 'Nubank', 'Ariane', 500, 400, 100)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id, fatura_id)
      VALUES ('n6-a', '2042-05-10', 100, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2042-05-10', 'n6', 'n6-1'),
             ('n6-b', '2042-06-10', 90, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2042-06-10', 'n6', 'n6-2'),
             ('n6-c', '2042-07-10', 80, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2042-07-10', 'n6', 'n6-3'),
             ('n6-d', '2042-08-10', 80, 'loja', 'Crédito', 'Neon', 'Ariane', 'despesa', 'Saída', '2042-08-10', 'n6', 'n6-4'),
             ('n6c-a', '2042-07-15', 50, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2042-07-15', 'n6c', 'n6c-1'),
             ('n6c-b', '2042-08-15', 60, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2042-08-15', 'n6c', 'n6c-2'),
             ('n6c-c', '2042-09-15', 30, 'loja', 'Crédito', 'Nubank', 'Ariane', 'despesa', 'Saída', '2042-09-15', 'n6c', NULL)`);
    const base = await queries.getProjecaoBase('casal', '2042-09-20');
    // Neon: usado 400, nenhuma compra a vencer conhecida → 400 na fatura de out; Nubank (completo): só a compra de 30
    expect(base.creditoPorVencimento['2042-10']).toBeCloseTo(430, 2);
    const ari = await queries.getProjecaoBase('Matheus', '2042-09-20');
    expect(ari.creditoPorVencimento['2042-10'] ?? 0).toBe(0);
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
  it('dados da trilha: dívida futura, atraso, aplicação líquida e aplicado', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('tr-1', '2038-05-10', 100, 'RENEGOCIAÇÃO DE PENDÊNCIAS 5/7', 'Loans and financing', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-04-01'),
      ('tr-2', '2038-06-10', 100, 'RENEGOCIAÇÃO DE PENDÊNCIAS 6/7', 'Loans and financing', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-04-01'),
      ('tr-3', '2038-03-20', 30, 'JUROS DE MORA', 'Late payment and overdraft costs', 'Crédito', 'B1', 'Matheus', 'despesa', 'Saída', '2038-03-20'),
      ('tr-4', '2038-02-05', 200, 'APLICAÇÃO RDB', 'Investments', 'Débito', 'B1', 'Ariane', 'transferencia_interna', 'Saída', '2038-02-05'),
      ('tr-5', '2038-03-05', 50, 'RESGATE RDB', 'Investments', 'Débito', 'B1', 'Ariane', 'transferencia_interna', 'Entrada', '2038-03-05'),
      ('tr-6', '2038-03-06', 1, 'REND PAGO APLIC AUT', 'Proceeds interests and dividends', 'Débito', 'B1', 'Ariane', 'receita', 'Entrada', '2038-03-06'),
      ('tr-7', '2038-03-07', 80, 'PIX APLICACAO', 'Transfers', 'Débito', 'B1', 'Ariane', 'aporte', 'Saída', '2038-03-07'),
      ('tr-8', '2038-02-11', 40, 'LOJA X 2/5', 'Shopping', 'Crédito', 'B1', 'Ariane', 'despesa', 'Saída', '2038-02-11')`);
    const d = await queries.getTrilhaDados('2038-04-15');
    expect(d.dividas).toEqual([{ chave: 'renegociação de pendências|B1', nome: 'renegociação de pendências', banco: 'B1', plano: null, valorParcela: 100, restantes: 2, fim: '2038-06' }]);
    expect(d.atrasos).toContainEqual({ mes: '2038-03', motivo: 'juros' });
    expect(d.aplicacaoMensal).toEqual([{ mes: '2038-01', valor: 0 }, { mes: '2038-02', valor: 200 }, { mes: '2038-03', valor: 30 }]);
    expect(d.passados.map((p) => p.mes)).toEqual(['2038-01', '2038-02', '2038-03']);
    expect(d.sobraPrevista).toHaveLength(24);
    expect(typeof d.textoMeta).toBe('string');
    expect(d.aplicado).toBeGreaterThanOrEqual(0);
    expect(d.metas).toEqual({ mesesReserva: 6, metaPatrimonio: 0.1 });
    // F4b: marcar "não é dívida" tira a renegociação da trilha
    await queries.marcarDivida({ tipo: 'nao_divida', chave: 'renegociação de pendências|B1', nome: 'renegociação de pendências' });
    expect((await queries.getTrilhaDados('2038-04-15')).dividas).toEqual([]);
  });
  it('dados da trilha: parcelamento de fatura e encargo vêm como pagamento_fatura no cartão; pagar a fatura pelo débito não é dívida', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('tf-1', '2039-05-08', 70, 'PARCELAMENTO DE FATURA 4/6', 'Credit card payment', 'Crédito', 'B3', 'Ariane', 'pagamento_fatura', 'Saída', '2039-04-01'),
      ('tf-2', '2039-03-09', 12, 'ENC ATRASO PARC FATURA', 'Credit card fees', 'Crédito', 'B3', 'Ariane', 'pagamento_fatura', 'Saída', '2039-03-09'),
      ('tf-3', '2039-04-05', 900, 'PAGAMENTO FATURA PARC CARTAO', 'Credit card payment', 'Débito', 'B3', 'Ariane', 'pagamento_fatura', 'Saída', '2039-04-05')`);
    const d = await queries.getTrilhaDados('2039-04-15');
    expect(d.dividas).toEqual([{ chave: 'parcelamento de fatura|B3', nome: 'parcelamento de fatura', banco: 'B3', plano: null, valorParcela: 70, restantes: 1, fim: '2039-05' }]);
    expect(d.atrasos).toContainEqual({ mes: '2039-03', motivo: 'juros' });
  });
  // auditoria 13/10 (N1): "GASTOS CARTAO" no débito é o pagamento da fatura de um cartão sem histórico
  // de fatura na Pluggy (Bradesco) — dinheiro que sai de verdade, não espelho como "MORA CARTAO"
  it('N1: pagamento de cartão sem histórico entra no realizado; MORA CARTAO continua fora', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n1-1', '2041-03-07', 200, 'GASTOS CARTAO DE CREDITO - DOCTO: 1', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2041-03-07'),
      ('n1-2', '2041-03-12', 900, 'MORA CARTAO DE CREDITO - DOCTO: 2', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2041-03-12')`);
    expect(await queries.getRealizado('2041-03')).toMatchObject({ fatura: 200 });
  });

  it('N1: pagamento repetido de cartão sem histórico vira fatura mensal prevista; valor que mudou não', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n1-a', '2042-01-07', 123.45, 'GASTOS CARTAO DE CREDITO - DOCTO: 3', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2042-01-07'),
      ('n1-b', '2042-02-09', 123.45, 'GASTOS CARTAO DE CREDITO - DOCTO: 4', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2042-02-09'),
      ('n1-c', '2042-03-08', 123.45, 'GASTOS CARTAO DE CREDITO - DOCTO: 5', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2042-03-08')`);
    const abr = await queries.getProjecaoBase('casal', '2042-04-03');
    expect(abr.cartaoSemFatura).toEqual({ mensal: 123.45, pagoNoMes: 0 });
    // o mês de abril já pago: nada mais a sair nele
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n1-d', '2042-04-07', 123.45, 'GASTOS CARTAO DE CREDITO - DOCTO: 6', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2042-04-07')`);
    expect((await queries.getProjecaoBase('casal', '2042-04-10')).cartaoSemFatura).toEqual({ mensal: 123.45, pagoNoMes: 123.45 });
    // pela pessoa: a Ariane não tem esse cartão
    expect((await queries.getProjecaoBase('Ariane', '2042-04-10')).cartaoSemFatura).toEqual({ mensal: 0, pagoNoMes: 0 });
    // valores diferentes (fatura comum, não parcelada): não dá para prever
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n1-e', '2043-01-07', 1200, 'GASTOS CARTAO DE CREDITO - DOCTO: 7', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2043-01-07'),
      ('n1-f', '2043-02-07', 1700, 'GASTOS CARTAO DE CREDITO - DOCTO: 8', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2043-02-07'),
      ('n1-g', '2043-03-07', 1400, 'GASTOS CARTAO DE CREDITO - DOCTO: 9', 'Credit card payment', 'Débito', 'BX', 'Matheus', 'pagamento_fatura', 'Saída', '2043-03-07')`);
    expect((await queries.getProjecaoBase('casal', '2043-04-03')).cartaoSemFatura?.mensal).toBe(0);
  });

  // auditoria 13/10 (N3): a fatura do mês em andamento é vista por cartão — vencida já não sai mais
  // (o que não foi pago virou parcelamento/rotativo e aparece nas próximas); a vencer = total − o que o
  // cartão já recebeu (o Nubank grava o mesmo pagamento duas vezes: conta uma)
  it('N3: fatura que falta no mês, por cartão; parcelamento de fatura entra no vencimento', async () => {
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES
      ('n3-a', 'n3-cartao-a', '2044-05-02', 480), ('n3-b', 'n3-cartao-b', '2044-05-20', 800)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id) VALUES
      ('n3-1', '2044-05-02', 200, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'NA', 'Ariane', 'pagamento_fatura', 'Entrada', '2044-05-02', 'n3-cartao-a'),
      ('n3-2', '2044-05-15', 300, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'NB', 'Matheus', 'pagamento_fatura', 'Entrada', '2044-05-15', 'n3-cartao-b'),
      ('n3-3', '2044-05-15', 300, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'NB', 'Matheus', 'pagamento_fatura', 'Entrada', '2044-05-15', 'n3-cartao-b')`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id, fatura_prevista) VALUES
      ('n3-4', '2044-05-26', 120, 'Parcelamento de Fatura', 'Credit card payment', 'Crédito', 'NA', 'Ariane', 'pagamento_fatura', 'Saída', '2044-05-02', 'n3-cartao-a', '2044-06')`);
    const b = await queries.getProjecaoBase('casal', '2044-05-16');
    // cartão A venceu em 02/05 (o resto foi parcelado): 0; cartão B: 800 − 300 − 300. 19/10: dois pagamentos iguais
    // no mesmo dia são dois — a cópia "só data" do Nubank já sai na ingestão (semGemeosDePagamento, #42)
    expect(b.mesCorrente.faturaRestante).toBe(200);
    // a parcela do parcelamento de fatura vence com a fatura de junho
    expect(b.creditoPorVencimento['2044-06']).toBeCloseTo(120, 2);
    // mês sem nenhuma fatura no histórico: indefinido (a previsão volta à conta antiga)
    expect((await queries.getProjecaoBase('casal', '2045-05-16')).mesCorrente.faturaRestante).toBeUndefined();
  });

  it('N4: fatura = última fechada do histórico, com situação; o saldo devedor do cartão vira "limite usado"', async () => {
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, limite_total, limite_disponivel, valor_fatura_atual, data_vencimento) VALUES
      ('n4-nu', 'Nubank', 'Ariane', 600, 190, 410, '2047-10-02'),
      ('n4-neon', 'Neon', 'Ariane', 500, 200, 300, '2047-10-05'),
      ('n4-sem', 'Inter', 'Matheus', 0, 0, 0, '2047-11-10')`);
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES
      ('n4-h1', 'n4-nu', '2047-09-02', 150), ('n4-h2', 'n4-nu', '2047-10-02', 480),
      ('n4-h3', 'n4-neon', '2047-10-05', 170)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id) VALUES
      ('n4-1', '2047-10-02', 200, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'Nubank', 'Ariane', 'pagamento_fatura', 'Entrada', '2047-10-02', 'n4-nu'),
      ('n4-3', '2047-10-02', 280, 'Crédito de parcelamento', 'Credit card payment', 'Crédito', 'Nubank', 'Ariane', 'estorno', 'Entrada', '2047-10-02', 'n4-nu'),
      ('n4-4', '2047-10-02', 170, 'Pagamento Fatura', 'Credit card payment', 'Crédito', 'Neon', 'Ariane', 'pagamento_fatura', 'Entrada', '2047-10-02', 'n4-neon')`);
    const fs = await queries.getFaturas('casal', '2047-10-13');
    const nu = fs.find((f) => f.id === 'n4-nu')!;
    expect(nu).toMatchObject({ usado: 410, limite: 600, ultima: { vencimento: '2047-10-02', total: 480, pago: 200, parcelado: 280, situacao: 'parcelada', falta: 0 } });
    expect(fs.find((f) => f.id === 'n4-neon')!.ultima).toMatchObject({ vencimento: '2047-10-05', situacao: 'paga' });
    expect(fs.find((f) => f.id === 'n4-sem')!.ultima).toBeNull();
    // filtro por pessoa
    expect((await queries.getFaturas('Matheus', '2047-10-13')).map((f) => f.id)).toEqual(['n4-sem']);
    // 19/10: dois pagamentos iguais no mesmo dia são dois (a cópia do Nubank sai na ingestão)
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, limite_total, limite_disponivel, valor_fatura_atual, data_vencimento) VALUES
      ('n4-dois', 'Nubank', 'Matheus', 900, 900, 0, '2047-10-02')`);
    await pool.query(`INSERT INTO financas_faturas_historico (id, account_id, vencimento, total) VALUES ('n4-h4', 'n4-dois', '2047-10-02', 500)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, account_id) VALUES
      ('n4-5', '2047-10-01', 250, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'Nubank', 'Matheus', 'pagamento_fatura', 'Entrada', '2047-10-01', 'n4-dois'),
      ('n4-6', '2047-10-01', 250, 'Pagamento recebido', 'Credit card payment', 'Crédito', 'Nubank', 'Matheus', 'pagamento_fatura', 'Entrada', '2047-10-01', 'n4-dois')`);
    expect((await queries.getFaturas('Matheus', '2047-10-13')).find((f) => f.id === 'n4-dois')!.ultima).toMatchObject({ pago: 500, situacao: 'paga' });
  });

  it('N9: compromissos parcelados separam os planos da mesma dívida; parcela atual vem do campo', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, parcela_numero, parcela_total) VALUES
      ('n9-1', '2048-11-07', 800.5, 'Renegociação de pendências n9', 'Loans and financing', 'Crédito', 'N9', 'Matheus', 'despesa', 'Saída', '2026-10-05', 2, 3),
      ('n9-2', '2048-12-06', 800.5, 'Renegociação de pendências n9', 'Loans and financing', 'Crédito', 'N9', 'Matheus', 'despesa', 'Saída', '2026-10-05', 3, 3),
      ('n9-3', '2048-11-07', 350.5, 'Renegociação de pendências n9', 'Loans and financing', 'Crédito', 'N9', 'Matheus', 'despesa', 'Saída', '2026-10-05', 4, 8),
      ('n9-4', '2048-12-06', 350.5, 'Renegociação de pendências n9', 'Loans and financing', 'Crédito', 'N9', 'Matheus', 'despesa', 'Saída', '2026-10-05', 5, 8)`);
    const ps = (await queries.getCompromissosParcelados('casal')).filter((p) => p.banco === 'N9');
    expect(ps.map((p) => [p.valorParcela, p.restantes, p.parcelaAtual, p.parcelaTotal]).sort()).toEqual([[350.5, 2, 4, 8], [800.5, 2, 2, 3]]);
  });

  // N10: conta da casa paga no crédito sai do caixa pela fatura; contada também como "casa", saía duas vezes
  it('N10: casa paga no crédito não entra na casa (realizado, mês em andamento e média)', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n10-1', '2049-03-05', 100, 'TELEFONICA', 'Telecommunications', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2049-03-05'),
      ('n10-2', '2049-03-06', 35, 'VIVO NO CARTAO', 'Telecommunications', 'Crédito', 'X', 'Ariane', 'despesa', 'Saída', '2049-03-06'),
      ('n10-3', '2049-04-05', 100, 'TELEFONICA', 'Telecommunications', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2049-04-05'),
      ('n10-4', '2049-04-06', 35, 'VIVO NO CARTAO', 'Telecommunications', 'Crédito', 'X', 'Ariane', 'despesa', 'Saída', '2049-04-06')`);
    expect((await queries.getRealizado('2049-03')).casa).toBe(100);
    const b = await queries.getProjecaoBase('casal', '2049-04-10');
    expect(b.mesCorrente.casaNoMesPorCategoria.Telecommunications).toBe(100);
  });

  it('N12: travadas por categoria: o que já saiu no mês e a média de cada uma (a soma das médias = a média do travado)', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n12-1', '2050-04-02', 500, 'BOLETO CONSORCIO', 'Consortium', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2050-04-02'),
      ('n12-2', '2050-03-02', 500, 'BOLETO CONSORCIO', 'Consortium', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2050-03-02'),
      ('n12-3', '2050-03-03', 330, 'SUHAI', 'Insurance', 'Débito', 'X', 'Ariane', 'despesa', 'Saída', '2050-03-03')`);
    const b = await queries.getProjecaoBase('Ariane', '2050-04-10');
    expect(b.mesCorrente.fixoPorCategoria?.Consortium?.pago).toBe(500);
    expect(b.mesCorrente.fixoPorCategoria?.Insurance).toMatchObject({ pago: 0, ativa: true });
    // em junho o seguro não aparece em maio: acabou
    expect((await queries.getProjecaoBase('Ariane', '2050-06-10')).mesCorrente.fixoPorCategoria?.Insurance?.ativa ?? false).toBe(false);
    const somaMedias = Object.values(b.mesCorrente.fixoPorCategoria ?? {}).reduce((s, c) => s + c.media, 0);
    expect(somaMedias).toBeCloseTo(b.despesaFixaDebitoMedia ?? 0, 2);
  });

  it('N15: a foto do previsto (tirada no começo do mês) manda no previsto × real; fotografar não sobrescreve', async () => {
    const foto = { receita: 1, debito: 2, casa: 3, fatura: 4, saldo: -8 };
    await pool.query(`INSERT INTO financas_previsto_foto (resp, mes, componentes) VALUES ('casal', '2051-02', $1)`, [JSON.stringify(foto)]);
    const [p] = await queries.getMesesPassados('casal', '2051-03-15', 1);
    expect(p.previsto).toEqual(foto);
    const a = await queries.fotografarPrevisto('casal', '2051-04');
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('n15-1', '2051-03-10', 900, 'salario', 'Salary', 'Débito', 'X', 'Ariane', 'receita', 'Entrada', '2051-03-10')`);
    expect(await queries.fotografarPrevisto('casal', '2051-04')).toEqual(a);
    expect((await pool.query(`SELECT count(*)::int AS n FROM financas_previsto_foto WHERE mes = '2051-04'`)).rows[0].n).toBe(1);
  });

  it('Onda 2: dados dos avisos — conta negativa, juros recentes, orçamento até ontem/anteontem e compra fora do padrão', async () => {
    await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo) VALUES ('av-c1', 'AV', 'Ariane', 'CHECKING_ACCOUNT', -42.5)`);
    await pool.query(`INSERT INTO financas_orcamento (item, emoji, categorias, teto) VALUES ('Delivery av', '🛵', '{"Food delivery"}', 600)`);
    const ins = (id: string, data: string, valor: number, descricao: string, categoria: string, forma = 'Débito', classe = 'despesa') =>
      pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
        VALUES ($1, $2::date, $3, $4, $5, $6, 'AV', 'Matheus', $7, 'Saída', $2::date)`, [id, data, valor, descricao, categoria, forma, classe]);
    await ins('av-1', '2052-05-14', 6.5, 'JUROS DE MORA', 'Late payment and overdraft costs', 'Crédito');
    await ins('av-2', '2052-05-01', 9.99, 'JUROS DE MORA', 'Late payment and overdraft costs', 'Crédito'); // velho: fora
    await ins('av-3', '2052-05-13', 400, 'IFD*X', 'Food delivery');
    await ins('av-4', '2052-05-15', 100, 'IFD*Y', 'Food delivery');
    for (let i = 1; i <= 6; i++) await ins(`av-m${i}`, `2052-04-${String(10 + i).padStart(2, '0')}`, 60, 'LOJA', 'Shopping');
    await ins('av-5', '2052-05-15', 900, 'LOJA GRANDE', 'Shopping');
    const d = await queries.getDadosAvisos('2052-05-16');
    expect(d.saldos).toContainEqual({ banco: 'AV', responsavel: 'Ariane', saldo: -42.5 });
    expect(d.encargos).toEqual([{ banco: 'AV', responsavel: 'Matheus', valor: 6.5 }]);
    expect(d.orcamento.find((o) => o.item === 'Delivery av')).toMatchObject({ teto: 600, ateAnteontem: 400, ateOntem: 500 });
    expect(d.foraDoPadrao).toEqual([{ descricao: 'LOJA GRANDE', valor: 900, categoria: 'Shopping', mediana: 60 }]);
  });

  // D2-M10: o gráfico do diário (gasto livre por dia) e o ritmo (variavelJaGasto) têm que somar o mesmo
  it('D2-M10: soma do gasto livre por dia = variavelJaGasto da previsão', async () => {
    const ins = (id: string, data: string, valor: number, categoria: string, forma = 'Débito') =>
      pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em)
        VALUES ($1, $2::date, $3, 'x', $4, $5, 'M10', 'Ariane', 'despesa', 'Saída', $2::date)`, [id, data, valor, categoria, forma]);
    await ins('m10-1', '2053-07-02', 40, 'Groceries');
    await ins('m10-2', '2053-07-03', 25.5, 'Eating out');
    await ins('m10-3', '2053-07-03', 900, 'Housing');            // casa: fora do livre
    await ins('m10-4', '2053-07-04', 300, 'Insurance');          // travada: fora do livre
    await ins('m10-5', '2053-07-04', 70, 'Shopping', 'Crédito'); // crédito: fora (caixa)
    await ins('m10-6', '2053-07-05', 12, 'Groceries');
    const porDia = await queries.getGastoLivrePorDia('casal', '2053-07-05');
    const soma = porDia.reduce((s, d) => s + d.valor, 0);
    const b = await queries.getProjecaoBase('casal', '2053-07-05');
    expect(soma).toBeCloseTo(77.5, 2);
    expect(soma).toBeCloseTo(b.mesCorrente.variavelJaGasto, 2);
  });

  // F1: a receita já agendada (lançamento com data futura no mês) aparece no dia dela na linha do mês da home,
  // não espalhada como "menos saída" todo dia
  it('F1: receitas agendadas do mês por dia (conhecidas em hoje); a soma = receitaAgendada', async () => {
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('ra1', '2054-03-20', 700, 'PIX RECEBIDO', 'Transfers', 'Débito', 'RA', 'Ariane', 'receita', 'Entrada', '2054-03-05'),
      ('ra2', '2054-03-25', 300, 'REEMBOLSO', 'Transfers', 'Débito', 'RA', 'Ariane', 'receita', 'Entrada', '2054-03-05'),
      ('ra3', '2054-03-26', 50, 'NAO SABIDO', 'Transfers', 'Débito', 'RA', 'Ariane', 'receita', 'Entrada', '2054-03-15')`);
    const b = await queries.getProjecaoBase('casal', '2054-03-10');
    expect(b.mesCorrente.receitasAgendadas).toEqual([{ dia: 20, valor: 700 }, { dia: 25, valor: 300 }]);
    expect(b.mesCorrente.receitaAgendada).toBe(1000);
  });

  // auditoria 17/10 (N3 e M2): dois planos de renegociação com a mesma descrição; pagamento de fatura com
  // categoria Investments (a Pluggy marca assim o Pix do Itaú para a NU PAGAMENTOS)
  it('dados da trilha: dois planos da mesma renegociação não se fundem; pagamento de fatura não é aplicação', async () => {
    const l = (id: string, data: string, valor: number, descricao: string, n: number, t: number) =>
      `('${id}', '${data}', ${valor}, '${descricao}', 'Loans and financing', 'Crédito', 'Nubank', 'Matheus', 'despesa', 'Saída', '2043-04-01', ${n}, ${t})`;
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em, parcela_numero, parcela_total) VALUES
      ${[
        l('rn-a1', '2043-04-07', 731.18, 'Renegociação de pendências 1/3', 1, 3),
        l('rn-a2', '2043-05-07', 731.18, 'Renegociação de pendências 2/3', 2, 3),
        l('rn-a3', '2043-06-06', 731.18, 'Renegociação de pendências 3/3', 3, 3),
        l('rn-b3', '2043-04-07', 417.42, 'Renegociação de pendências 3/8', 3, 8),
        ...[4, 5, 6, 7, 8].map((n) => l(`rn-b${n}`, `2043-${String(n + 1).padStart(2, '0')}-07`, 417.42, `Renegociação de pendências ${n}/8`, n, 8)),
      ].join(',')}`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('ap-1', '2043-03-04', 2000, 'Pagamento de Pix QR Code NU PAGAMENTOS S/A', 'Investments', 'Débito', 'Itau', 'Matheus', 'pagamento_fatura', 'Saída', '2043-03-04'),
      ('ap-2', '2043-03-10', 300, 'TED APLICACAO', 'Investments', 'Débito', 'Itau', 'Matheus', 'transferencia_interna', 'Saída', '2043-03-10')`);
    const d = await queries.getTrilhaDados('2043-04-15');
    const nubank = d.dividas.filter((x) => x.banco === 'Nubank').sort((a, b) => (a.plano ?? 0) - (b.plano ?? 0));
    expect(nubank.map((x) => [x.plano, x.valorParcela, x.restantes, x.fim])).toEqual([[3, 731.18, 2, '2043-06'], [8, 417.42, 5, '2043-09']]);
    expect(d.aplicacaoMensal.find((m) => m.mes === '2043-03')).toEqual({ mes: '2043-03', valor: 300 });
  });

  it('dados da trilha: reaproveitar a base do casal já carregada dá o mesmo resultado', async () => {
    const base = await queries.getProjecaoBase('casal', '2038-04-15');
    expect(await queries.getTrilhaDados('2038-04-15', base)).toEqual(await queries.getTrilhaDados('2038-04-15'));
  });
});
