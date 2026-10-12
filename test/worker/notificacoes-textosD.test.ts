import { describe, expect, it } from 'vitest';
import { barraTrilha, montarDiario, montarMensal, montarSemanal, montarTecnico } from '../../src/worker/notificacoes/textosD';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = { mesLabel: 'out/26', fechaCom: -500, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' as const }] };

describe('diário', () => {
  it('acima do que cabe, fecha no vermelho, conta e link', () => {
    expect(montarDiario(dia, 'https://painel/')).toBe([
      '☀️ *Bom dia!*',
      `💸 Hoje dá pra gastar *${brl(50)}*`,
      `🔥 Ritmo: ${brl(80)} por dia, acima do que cabe 🔴`,
      `📉 out/26 fecha em *${brl(-500)}* 🔴`,
      '', `🧾 Luz (${brl(120)}) vence hoje`,
      '', '👉 https://painel/',
    ].join('\n'));
  });
  it('dentro do que cabe e fecha no azul; sem contas a parte some', () => {
    const t = montarDiario({ ...dia, ritmoAtualDia: 40, fechaCom: 300, contas: [] }, 'L');
    expect(t).toContain(`🐢 Ritmo: ${brl(40)} por dia, dentro do que cabe 🟢`);
    expect(t).toContain(`📈 out/26 fecha em *${brl(300)}* 🟢`);
    expect(t).not.toContain('🧾');
  });
  it('último dia do mês: sem "dá pra gastar" nem ritmo', () => {
    const u = montarDiario({ ...dia, diasRestantes: 0, contas: [] }, 'L');
    expect(u).toBe(['☀️ *Bom dia!*', `📅 Último dia do mês: out/26 fecha em *${brl(-500)}* 🔴`, '', '👉 L'].join('\n'));
  });
  it('várias contas: uma por linha, hoje antes de amanhã', () => {
    const t = montarDiario({ ...dia, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }] }, 'L');
    expect(t).toContain(`🧾 Luz (${brl(120)}) vence hoje\n🧾 Agua (${brl(80)}) vence amanhã`);
  });
});

