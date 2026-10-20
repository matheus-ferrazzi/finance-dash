import { describe, expect, it } from 'vitest';
import { emBlocos, montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude } from '../../src/worker/notificacoes/textos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ritmo', () => {
  const p = { mesLabel: 'out/26', fechaCom: -100, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 75, sobraParaODiaADia: 500, receitasAReceber: [{ valor: 300 }] };
  // N8 (auditoria 13/10): "nesse ritmo fecha em" mostrava a projeção pela MÉDIA; no ritmo dito o mês fecharia
  // bem pior. Agora cada número diz a sua base: média → fechaCom; ritmo atual → sobra − ritmo × dias.
  it('acima do que cabe: % , pela média, no ritmo atual e o que entra', () => {
    expect(montarRitmo(p)).toBe([
      '🎯 *Ritmo de hoje*', '', `Da pra gastar *${brl(50)}* hoje.`, `Voce vem gastando ${brl(75)}/dia — *50% acima*.`, '',
      `Pela media dos ultimos meses, out/26 fecha em *${brl(-100)}*.`,
      `No ritmo atual, fecharia perto de *${brl(-250)}*.`,
      `Faltam 10 dias e ainda entram ${brl(300)}.`,
    ].join('\n'));
  });
  it('sem a sobra na resposta (painel antigo): só a linha pela média', () => {
    const { sobraParaODiaADia, ...sem } = p;
    expect(montarRitmo(sem)).not.toContain('No ritmo atual');
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
    // 19/10: título com o valor e o banco; com mais de um, quantos e o total
    expect(r2.texto).toBe(`🟡 *Gasto grande* · ${brl(600)} no B (X)\n\n💸 *Gasto acima de ${brl(500)}*\n\n• ${brl(600)} — LOJA x (B, X, 10/10)\n\n_Se não reconhece, confira no app do banco._`);
    expect(r2.estado).toEqual({ lastCriadoEm: '2026-10-11T09:00:00' });
    const r3 = montarGasto([t('c', '2026-10-12T09:00:00'), t('d', '2026-10-12T10:00:00')], r2.estado);
    expect(r3.texto!.split('\n')[0]).toBe(`🟡 *2 gastos grandes* · ${brl(1200)} no total`);
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
  it('17/10: conexão que a Pluggy tirou da atualização automática vira linha com o banco e o que fazer', () => {
    const t = montarSaude({ ...ok, conexoes: [{ banco: 'Inter', responsavel: 'Matheus', horas: 77.5 }, { banco: 'Neon', responsavel: 'Ariane', horas: 21 }] })!;
    expect(t).toContain('• Inter (Matheus): sem atualizar há 3 dias, abrir o Meu Pluggy e atualizar a conexão');
    expect(t).toContain('• Neon (Ariane): sem atualizar há 21 h, abrir o Meu Pluggy e atualizar a conexão');
    expect(montarSaude({ ...ok, conexoes: [] })).toBeNull();
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

// 20/10: mensagem em blocos (pedido do Matheus): linha em branco entre os blocos; lista junta; vazio some
describe('emBlocos', () => {
  it('texto solto é um bloco; lista fica junta; vazio, nulo e lista vazia somem', () => {
    expect(emBlocos(['A', ['b1', 'b2'], null, [], '', false, ['', 'c'], 'D'])).toBe('A\n\nb1\nb2\n\nc\n\nD');
  });
});
