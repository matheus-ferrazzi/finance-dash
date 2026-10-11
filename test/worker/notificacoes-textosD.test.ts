import { describe, expect, it } from 'vitest';
import { montarDiario, montarMensal, montarSemanal, montarTecnico } from '../../src/worker/notificacoes/textosD';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dia = { mesLabel: 'out/26', fechaCom: -500, diasRestantes: 10, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' as const }] };

describe('diário', () => {
  it('ritmo, fecha, contas e link', () => {
    expect(montarDiario(dia, 'https://painel/')).toBe([
      `*Bom dia.* Hoje dá pra gastar *${brl(50)}*.`,
      `Vocês vêm gastando ${brl(80)} por dia, acima do que cabe.`,
      `Nesse ritmo, out/26 fecha em *${brl(-500)}*.`,
      '', `*Contas:* Luz (${brl(120)}) vence hoje.`, '', 'https://painel/',
    ].join('\n'));
  });
  it('dentro do que cabe; sem contas a parte some; último dia sem "por dia"', () => {
    const t = montarDiario({ ...dia, ritmoAtualDia: 40, contas: [] }, 'L');
    expect(t).toContain('dentro do que cabe');
    expect(t).not.toContain('Contas');
    const u = montarDiario({ ...dia, diasRestantes: 0 }, 'L');
    expect(u).not.toContain('dá pra gastar');
    expect(u).toContain('out/26 fecha em');
  });
  it('várias contas: hoje e amanhã na mesma linha', () => {
    const t = montarDiario({ ...dia, contas: [{ nome: 'Luz', valor: 120, quando: 'hoje' }, { nome: 'Agua', valor: 80, quando: 'amanhã' }] }, 'L');
    expect(t).toContain(`*Contas:* Luz (${brl(120)}) vence hoje; Agua (${brl(80)}) vence amanhã.`);
  });
});

describe('semanal', () => {
  it('total × média, até 3 grupos com seta, trilha e links', () => {
    const t = montarSemanal({ semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 900, mediaTotal: 1000,
      grupos: [{ nome: 'Comer fora', emoji: '🍔', semana: 50, media: 400 }, { nome: 'Mercado', emoji: '🛒', semana: 500, media: 300 }],
      trilha: { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Manter a fatura paga inteira.' } }, { gastos: 'G', trilha: 'T' });
    expect(t).toContain('*Semana de 05/10 a 11/10*');
    expect(t).toContain(`Gastaram ${brl(900)} (a média é ${brl(1000)}).`);
    expect(t).toContain(`🍔 Comer fora: ${brl(50)} (média ${brl(400)}) ↓`);
    expect(t).toContain(`🛒 Mercado: ${brl(500)} (média ${brl(300)}) ↑`);
    expect(t).toContain('*Trilha:* fase 1, Sair das dívidas. Manter a fatura paga inteira.');
    expect(t.endsWith('G\nT')).toBe(true);
  });
  it('semana sem gasto e média zero: sem NaN, sem lista de grupos', () => {
    const t = montarSemanal({ semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 0, mediaTotal: 0, grupos: [], trilha: { fase: 2, titulo: 'Fazer sobrar', proximoPasso: 'x' } }, { gastos: 'G', trilha: 'T' });
    expect(t).not.toContain('NaN');
    expect(t).toContain('Nenhum gasto registrado na semana.');
  });
});

describe('mensal', () => {
  it('sobra × prevista, saldo, trilha (mudou) e o mês novo', () => {
    const t = montarMensal({ mes: '2026-09', mesLabel: 'set/26', sobraReal: 300, sobraPrevista: -1300, saldoFim: -1200,
      trilha: { fase: 2, titulo: 'Fazer sobrar', mudou: true, faseAntes: 1 }, mesNovo: { mesLabel: 'out/26', fechaCom: -500 } }, 'L');
    expect(t).toContain('*set/26 fechou.*');
    expect(t).toContain(`Sobrou ${brl(300)} (o previsto era ${brl(-1300)}).`);
    expect(t).toContain(`Saldo em conta no fim: ${brl(-1200)}.`);
    expect(t).toContain('*Trilha:* passaram da fase 1 para a 2, Fazer sobrar.');
    expect(t).toContain(`out/26 começa fechando em ${brl(-500)}.`);
    expect(t.endsWith('L')).toBe(true);
  });
  it('sobra negativa vira "faltou"; trilha sem mudança', () => {
    const t = montarMensal({ mes: '2026-09', mesLabel: 'set/26', sobraReal: -400, sobraPrevista: -100, saldoFim: -900,
      trilha: { fase: 1, titulo: 'Sair das dívidas', mudou: false, faseAntes: 1 }, mesNovo: { mesLabel: 'out/26', fechaCom: -500 } }, 'L');
    expect(t).toContain(`Faltou ${brl(400)} (o previsto era ${brl(-100)}).`);
    expect(t).toContain('*Trilha:* seguem na fase 1, Sair das dívidas.');
  });
});

describe('técnico', () => {
  const ok = { saude: { h_lancamentos: 5, h_investimentos: 5, h_faturas: 5, h_worker_ok: 5, worker_falhas_24h: 0, ultimo_lancamento: '10/10/2026' },
    backup: { h_desde_ok: 5, h_desde_n8n: 5, n8n_workflows: 20, h_desde_offsite: 10, tamanho: 1, tabelas: 1, falhas_24h: 0, ultimo_erro: null }, consentimentos: [] };
  it('tudo bem: nada; consentimento e saúde viram linhas', () => {
    expect(montarTecnico(ok)).toBeNull();
    const t = montarTecnico({ ...ok, saude: { ...ok.saude, h_worker_ok: 30 }, consentimentos: [{ banco: 'B1', responsavel: 'X', dias: 10 }] })!;
    expect(t.startsWith('*Aviso técnico*')).toBe(true);
    expect(t).toContain('Ingestão (worker): última rodada completa há 30h');
    expect(t).toContain('• Consentimento do B1 (X) na Pluggy vence em 10 dias');
  });
  it('consentimento vencido: "venceu"', () => {
    expect(montarTecnico({ ...ok, consentimentos: [{ banco: 'B1', responsavel: 'X', dias: -2 }] })).toContain('• Consentimento do B1 (X) na Pluggy venceu');
  });
});
