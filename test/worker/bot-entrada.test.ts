import { describe, expect, it } from 'vitest';
import { lerMembros, lerWebhook, semIdentificadores } from '../../src/worker/bot/entrada';

const G = '120363000000000001@g.us';
const cfg = { grupo: G, membros: { Matheus: ['5500000000001@s.whatsapp.net', '111@lid'], Ariane: ['5500000000002@s.whatsapp.net', '222@lid'] }, botJids: ['5500000000001@s.whatsapp.net', '111@lid'] };
const msg = (p: { remoteJid?: string; fromMe?: boolean; participant?: string; id?: string; texto?: string; mencoes?: string[]; tipo?: object }) => ({
  event: 'messages.upsert', instance: 'financas',
  data: {
    key: { remoteJid: p.remoteJid ?? G, fromMe: p.fromMe ?? false, id: p.id ?? 'X1', ...(p.participant ? { participant: p.participant } : {}) },
    message: p.tipo ?? (p.mencoes ? { extendedTextMessage: { text: p.texto, contextInfo: { mentionedJid: p.mencoes } } } : { conversation: p.texto }),
  },
});

describe('lerWebhook', () => {
  it('pergunta da Ariane com prefixo "bot" (vírgula, maiúscula): texto limpo', () => {
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'Bot, quanto gastei com mercado?' }), cfg, new Set()))
      .toEqual({ tipo: 'pergunta', p: { id: 'X1', pessoa: 'Ariane', texto: 'quanto gastei com mercado?' } });
  });
  it('menção ao bot também chama; a menção sai do texto', () => {
    expect(lerWebhook(msg({ participant: '5500000000002@s.whatsapp.net', texto: '@5500000000001 dá pra gastar quanto hoje?', mencoes: ['5500000000001@s.whatsapp.net'] }), cfg, new Set()))
      .toMatchObject({ tipo: 'pergunta', p: { pessoa: 'Ariane', texto: 'dá pra gastar quanto hoje?' } });
  });
  it('Matheus pelo próprio celular (fromMe, sem participant) é pergunta dele', () => {
    expect(lerWebhook(msg({ fromMe: true, texto: 'bot trilha' }), cfg, new Set())).toMatchObject({ tipo: 'pergunta', p: { pessoa: 'Matheus', texto: 'trilha' } });
  });
  it('resposta do próprio bot (id enviado) é ignorada', () => {
    expect(lerWebhook(msg({ fromMe: true, id: 'B9', texto: 'bot: 💸 Hoje dá pra gastar' }), cfg, new Set(['B9']))).toEqual({ tipo: 'ignorar' });
  });
  it('outra conversa, não membro, sem chamado, evento diferente: ignorar', () => {
    expect(lerWebhook(msg({ remoteJid: '5599999999999@s.whatsapp.net', texto: 'bot oi' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '999@lid', texto: 'bot oi' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'robotizado não é chamado' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook({ event: 'connection.update', data: {} }, cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(null, cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
  it('áudio mencionando o bot: nao_texto; áudio sem menção: ignorar', () => {
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { audioMessage: { contextInfo: { mentionedJid: ['111@lid'] } } } }), cfg, new Set())).toEqual({ tipo: 'nao_texto', pessoa: 'Ariane' });
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { audioMessage: {} } }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
});

describe('lerMembros', () => {
  it('Nome=jid|jid;Nome=jid', () => {
    expect(lerMembros('Matheus=a@lid|b@s.whatsapp.net;Ariane=c@lid')).toEqual({ Matheus: ['a@lid', 'b@s.whatsapp.net'], Ariane: ['c@lid'] });
    expect(lerMembros('')).toEqual({});
  });
});

describe('prefixo com acento (revisão E1)', () => {
  it('"botão" e "Botões" não chamam o bot; "bot!" chama', () => {
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'botão quebrou' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'Botões novos' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'bot! trilha' }), cfg, new Set())).toMatchObject({ tipo: 'pergunta', p: { texto: 'trilha' } });
  });
});

