import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Auditoria 13/10 (D): as rotas /api/resumo/* chamadas de verdade (antes só as funções por baixo tinham teste;
// a do mensal não tinha nenhum). Usam a data de hoje: os dados são relativos a hoje e os testes conferem coerência.
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('rotas /api/resumo/* (integração)', () => {
  let pool: Pool;

  beforeAll(async () => {
    const u = new URL(url!);
    Object.assign(process.env, {
      DB_HOST: u.hostname, DB_PORT: u.port, DB_NAME: u.pathname.slice(1),
      DB_USER: u.username, DB_PASSWORD: u.password, DB_WRITER_USER: u.username, DB_WRITER_PASSWORD: u.password,
    });
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    for (const m of ['001_c1_ingestao', '003_contas_do_mes', '004_contas_pela_tela', '006_categorias_painel', '007_trilha_ajustes', '010_bot_acoes', '011_gastos_dinheiro', '013_previsto_foto']) {
      await pool.query(readFileSync(`db/migrations/${m}.sql`, 'utf8'));
    }
    const d = (n: number) => `(now() AT TIME ZONE 'America/Sao_Paulo')::date - ${n}`;
    await pool.query(`INSERT INTO financas_saldos (id_conta, banco, responsavel, tipo, saldo) VALUES ('rr-c', 'RR', 'Ariane', 'CHECKING_ACCOUNT', 1000)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, categoria, forma_pagamento, banco, responsavel, classe, tipo_movimento, criado_em) VALUES
      ('rr1', ${d(8)}, 120, 'MERCADO', 'Groceries', 'Débito', 'RR', 'Ariane', 'despesa', 'Saída', now()),
      ('rr2', ${d(9)}, 45, 'IFOOD', 'Food delivery', 'Débito', 'RR', 'Ariane', 'despesa', 'Saída', now()),
      ('rr3', ${d(9)}, 900, 'ALUGUEL', 'Housing', 'Débito', 'RR', 'Ariane', 'despesa', 'Saída', now()),
      ('rr4', ${d(20)}, 3000, 'SALARIO', 'Salary', 'Débito', 'RR', 'Ariane', 'receita', 'Entrada', now()),
      ('rr5', ${d(1)}, 30, 'PADARIA', 'Groceries', 'Débito', 'RR', 'Ariane', 'despesa', 'Saída', now())`);
  });
  afterAll(async () => {
    await pool?.end();
    const db = await import('../../src/lib/db');
    await db.pool.end();
    await db.writerPool.end();
  });

  it('semanal: total do título = soma dos grupos livres do gráfico; faturas e trilha presentes', async () => {
    const { GET } = await import('../../src/app/api/resumo/semanal/route');
    const j = await (await GET()).json();
    expect(j.semana.inicio < j.semana.fim).toBe(true);
    const soma = j.todosGrupos.reduce((s: number, g: any) => s + g.semana, 0);
    expect(j.total).toBeCloseTo(soma, 2);
    expect(j.faturas).toHaveProperty('aPagar');
    expect(j.trilha.fase).toBeGreaterThanOrEqual(1);
  });

  it('diário: números finitos; série acumulada termina no gasto livre do mês', async () => {
    const { GET } = await import('../../src/app/api/resumo/diario/route');
    const j = await (await GET()).json();
    for (const k of ['fechaCom', 'ritmoSeguroDia', 'ritmoAtualDia', 'cabeNoMes']) expect(Number.isFinite(j[k])).toBe(true);
    expect(Array.isArray(j.contas)).toBe(true);
    expect(Array.isArray(j.avisos)).toBe(true);
    const ultimo = j.serie[j.serie.length - 1]?.acumulado ?? 0;
    expect(ultimo).toBeGreaterThanOrEqual(0);
  });

  it('mensal: fecha o mês anterior, traz investimentos e mês novo, e tira a foto do previsto do mês', async () => {
    const { GET } = await import('../../src/app/api/resumo/mensal/route');
    const j = await (await GET()).json();
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const [y, m] = hoje.split('-').map(Number);
    const anterior = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    expect(j.mes).toBe(anterior);
    expect(Number.isFinite(j.sobraReal)).toBe(true);
    expect(j.investimentos).toHaveProperty('total');
    expect(j.mesNovo).toHaveProperty('fechaCom');
    const fotos = (await pool.query(`SELECT resp FROM financas_previsto_foto WHERE mes = $1 ORDER BY resp`, [hoje.slice(0, 7)])).rows.map((r) => r.resp);
    expect(fotos).toEqual(['Ariane', 'Matheus', 'casal']);
  });
});
