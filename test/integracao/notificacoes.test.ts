import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarFontes } from '../../src/worker/notificacoes/fontes';
import { PgRegistroNotif } from '../../src/worker/notificacoes/registro';

// Roda só com TEST_DATABASE_URL (Postgres descartável).
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('notificações no worker (integração)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await pool.query(readFileSync('test/integracao/base.sql', 'utf8'));
    await pool.query(readFileSync('db/migrations/001_c1_ingestao.sql', 'utf8'));
    // financas_backup é criada pelo script de backup da VPS (fora das migrações): só as colunas que o bot lê
    await pool.query(`CREATE TABLE financas_backup (feito_em timestamptz, ok boolean, n8n_ok boolean, n8n_workflows int,
      puxado_em timestamptz, tamanho_bytes bigint, tabelas int, erro text)`);
    await pool.query(readFileSync('db/migrations/008_notificacoes.sql', 'utf8'));
  });
  afterAll(async () => { await pool?.end(); });

  it('registro: grava e lê o último estado do bot, em qualquer modo; erro sem estado não apaga o estado', async () => {
    const reg = new PgRegistroNotif(pool);
    expect(await reg.ultimoEstado('gasto')).toBeNull();
    await reg.gravar({ bot: 'gasto', modo: 'sombra', texto: null, enviado: false, erro: null, estado: { lastCriadoEm: '2040-01-01T00:00:00' } });
    await reg.gravar({ bot: 'gasto', modo: 'real', texto: 'x', enviado: true, erro: null, estado: { lastCriadoEm: '2040-01-02T00:00:00' } });
    await reg.gravar({ bot: 'gasto', modo: 'real', texto: null, enviado: false, erro: 'falhou', estado: null });
    expect(await reg.ultimoEstado('gasto')).toEqual({ lastCriadoEm: '2040-01-02T00:00:00' });
    expect(await reg.ultimoEstado('fatura')).toBeNull();
  });

  // C2 (pendências da auditoria 13/10): trava entre comando manual e agendado; dry-run com o registro real
  it('C2: enviadoRecente só vê envio real com sucesso do mesmo bot nos últimos minutos', async () => {
    const reg = new PgRegistroNotif(pool);
    await reg.gravar({ bot: 'diario', modo: 'sombra', texto: 'x', enviado: false, erro: null, estado: null });
    expect(await reg.enviadoRecente('diario', 10)).toBe(false);
    await reg.gravar({ bot: 'diario', modo: 'real', texto: 'x', enviado: true, erro: null, estado: null });
    expect(await reg.enviadoRecente('diario', 10)).toBe(true);
    expect(await reg.enviadoRecente('semanal', 10)).toBe(false);
    await pool.query(`UPDATE financas_notificacoes SET criado_em = now() - interval '11 minutes' WHERE bot = 'diario'`);
    expect(await reg.enviadoRecente('diario', 10)).toBe(false);
  });
  it('C2: dry-run com o registro real não grava nada nem envia', async () => {
    const { rodarNotificacao } = await import('../../src/worker/notificacoes/motor');
    const reg = new PgRegistroNotif(pool);
    const antes = (await pool.query(`SELECT count(*)::int n FROM financas_notificacoes`)).rows[0].n;
    const enviados: string[] = [];
    const canal = { enviar: async (t: string) => { enviados.push(t); } };
    const fontes: any = { ritmo: async () => ({ mesLabel: 'out/26', fechaCom: 1, diasRestantes: 5, ritmoSeguroDia: 10, ritmoAtualDia: 5, receitasAReceber: [] }) };
    const r = await rodarNotificacao('ritmo', { fontes, registro: reg, canais: { grupo: canal, matheus: canal, telegram: canal }, modo: 'dry-run' });
    expect(r.texto).toContain('Ritmo');
    expect(enviados).toEqual([]);
    expect((await pool.query(`SELECT count(*)::int n FROM financas_notificacoes`)).rows[0].n).toBe(antes);
  });

  it('fontes: faturas na janela 0–3 dias, gastos ≥ 500 dos últimos 3 dias, saúde, backup e o painel', async () => {
    await pool.query(`INSERT INTO financas_faturas (id_conta, banco, responsavel, valor_fatura_atual, data_vencimento) VALUES
      ('fx1','B1','X',100,(now() AT TIME ZONE 'America/Sao_Paulo')::date + 2), ('fx2','B2','X',100,(now() AT TIME ZONE 'America/Sao_Paulo')::date + 9)`);
    await pool.query(`INSERT INTO financas_lancamentos (id_transacao, data_lancamento, valor, descricao, classe, banco, responsavel, criado_em) VALUES
      ('gx1', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 700, 'COMPRA', 'despesa', 'B', 'X', now()),
      ('gx2', (now() AT TIME ZONE 'America/Sao_Paulo')::date, 100, 'PEQUENA', 'despesa', 'B', 'X', now())`);
    await pool.query(`INSERT INTO financas_backup (feito_em, ok, n8n_ok, n8n_workflows, puxado_em, tamanho_bytes, tabelas)
      VALUES (now() - interval '2 hours', true, true, 20, now() - interval '5 hours', 1048576, 30)`);
    const f = criarFontes(pool, 'http://painel', (async (u: string) => ({ ok: u.endsWith('/api/previsao'), status: 200, json: async () => ({ mesLabel: 'm' }) })) as any);
    expect(((await f.fatura()) as any[]).map((x) => [x.banco, x.dias])).toEqual([['B1', 2]]);
    expect(((await f.gasto()) as any[]).map((x) => x.id_transacao)).toEqual(['gx1']);
    expect(await f.ritmo()).toEqual({ mesLabel: 'm' });
    expect(await f.saude()).toHaveProperty('h_lancamentos');
    expect(await f.backup()).toMatchObject({ tamanho: 1048576, tabelas: 30, falhas_24h: 0 });
    const fora = criarFontes(pool, 'http://painel', (async () => ({ ok: false, status: 502, json: async () => ({}) })) as any);
    await expect(fora.ritmo()).rejects.toThrow('painel HTTP 502');
  });
});
