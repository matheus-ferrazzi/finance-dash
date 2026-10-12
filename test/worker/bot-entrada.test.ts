import { describe, expect, it } from 'vitest';
import { lerMembros, lerWebhook } from '../../src/worker/bot/entrada';

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