const sem = {
  semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 1160, mediaTotal: 1000,
  grupos: [
    { nome: 'Mercado', emoji: '🛒', semana: 0, media: 500 },
    { nome: 'Saúde', emoji: '💊', semana: 400, media: 150 },
    { nome: 'Lazer', emoji: '🎮', semana: 300, media: 250 },
  ],
  trilha: { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Pagar a fatura inteira.' },
};

describe('semanal', () => {
  it('total com % sobre a média, setas por grupo, trilha com barrinha e links', () => {
    expect(montarSemanal(sem, { gastos: 'G', trilha: 'T' })).toBe([
      '📊 *Semana de 05/10 a 11/10*',
      `💰 Gastaram ${brl(1160)}, 🔺 16% acima da média`,
      '',
      `🛒 Mercado: ${brl(0)} ⏬ (média ${brl(500)})`,
      `💊 Saúde: ${brl(400)} ⏫ (média ${brl(150)})`,
      `🎮 Lazer: ${brl(300)} ⬆️ (média ${brl(250)})`,
      '',
      '🧭 *Trilha* ▰▱▱▱ fase 1: Sair das dívidas',
      '➡️ Pagar a fatura inteira.',
      '', '👉 G', '👉 T',
    ].join('\n'));
  });
  it('abaixo da média e seta ⬇️ quando cai menos da metade', () => {
    const t = montarSemanal({ ...sem, total: 800, grupos: [{ nome: 'Mercado', emoji: '🛒', semana: 400, media: 500 }] }, { gastos: 'G', trilha: 'T' });
    expect(t).toContain(`💰 Gastaram ${brl(800)}, 🔻 20% abaixo da média`);
    expect(t).toContain(`🛒 Mercado: ${brl(400)} ⬇️ (média ${brl(500)})`);
  });
  it('sem gasto: frase própria; média zero: sem %', () => {
    expect(montarSemanal({ ...sem, total: 0, grupos: [] }, { gastos: 'G', trilha: 'T' })).toContain('💤 Nenhum gasto registrado na semana.');
    expect(montarSemanal({ ...sem, mediaTotal: 0, grupos: [] }, { gastos: 'G', trilha: 'T' })).toContain(`💰 Gastaram ${brl(1160)}.`);
  });
  it('igual à média: ➖', () => {
    expect(montarSemanal({ ...sem, grupos: [{ nome: 'Lazer', emoji: '🎮', semana: 250, media: 250 }] }, { gastos: 'G', trilha: 'T' })).toContain('➖');
  });
});

const mes = {
  mes: '2026-09', mesLabel: 'set/26', sobraReal: 300.5, sobraPrevista: -1300.25, saldoFim: -1200.75,
  trilha: { fase: 1, titulo: 'Sair das dívidas', mudou: false, faseAntes: 1 },
  mesNovo: { mesLabel: 'out/26', fechaCom: -1700.4 },
};

describe('mensal', () => {
  it('sobrou: 🎉, 🟢, saldo vermelho, trilha e mês novo', () => {
    expect(montarMensal(mes, 'L')).toBe([
      '📅 *set/26 fechou* 🎉',
      `🟢 Sobrou ${brl(300.5)} (previsto ${brl(-1300.25)})`,
      `🏦 Saldo em conta no fim: ${brl(-1200.75)} 🔴`,
      '',
      '🧭 *Trilha* ▰▱▱▱ seguem na fase 1: Sair das dívidas',
      '',
      `🔮 out/26 começa fechando em ${brl(-1700.4)}`,
      '', '👉 L',
    ].join('\n'));
  });
  it('faltou: sem 🎉; mudou de fase: 🚀', () => {
    const t = montarMensal({ ...mes, sobraReal: -200, saldoFim: 50, trilha: { fase: 2, titulo: 'Fazer sobrar', mudou: true, faseAntes: 1 } }, 'L');
    expect(t.split('\n')[0]).toBe('📅 *set/26 fechou*');
    expect(t).toContain(`🔴 Faltou ${brl(200)} (previsto ${brl(-1300.25)})`);
    expect(t).toContain(`🏦 Saldo em conta no fim: ${brl(50)} 🟢`);
    expect(t).toContain('🚀 *Trilha* ▰▰▱▱ passaram da fase 1 para a 2: Fazer sobrar');
  });
});

const saudeOk = { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 3, worker_falhas_24h: 0, ultimo_lancamento: 'x' };
const backupOk = { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 1, h_desde_offsite: 1, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null };

describe('técnico', () => {
  it('tudo bem: null', () => {
    expect(montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [] })).toBeNull();
  });
  it('🔴 para o que quebrou, 🟡 para consentimento a vencer, 🔴 para vencido', () => {
    const t = montarTecnico({ saude: { ...saudeOk, worker_falhas_24h: 1 } as any, backup: backupOk as any, consentimentos: [{ banco: 'B1', responsavel: 'R', dias: 10 }, { banco: 'B2', responsavel: 'R', dias: -1 }] })!;
    expect(t).toBe([
      '🛠️ *Aviso técnico*', '',
      '🔴 Ingestão (worker): 1 rodada(s) com falha nas últimas 24h',
      '🟡 Consentimento do B1 (R) na Pluggy vence em 10 dias',
      '🔴 Consentimento do B2 (R) na Pluggy venceu',
    ].join('\n'));
  });
  it('bot: falhas e modelo sumido viram linhas 🔴; zerado não aparece', () => {
    const t = montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [], bot: { falhas24h: 2, modelosSumidos: ['m-velho'] } })!;
    expect(t).toContain('🔴 Bot: 2 pergunta(s) com falha nas últimas 24h');
    expect(t).toContain('🔴 Bot: modelo m-velho não existe mais na Groq');
    expect(montarTecnico({ saude: saudeOk as any, backup: backupOk as any, consentimentos: [], bot: { falhas24h: 0, modelosSumidos: [] } })).toBeNull();
  });
});

describe('barra da trilha', () => {
  it('quatro fases', () => {
    expect([1, 2, 3, 4].map(barraTrilha)).toEqual(['▰▱▱▱', '▰▰▱▱', '▰▰▰▱', '▰▰▰▰']);
  });
});
