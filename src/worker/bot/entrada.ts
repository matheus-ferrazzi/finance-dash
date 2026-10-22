// E1: filtro do webhook. Nada aqui loga ou grava: o que não é do grupo, de membro e chamando o bot some.
import { lerResposta } from './acoesTextos';
export interface ConfigEntrada { grupo: string; membros: Record<string, string[]>; botJids: string[] }
/** `citada` (22/10): o texto da mensagem que a pessoa citou (respondeu), para o Zeca explicar a mensagem dele */
export interface Pergunta { id: string; pessoa: string; texto: string; citada?: string }
export type Entrada = { tipo: 'pergunta'; p: Pergunta } | { tipo: 'resposta'; p: Pergunta } | { tipo: 'nao_texto'; pessoa: string } | { tipo: 'ignorar' };

const IGNORAR: Entrada = { tipo: 'ignorar' };
const usuario = (jid: string) => jid.split('@')[0].split(':')[0];

/** E1-M4: texto de erro sem JID nem telefone (vai para o log e para a tabela de conversas). */
export function semIdentificadores(s: string): string {
  return s
    .replace(/[\w.:-]+@g\.us/g, '<grupo>')
    .replace(/[\w.:-]+@(s\.whatsapp\.net|lid|c\.us)/g, '<contato>')
    .replace(/\b\d{10,15}\b/g, '<número>');
}

export function lerMembros(v: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const par of v.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [nome, jids] = par.split('=');
    if (nome && jids) out[nome.trim()] = jids.split('|').map((j) => j.trim()).filter(Boolean);
  }
  return out;
}

export function lerWebhook(corpo: unknown, cfg: ConfigEntrada, enviados: ReadonlySet<string>): Entrada {
  const c = corpo as any;
  const ev = String(c?.event ?? '').toLowerCase().replace('_', '.');
  if (ev !== 'messages.upsert') return IGNORAR;
  const d = Array.isArray(c.data) ? c.data[0] : c.data;
  const key = d?.key;
  if (!key || key.remoteJid !== cfg.grupo) return IGNORAR;
  if (key.id && enviados.has(key.id)) return IGNORAR;
  // fromMe sem participant = o próprio número conectado (no número de teste, o Matheus pelo celular)
  const candidatos: string[] = key.fromMe
    ? cfg.botJids
    : [key.participant, key.participantAlt, key.participantPn, d?.participant].filter((x): x is string => typeof x === 'string');
  const pessoa = Object.entries(cfg.membros).find(([, jids]) => jids.some((j) => candidatos.some((x) => usuario(x) === usuario(j))))?.[0];
  if (!pessoa) return IGNORAR;
  const m = d.message ?? {};
  const texto: string | null = m.conversation ?? m.extendedTextMessage?.text ?? null;
  const ctx = (Object.values(m).find((x: any) => x?.contextInfo) as any)?.contextInfo;
  const mencoes: string[] = ctx?.mentionedJid ?? [];
  const mencionou = mencoes.some((j) => cfg.botJids.some((b) => usuario(b) === usuario(j)));
  // sem \b: com acento ("botão") o \b do JS acha fronteira; aqui só não pode vir letra ou número depois.
  // O bot se chama Zeca (14/10/2026); "bot" continua valendo
  const prefixo = /^\s*(?:bot|zeca)(?![\p{L}\p{N}])[\s,:;.!-]*/iu;
  // E1-M9: imagem/vídeo com legenda "bot ..."/"zeca ..." chama o bot (que ainda só lê texto)
  const legenda: string | null = m.imageMessage?.caption ?? m.videoMessage?.caption ?? null;
  if (texto === null) return mencionou || (legenda !== null && prefixo.test(legenda)) ? { tipo: 'nao_texto', pessoa } : IGNORAR;
  // 22/10: a mensagem citada (respondida) — citar uma mensagem do Zeca é chamar o Zeca, e o texto vai junto
  const q = ctx?.quotedMessage;
  const citadaTxt: string | null = q?.conversation ?? q?.extendedTextMessage?.text ?? q?.imageMessage?.caption ?? null;
  const citada = citadaTxt && citadaTxt.trim() ? citadaTxt.trim() : null;
  const citouZeca = !!citada && typeof ctx?.participant === 'string' && cfg.botJids.some((b) => usuario(b) === usuario(ctx.participant));
  // E2: "sim/não/número" sem "bot" — o bot decide se há proposta/lista pendente; frase comum segue ignorada
  if (!prefixo.test(texto) && !mencionou) {
    const r = lerResposta(texto);
    if (r !== null && r !== 'desfaz') return { tipo: 'resposta', p: { id: String(key.id ?? ''), pessoa, texto: texto.trim() } };
    if (!citouZeca) return IGNORAR;
  }
  const limpo = texto.replace(prefixo, '').replace(/@\d+\s*/g, '').trim();
  return { tipo: 'pergunta', p: { id: String(key.id ?? ''), pessoa, texto: limpo || 'oi', ...(citada ? { citada } : {}) } };
}
