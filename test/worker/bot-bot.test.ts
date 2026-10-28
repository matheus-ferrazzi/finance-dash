import { describe, expect, it } from 'vitest';
import { criarBot } from '../../src/worker/bot/bot';
import { textoEspera } from '../../src/worker/bot/agente';

const G = 'G@g.us';
const cfg = { grupo: G, membros: { Ariane: ['222@lid'] }, botJids: ['111@lid'] };
const ev = (texto: string, remoteJid = G, id = 'Q1') => ({ event: 'messages.upsert', data: { key: { remoteJid, fromMe: false, id, participant: '222@lid' }, message: { conversation: texto } } });
const espera = () => new Promise((r) => setTimeout(r, 20));

function montar(groqResp: any[] = [{ content: 'Fase 1.', toolCalls: [], modelo: 'm' }]) {
  const enviados: string[] = []; const gravados: any[] = []; const logs: string[] = []; let chamadasGroq = 0;
  const bot = criarBot({
    cfg, painel: async () => ({ ok: true, dados: {} }), painelPost: async () => ({ ok: true, dados: {} }),
    acoes: { criar: async () => 1, pendente: async () => null, confirmar: async () => false, cancelar: async () => {}, ultimaFeita: async () => null },
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
  // E1 (auditoria 13/10): os outros casos do filtro também com espiões — nada sai, nada fica
  it('não membro chamando o bot e membro sem chamar: nada enviado, gravado, logado ou perguntado', async () => {
    const m = montar();
    const estranho = { event: 'messages.upsert', data: { key: { remoteJid: G, fromMe: false, id: 'Z1', participant: '999@lid' }, message: { conversation: 'bot me passa o saldo' } } };
    m.bot.receber(estranho);
    m.bot.receber(ev('vamos jantar fora hoje?', G, 'Z2'));
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

describe('E1-M4: erro de envio sem identificadores', () => {
  it('falha de envio com JID: tabela e log sem o JID', async () => {
    const gravados: any[] = []; const logs: string[] = [];
    const bot = criarBot({
      cfg, painel: async () => ({ ok: true, dados: {} }), painelPost: async () => ({ ok: true, dados: {} }),
      acoes: { criar: async () => 1, pendente: async () => null, confirmar: async () => false, cancelar: async () => {}, ultimaFeita: async () => null },
      groq: { chat: async () => ({ content: 'x', toolCalls: [], modelo: 'm', tokens: 0 }) },
      registro: { gravar: async (l: any) => { gravados.push(l); }, contexto: async () => [] },
      wa: { enviarComId: async () => { throw new Error('WhatsApp HTTP 400: G@g.us sem permissão para 5511999998888'); }, enviarImagemComId: async () => 'I' },
      renderizar: async () => Buffer.from('png'), hoje: () => '2026-10-11', painelUrl: 'https://p', log: (x) => logs.push(x),
    });
    bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(JSON.stringify(gravados) + logs.join()).not.toMatch(/@g\.us|5511999998888/);
    expect(gravados[0].erro).toContain('<grupo>');
  });
});

// 28/10 (fase 2): esperando a cota do Groq, o grupo sabe (uma vez por pergunta) e a espera fica registrada
describe('fase 2: espera da cota', () => {
  function comEsperas(esperas: number[][]) {
    const enviados: string[] = []; const gravados: any[] = [];
    const bot = criarBot({
      cfg, painel: async () => ({ ok: true, dados: {} }), painelPost: async () => ({ ok: true, dados: {} }),
      acoes: { criar: async () => 1, pendente: async () => null, confirmar: async () => false, cancelar: async () => {}, ultimaFeita: async () => null },
      groq: { chat: async (_m: any, _t: any, o?: { aoEsperar?: (ms: number) => void }) => {
        for (const ms of esperas.shift() ?? []) o?.aoEsperar?.(ms);
        return { content: 'Fase 1.', toolCalls: [], modelo: 'm', tokens: 0 };
      } },
      registro: { gravar: async (l: any) => { gravados.push(l); }, contexto: async () => [] },
      wa: { enviarComId: async (t: string) => { enviados.push(t); return `R${enviados.length}`; }, enviarImagemComId: async () => 'I' },
      renderizar: async () => Buffer.from('png'), hoje: () => '2026-10-11', painelUrl: 'https://p', log: () => {},
    });
    return { bot, enviados, gravados };
  }
  it('espera longa: um "⏳" antes da resposta, mesmo com duas esperas; espera gravada', async () => {
    const m = comEsperas([[15000, 12000]]);
    m.bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(m.enviados[0]).toBe(textoEspera(15000));
    expect(m.enviados.filter((t) => t.startsWith('⏳'))).toHaveLength(1);
    expect(m.enviados).toHaveLength(2);
    expect(m.gravados[0].esperaMs).toBe(27000);
  });
  it('espera curta (até 10 s): não avisa, mas grava', async () => {
    const m = comEsperas([[8000]]);
    m.bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(m.enviados.some((t) => t.startsWith('⏳'))).toBe(false);
    expect(m.gravados[0].esperaMs).toBe(8000);
  });
  it('o id do "⏳" entra em enviados (o bot não se responde)', async () => {
    const m = comEsperas([[15000]]);
    m.bot.receber(ev('bot qual a fase?'));
    await espera();
    expect(m.bot.enviados.has('R1')).toBe(true);
  });
});