describe('respostas curtas (E2)', () => {
  it('"sim" e "2" de membro, sem bot: tipo resposta; frase comum sem bot: ignorar; "desfaz" sem bot: ignorar', () => {
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'sim' }), cfg, new Set())).toEqual({ tipo: 'resposta', p: { id: 'X1', pessoa: 'Ariane', texto: 'sim' } });
    expect(lerWebhook(msg({ participant: '222@lid', texto: '2' }), cfg, new Set())).toMatchObject({ tipo: 'resposta' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'sim, vamos jantar' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'desfaz' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(msg({ participant: '999@lid', texto: 'sim' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
});

describe('pendências do E1 (auditoria 13/10)', () => {
  // M9: imagem com legenda "bot ..." era ignorada em silêncio
  it('M9: imagem com legenda chamando o bot responde "só leio texto"; legenda comum, ignora', () => {
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { imageMessage: { caption: 'bot quanto foi isso?' } } }), cfg, new Set()))
      .toEqual({ tipo: 'nao_texto', pessoa: 'Ariane' });
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { imageMessage: { caption: 'olha que lindo' } } }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
  // M4: erro de envio podia levar o JID do grupo ou um telefone para o log/tabela
  it('M4: tira JID e telefone de um texto de erro', () => {
    expect(semIdentificadores('WhatsApp HTTP 400: 120363000000000001@g.us não existe; número 5511999998888 inválido; 111@lid'))
      .toBe('WhatsApp HTTP 400: <grupo> não existe; número <número> inválido; <contato>');
  });
});

// 14/10/2026: o bot se chama Zeca (escolha do Matheus); "bot ..." continua valendo
describe('nome do bot', () => {
  it('"Zeca, ..." e "zeca ..." chamam o bot; o nome sai do texto', () => {
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'Zeca, quanto gastei com mercado?' }), cfg, new Set()))
      .toEqual({ tipo: 'pergunta', p: { id: 'X1', pessoa: 'Ariane', texto: 'quanto gastei com mercado?' } });
    expect(lerWebhook(msg({ participant: '222@lid', texto: 'zeca trilha' }), cfg, new Set())).toMatchObject({ tipo: 'pergunta', p: { texto: 'trilha' } });
  });
  it('"Zecão", "Zezeca" e "o zeca falou" não chamam', () => {
    for (const t of ['Zecão chegou', 'Zezeca', 'o zeca falou']) expect(lerWebhook(msg({ participant: '222@lid', texto: t }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
  });
  it('imagem com legenda "zeca ..." também chama', () => {
    expect(lerWebhook(msg({ participant: '222@lid', tipo: { imageMessage: { caption: 'zeca o que é isso?' } } }), cfg, new Set())).toMatchObject({ tipo: 'nao_texto' });
  });
});

// 22/10 (pedido do Matheus): responder citando uma mensagem do Zeca é chamar o Zeca, e o texto citado vai junto
describe('mensagem citada', () => {
  const citando = (p: { participant: string; texto: string; autor: string; citada: string }) => ({
    event: 'messages.upsert', instance: 'financas',
    data: {
      key: { remoteJid: G, fromMe: false, id: 'C1', participant: p.participant },
      message: { extendedTextMessage: { text: p.texto, contextInfo: { participant: p.autor, quotedMessage: { conversation: p.citada } } } },
    },
  });
  const diario = '🔴 *Ritmo acima do que cabe* · nesse passo out/26 fecha no vermelho';
  it('citando o Zeca, sem "zeca": pergunta com o texto citado', () => {
    expect(lerWebhook(citando({ participant: '222@lid', texto: 'por que vermelho?', autor: '111@lid', citada: diario }), cfg, new Set()))
      .toEqual({ tipo: 'pergunta', p: { id: 'C1', pessoa: 'Ariane', texto: 'por que vermelho?', citada: diario } });
  });
  it('citando outra pessoa, sem "zeca": ignora; com "zeca": pergunta com o citado', () => {
    expect(lerWebhook(citando({ participant: '222@lid', texto: 'por que?', autor: '5500000000009@s.whatsapp.net', citada: 'oi' }), cfg, new Set())).toEqual({ tipo: 'ignorar' });
    expect(lerWebhook(citando({ participant: '222@lid', texto: 'zeca explica isso', autor: '5500000000009@s.whatsapp.net', citada: 'gastei 50' }), cfg, new Set()))
      .toMatchObject({ tipo: 'pergunta', p: { texto: 'explica isso', citada: 'gastei 50' } });
  });
  it('"sim" citando a proposta do Zeca continua sendo resposta à proposta', () => {
    expect(lerWebhook(citando({ participant: '222@lid', texto: 'sim', autor: '111@lid', citada: '📝 Proposta: ...' }), cfg, new Set())).toMatchObject({ tipo: 'resposta' });
  });
});
