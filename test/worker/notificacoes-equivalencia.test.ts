import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude } from '../../src/worker/notificacoes/textos';

// Roda o código original do nó "Monta Mensagem" do n8n (fixtures) e compara com o portado: a paridade
// não depende só dos casos que escrevemos à mão.
function n8n(bot: string) {
  const codigo = readFileSync(`test/worker/fixtures/n8n-${bot}.js`, 'utf8');
  const fn = new Function('$json', '$getWorkflowStaticData', codigo) as (j: unknown, g: () => Record<string, unknown>) => { json: { text: string } }[];
  const store: Record<string, unknown> = {};
  return {
    rodar: (json: unknown) => {
      const out = fn(json, () => store);
      return out.length ? out[0].json.text : null;
    },
    store,
  };
}

describe('paridade com o n8n', () => {
  it('ritmo', () => {
    const o = n8n('ritmo');
    const casos = [
      { mesLabel: 'out/26', fechaCom: -2018.41, diasRestantes: 20, ritmoSeguroDia: 54.8, ritmoAtualDia: 214.56, receitasAReceber: [{ valor: 1601.21 }] },
      { mesLabel: 'nov/26', fechaCom: 350, diasRestantes: 1, ritmoSeguroDia: 100, ritmoAtualDia: 80, receitasAReceber: [] },
      { mesLabel: 'dez/26', fechaCom: 0, diasRestantes: 0, ritmoSeguroDia: 0, ritmoAtualDia: 10, receitasAReceber: [] },
      { mesLabel: 'jan/27', fechaCom: -1, diasRestantes: 5, ritmoSeguroDia: 0, ritmoAtualDia: 33.3, receitasAReceber: [{ valor: 0 }] },
    ];
    for (const c of casos) expect(montarRitmo(c)).toBe(o.rodar(c));
  });

  it('fatura (sequência com estado)', () => {
    const o = n8n('fatura');
    let estado: { alertados: string[] } | null = null;
    const f = (banco: string, dias: number, venc_iso: string) => ({ banco, responsavel: 'X', valor: 1234.5, venc: venc_iso.slice(8) + '/' + venc_iso.slice(5, 7), venc_iso, dias });
    const dias = [
      [f('B1', 3, '2026-10-15')], [f('B1', 2, '2026-10-15'), f('B2', 0, '2026-10-13')], [], [f('B1', 1, '2026-10-15')], [f('B1', 3, '2026-11-15')],
    ];
    for (const fats of dias) {
      const r = montarFatura(fats, estado);
      expect(r.texto).toBe(o.rodar({ faturas: fats }));
      estado = r.estado;
      if (o.store.alertados) expect(estado.alertados).toEqual(o.store.alertados);
    }
  });

  it('gasto grande (sequência com marca d\'água)', () => {
    const o = n8n('gasto');
    let estado: { lastCriadoEm: string } | null = null;
    const t = (id: string, criado: string, desc: string) => ({ id_transacao: id, criado_em: criado, valor: 512.9, descricao: desc, banco: 'B', responsavel: 'X', data: '10/10' });
    const rodadas = [
      [t('a', '2026-10-10T10:00:00', 'A')], [t('a', '2026-10-10T10:00:00', 'A')], [t('a', '2026-10-10T10:00:00', 'A'), t('b', '2026-10-10T16:00:00', 'B *x*')], [],
      [t('c', '2026-10-11T08:00:00', '[C]_'), t('d', '2026-10-11T09:00:00', 'D')],
    ];
    for (const txs of rodadas) {
      const r = montarGasto(txs, estado);
      expect(r.texto).toBe(o.rodar({ txs }));
      estado = r.estado;
      expect(estado.lastCriadoEm).toBe(o.store.lastCriadoEm ?? '');
    }
  });

  it('saúde', () => {
    const o = n8n('saude');
    const base = { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 5, worker_falhas_24h: 0, ultimo_lancamento: '10/10/2026' };
    const casos = [base, { ...base, h_faturas: 37.5 }, { ...base, h_investimentos: null, h_lancamentos: 80, h_worker_ok: null, worker_falhas_24h: 3, ultimo_lancamento: null }];
    for (const s of casos) expect(montarSaude(s as any)).toBe(o.rodar({ saude: s }));
  });

  it('backup', () => {
    const o = n8n('backup');
    const base = { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 20, h_desde_offsite: 10, tamanho: 2097152, tabelas: 30, falhas_24h: 0, ultimo_erro: null };
    const casos = [base, { ...base, h_desde_ok: 31.2, h_desde_offsite: null }, { ...base, h_desde_n8n: null, falhas_24h: 2, ultimo_erro: 'pg_dump *falhou* [x]', tamanho: null, tabelas: null }];
    for (const s of casos) expect(montarBackup(s as any)).toBe(o.rodar({ st: s }));
  });
});
