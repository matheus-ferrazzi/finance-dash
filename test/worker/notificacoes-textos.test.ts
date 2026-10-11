import { describe, expect, it } from 'vitest';
import { montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude } from '../../src/worker/notificacoes/textos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ritmo', () => {
  const p = { mesLabel: 'out/26', fechaCom: -100, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 75, receitasAReceber: [{ valor: 300 }] };
  it('acima do que cabe: % e o que entra', () => {
    expect(montarRitmo(p)).toBe([
      '🎯 *Ritmo de hoje*', '', `Da pra gastar *${brl(50)}* hoje.`, `Voce vem gastando ${brl(75)}/dia — *50% acima*.`, '',
      `Nesse ritmo out/26 fecha em *${brl(-100)}*.`, `Faltam 10 dias e ainda entram ${brl(300)}.`,
    ].join('\n'));
  });
  it('dentro do que cabe, sem receita a entrar; último dia não manda nada', () => {
    const t = montarRitmo({ ...p, ritmoAtualDia: 40, receitasAReceber: [] })!;
    expect(t).toContain('— dentro do que cabe.');
    expect(t.endsWith('Faltam 10 dias.')).toBe(true);
    expect(montarRitmo({ ...p, diasRestantes: 0 })).toBeNull();
  });
});

describe('fatura', () => {
  const f = (banco: string, dias: number) => ({ banco, responsavel: 'X', valor: 100, venc: '15/10', venc_iso: '2026-10-15', dias });
  it('avisa uma vez por fatura; o estado guarda as avisadas', () => {
    const r1 = montarFatura([f('B1', 2)], null);
    expect(r1.texto).toBe(`📅 *Vencimento de fatura*\n\n• B1 (X): ${brl(100)} — vence em *2 dias* (15/10)\n\n_Programe o pagamento pra não pagar juros._`);
    expect(r1.estado).toEqual({ alertados: ['B1|X|2026-10-15'] });
    const r2 = montarFatura([f('B1', 1)], r1.estado);
    expect(r2.texto).toBeNull();
    expect(r2.estado).toEqual(r1.estado);
  });
  it('hoje / amanhã; sem faturas nada', () => {
    expect(montarFatura([f('B1', 0)], null).texto).toContain('vence *hoje*');
    expect(montarFatura([f('B1', 1)], null).texto).toContain('vence *amanhã*');
    expect(montarFatura([], { alertados: ['a'] })).toEqual({ texto: null, estado: { alertados: ['a'] } });
  });
});

describe('gasto grande', () => {
  const t = (id: string, criado: string, desc = 'LOJA') => ({ id_transacao: id, criado_em: criado, valor: 600, descricao: desc, banco: 'B', responsavel: 'X', data: '10/10' });
  it('primeira execução só define a marca; depois só os novos; limpa Markdown', () => {
    const r1 = montarGasto([t('a', '2026-10-10T10:00:00')], null);
    expect(r1).toEqual({ texto: null, estado: { lastCriadoEm: '2026-10-10T10:00:00' } });
    const r2 = montarGasto([t('a', '2026-10-10T10:00:00'), t('b', '2026-10-11T09:00:00', 'LOJA *_`[x]')], r1.estado);
    expect(r2.texto).toBe(`💸 *Gasto acima de ${brl(500)}*\n\n• ${brl(600)} — LOJA x (B, X, 10/10)\n\n_Se não reconhece, confira no app do banco._`);
    expect(r2.estado).toEqual({ lastCriadoEm: '2026-10-11T09:00:00' });
    expect(montarGasto([], r2.estado)).toEqual({ texto: null, estado: r2.estado });
  });
});

describe('saúde', () => {
  const ok = { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 5, worker_falhas_24h: 0, ultimo_lancamento: '10/10/2026' };
  it('tudo bem: nada; cada limite vira uma linha; nulos contam como parados', () => {
    expect(montarSaude(ok)).toBeNull();
    const t = montarSaude({ ...ok, h_faturas: 40, h_worker_ok: 20, worker_falhas_24h: 2 })!;
    expect(t).toBe('⚠️ *Alerta de sincronização*\n\nAlgo pode ter parado de atualizar:\n• Faturas: sem atualizar há 40h\n• Ingestão (worker): última rodada completa há 20h\n• Ingestão (worker): 2 rodada(s) com falha nas últimas 24h\n\nÚltimo lançamento: 10/10/2026');
    expect(montarSaude({ ...ok, h_worker_ok: null })).toContain('última rodada completa há —h');
  });
});

describe('backup', () => {
  const ok = { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 20, h_desde_offsite: 10, tamanho: 2097152, tabelas: 30, falhas_24h: 0, ultimo_erro: null };
  it('tudo bem: nada; problemas listados; "nunca" quando nulo', () => {
    expect(montarBackup(ok)).toBeNull();
    const t = montarBackup({ ...ok, h_desde_ok: null, falhas_24h: 1, ultimo_erro: 'disco *cheio*' })!;
    expect(t).toContain('• Postgres (os dados): ultimo OK nunca');
    expect(t).toContain('• 1 falha(s) em 24h — ultima: disco cheio');
    expect(t).toContain('Ultimo bom: 2.00 MB / 30 tabelas, 20 workflows.');
  });
});
