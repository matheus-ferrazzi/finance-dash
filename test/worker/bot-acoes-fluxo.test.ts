import { describe, expect, it } from 'vitest';
import { criarBot } from '../../src/worker/bot/bot';

const G = 'G@g.us';
const cfg = { grupo: G, membros: { Matheus: ['333@lid'], Ariane: ['222@lid'] }, botJids: ['999@lid'] };
let n = 0;
const ev = (texto: string, quem = '333@lid') => ({ event: 'messages.upsert', data: { key: { remoteJid: G, fromMe: false, id: `M${++n}`, participant: quem }, message: { conversation: texto } } });
const espera = () => new Promise((r) => setTimeout(r, 25));

function montar(o: { pend?: any; feita?: any; confirma?: boolean; groq?: any[]; busca?: any[] } = {}) {
  const enviados: string[] = []; const log: string[] = []; const posts: any[] = []; const perguntas: string[] = [];
  const bot = criarBot({
    cfg, painel: async () => ({ ok: true, dados: { itens: o.busca ?? [] } }),
    painelPost: async (c: string, corpo: any) => { if ((ret as any).falharPost) throw new Error('fetch failed'); posts.push([c, corpo]); return { ok: true, dados: { resumo: '3 lançamento(s) → Mercado' } }; },
    groq: { chat: async (msgs: any[]) => { perguntas.push(msgs.at(-1).content); return (o.groq ?? []).shift() ?? { content: 'Fase 1.', toolCalls: [], modelo: 'm' }; } },
    registro: { gravar: async () => {}, contexto: async () => [] },
    acoes: {
      criar: async () => 1,
      pendente: async (pessoa: string) => (o.pend && o.pend.pessoa === pessoa ? o.pend : null),
      confirmar: async (id: number) => { log.push(`confirmar ${id}`); return o.confirma ?? true; },
      cancelar: async (id: number) => { log.push(`cancelar ${id}`); },
      ultimaFeita: async (pessoa: string) => (o.feita && o.feita.pessoa === pessoa ? o.feita : null),
    },
    wa: { enviarComId: async (t: string) => { enviados.push(t); return `R${enviados.length}`; }, enviarImagemComId: async (_p: Buffer, l: string) => { enviados.push(l); return 'I1'; } },
    renderizar: async () => Buffer.from('png'), hoje: () => '2026-10-12', painelUrl: 'https://p', log: () => {},
  });
  const ret: any = { bot, enviados, log, posts, perguntas };
  return ret;
}
const pend = { id: 5, pessoa: 'Matheus', tipo: 'categoria', params: {}, resumo: '3 lançamento(s) → Mercado', expirada: false };

