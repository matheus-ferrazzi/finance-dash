// E1: filtro do webhook. Nada aqui loga ou grava: o que não é do grupo, de membro e chamando o bot some.
export interface ConfigEntrada { grupo: string; membros: Record<string, string[]>; botJids: string[] }
export interface Pergunta { id: string; pessoa: string; texto: string }
export type Entrada = { tipo: 'pergunta'; p: Pergunta } | { tipo: 'nao_texto'; pessoa: string } | { tipo: 'ignorar' };

const IGNORAR: Entrada = { tipo: 'ignorar' };
const usuario = (jid: string) => jid.split('@')[0].split(':')[0];

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
  if (texto === null) return mencionou ? { tipo: 'nao_texto', pessoa } : IGNORAR;
  // sem \b: com acento ("botão") o \b do JS acha fronteira; aqui só não pode vir letra ou número depois
  const prefixo = /^\s*bot(?![\p{L}\p{N}])[\s,:;.!-]*/iu;
  if (!prefixo.test(texto) && !mencionou) return IGNORAR;
  const limpo = texto.replace(prefixo, '').replace(/@\d+\s*/g, '').trim();
  return { tipo: 'pergunta', p: { id: String(key.id ?? ''), pessoa, texto: limpo || 'oi' } };
}
