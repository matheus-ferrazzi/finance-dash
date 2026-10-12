import { describe, expect, it } from 'vitest';
import { criarBot } from '../../src/worker/bot/bot';

const G = 'G@g.us';
const cfg = { grupo: G, membros: { Ariane: ['222@lid'] }, botJids: ['111@lid'] };
const ev = (texto: string, remoteJid = G, id = 'Q1') => ({ event: 'messages.upsert', data: { key: { remoteJid, fromMe: false, id, participant: '222@lid' }, message: { conversation: texto } } });
const espera = () => new Promise((r) => setTimeout(r, 20));

function montar(groqResp: any[] = [{ content: 'Fase 1.', toolCalls: [], modelo: 'm' }]) {
  const enviados: string[] = []; const gravados: any[] = []; const logs: string[] = []; let chamadasGroq = 0;
  const bot = criarBot({
    cfg, painel: async () => ({ ok: true, dados: {} }),
    groq: { chat: async () => { chamadasGroq++; return groqResp.shift() ?? { content: 'x', toolCalls: [], modelo: 'm' }; } },
    registro: { gravar: async (l: any) => { gravados.push(l); }, contexto: async () => [] },
    wa: { enviarComId: async (t: string) => { enviados.push(t); return `R${enviados.length}`; }, enviarImagemComId: async (_p: Buffer, l: string) => { enviados.push(`[img] ${l}`); return 'I1'; } },
    renderizar: async () => Buffer.from('png'), hoje: () => '2026-10-11', painelUrl: 'https://p', log: (m) => logs.push(m),
  });
  return { bot, enviados, gravados, logs, groq: () => chamadasGroq };
}

describe('bot montado', () => {
  it('mensagem de outra conversa: nada enviado, gravado, logado ou perguntado ao Groq', async () => {
    const m = montar();
    m.bot.receber(ev('bot quanto gastei', '5599@s.whatsapp.net'));
    await espera();
    expect([m.enviados, m.gravados, m.logs, m.groq()]).toEqual([[], [], [], 0]);
  });
  it('pergunta válida: responde no grupo, guarda o id da resposta e registra sem JID', async () => {
    const m = montar();
    m.bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(m.enviados).toEqual(['🤷 Ainda não sei responder isso. Anotei a pergunta.']);
    expect(m.bot.enviados.has('R1')).toBe(true);
    expect(m.gravados[0]).toMatchObject({ pessoa: 'Ariane', pergunta: 'qual a fase?', semFerramenta: true });
    expect(JSON.stringify(m.gravados)).not.toMatch(/@lid|@g\.us|@s\.whatsapp/);
  });
  it('áudio chamando o bot: "só leio texto", sem Groq', async () => {
    const m = montar();
    m.bot.receber({ event: 'messages.upsert', data: { key: { remoteJid: G, fromMe: false, id: 'A1', participant: '222@lid' }, message: { audioMessage: { contextInfo: { mentionedJid: ['111@lid'] } } } } });
    await espera();
    expect(m.enviados).toEqual(['🎧 Por enquanto só leio texto.']);
    expect(m.groq()).toBe(0);
  });
  it('duas perguntas seguidas: respondidas e registradas na ordem, uma de cada vez', async () => {
    const m = montar();
    m.bot.receber(ev('bot primeira', G, 'Q1'));
    m.bot.receber(ev('bot segunda', G, 'Q2'));
    await espera(); await espera();
    expect(m.gravados.map((g: any) => g.pergunta)).toEqual(['primeira', 'segunda']);
    expect(m.enviados).toHaveLength(2);
  });
});