describe('fluxo das ações (E2)', () => {
  it('"sim" da Ariane para a proposta do Matheus: nada acontece', async () => {
    const m = montar({ pend });
    m.bot.receber(ev('sim', '222@lid'));
    await espera();
    expect([m.enviados, m.log, m.posts, m.perguntas]).toEqual([[], [], [], []]);
  });
  it('"sim" de quem pediu: confirma, executa no painel e responde "Feito"', async () => {
    const m = montar({ pend });
    m.bot.receber(ev('Sim!'));
    await espera();
    expect(m.log).toEqual(['confirmar 5']);
    expect(m.posts).toEqual([['/api/bot/executar', { id: 5 }]]);
    expect(m.enviados[0]).toBe('✅ Feito: 3 lançamento(s) → Mercado.\n↩️ Errado? *bot desfaz*\n\n👉 https://p/gastos');
  });
  it('segundo "sim" (confirmar devolve false): não executa de novo', async () => {
    const m = montar({ pend, confirma: false });
    m.bot.receber(ev('sim'));
    await espera();
    expect(m.posts).toEqual([]);
    expect(m.enviados).toEqual([]);
  });
  it('proposta expirada: avisa e não executa', async () => {
    const m = montar({ pend: { ...pend, expirada: true } });
    m.bot.receber(ev('sim'));
    await espera();
    expect(m.enviados).toEqual(['⌛ Essa proposta expirou. Pede de novo.']);
    expect(m.posts).toEqual([]);
  });
  it('"não": cancela', async () => {
    const m = montar({ pend });
    m.bot.receber(ev('não'));
    await espera();
    expect(m.log).toEqual(['cancelar 5']);
    expect(m.enviados).toEqual(['❌ Cancelado.']);
  });
  it('"bot desfaz": desfaz a última feita; sem nada, avisa', async () => {
    const m = montar({ feita: { id: 9, pessoa: 'Matheus', resumo: 'Dentista R$ 150,00', tipo: 'avulsa' } });
    m.bot.receber(ev('bot desfaz'));
    await espera();
    expect(m.posts).toEqual([['/api/bot/desfazer', { id: 9, pessoa: 'Matheus' }]]);
    expect(m.enviados).toEqual(['↩️ Desfeito: Dentista R$ 150,00.']);
    const v = montar();
    v.bot.receber(ev('bot desfaz'));
    await espera();
    expect(v.enviados).toEqual(['🤷 Nada para desfazer nas últimas 24 h.']);
  });
  it('"sim" e "2" soltos sem nada pendente: ignorados; "bot sim" sem pendência vira pergunta', async () => {
    const m = montar();
    m.bot.receber(ev('sim')); m.bot.receber(ev('2'));
    await espera();
    expect([m.enviados, m.perguntas]).toEqual([[], []]);
    m.bot.receber(ev('bot sim'));
    await espera();
    expect(m.perguntas).toEqual(['sim']);
  });
  it('número depois de uma lista recente da mesma pessoa: vira "quero o L2" para o agente', async () => {
    const busca = [{ id: 'T1', data: '10/10', valor: 50, descricao: 'PIX A', pessoa: 'Matheus', categoria: 'X' }, { id: 'T2', data: '03/10', valor: 50, descricao: 'PIX B', pessoa: 'Matheus', categoria: 'X' }];
    const m = montar({ busca, groq: [
      { content: null, toolCalls: [{ id: 'c1', nome: 'buscar_lancamentos', args: '{"texto":"pix"}' }], modelo: 'm' },
      { content: 'qual?', toolCalls: [], modelo: 'm' },
    ] });
    m.bot.receber(ev('bot muda o pix para mercado'));
    await espera();
    expect(m.enviados[0]).toContain('🔎 Achei estes.');
    m.bot.receber(ev('2'));
    await espera();
    expect(m.perguntas.at(-1)).toBe('quero o L2');
    const outra = montar({ busca });
    outra.bot.receber(ev('2', '222@lid'));
    await espera();
    expect(outra.perguntas).toEqual([]);
  });
});

describe('revisão E2: fila, repetição e falhas', () => {
  it('"sim" casual sem nada pendente não entra na fila: nunca gera "⏳" nem derruba pergunta', async () => {
    let soltar!: () => void;
    const m = montar({ groq: [] });
    // agente lento: a primeira pergunta segura a fila
    (m as any);
    m.bot.receber(ev('bot quanto gastei'));
    for (let i = 0; i < 8; i++) m.bot.receber(ev('sim'));
    m.bot.receber(ev('bot e a trilha?'));
    await espera(); await espera();
    expect(m.enviados.some((t: string) => t.startsWith('⏳'))).toBe(false);
    expect(m.perguntas).toEqual(['quanto gastei', 'e a trilha?']);
    void soltar;
  });
  it('a mesma mensagem entregue duas vezes é processada uma vez ("bot desfaz" não desfaz duas ações)', async () => {
    const m = montar({ feita: { id: 9, pessoa: 'Matheus', resumo: 'R', tipo: 'avulsa' } });
    const e = ev('bot desfaz');
    m.bot.receber(e); m.bot.receber(e);
    await espera();
    expect(m.posts).toEqual([['/api/bot/desfazer', { id: 9, pessoa: 'Matheus' }]]);
  });
  it('painel fora na hora de gravar: avisa no grupo (não fica em silêncio)', async () => {
    const m = montar({ pend });
    (m as any).falharPost = true;
    m.bot.receber(ev('sim'));
    await espera();
    expect(m.enviados[0]).toMatch(/^⚠️ Não consegui gravar/);
  });
  it('"ok", "pode" e "s" soltos não confirmam; "confirma" confirma', async () => {
    const m = montar({ pend });
    m.bot.receber(ev('ok')); m.bot.receber(ev('pode')); m.bot.receber(ev('s'));
    await espera();
    expect(m.log).toEqual([]);
    m.bot.receber(ev('confirma'));
    await espera();
    expect(m.log).toEqual(['confirmar 5']);
  });
});
