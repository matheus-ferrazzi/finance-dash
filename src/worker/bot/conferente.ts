// 28/10 (fase 3): o conferente. Outro modelo, sem a conversa, recebe só a pergunta, os dados das ferramentas e a
// resposta, e diz se cada número e cada rótulo se sustentam. A trava (código) pega número inventado; ele pega o erro
// de sentido ("ainda saem -R$ 72,86", total de outro período, entrada chamada de gasto). Nunca aprova por omissão.
import type { ClienteGroq } from './groq';

export type Veredito = { aprovado: boolean; problemas: string[]; tokens: number; esperaMs: number; modelo: string | null };

const SISTEMA = 'Você confere a resposta de um assistente financeiro antes de ela ir para um grupo de WhatsApp. Você recebe a pergunta, os dados que as ferramentas devolveram e a resposta. Verifique: cada valor e porcentagem da resposta está nos dados ou é conta deles; o rótulo de cada número está certo (o que é gasto, entrada, sobra, ritmo, "nesse passo", "pela média", qual período, qual pessoa); nenhuma afirmação vai além dos dados. Não julgue estilo nem tom. Responda só com JSON: {"aprovado": true} ou {"aprovado": false, "problemas": ["…", "…"]}, cada problema numa frase curta em português.';
const FORMATO = 'conferente não respondeu no formato';
const INDISPONIVEL = 'conferente indisponível';
const FORA = new Set(['link', 'lista', 'proposta', 'svg']);

/** O primeiro modelo da lista que não escreveu a resposta (cota separada); sem saber quem escreveu, o reserva; nenhum outro → []. */
export function modeloConferente(escreveu: string | null, lista: string[]): string[] {
  const outro = lista.find((m, i) => (escreveu === null ? i > 0 : m !== escreveu));
  return outro ? [outro] : [];
}

/** JSON compacto dos dados, sem o que é do sistema (link, lista, proposta, svg), cortado em `max` caracteres. */
export function resumoDados(dados: unknown[], max = 6000): string {
  const s = JSON.stringify(dados, (k, v) => (FORA.has(k) ? undefined : v));
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function lerVeredito(c: string | null): { aprovado: boolean; problemas: string[] } {
  const m = /\{[\s\S]*\}/.exec(c ?? '');
  try {
    const j = m ? JSON.parse(m[0]) : null;
    if (j?.aprovado === true) return { aprovado: true, problemas: [] };
    if (j?.aprovado === false) {
      const ps = Array.isArray(j.problemas) ? j.problemas.map(String).filter((x: string) => x.trim()) : [];
      return { aprovado: false, problemas: ps.length ? ps : [FORMATO] };
    }
  } catch { /* cai no formato */ }
  return { aprovado: false, problemas: [FORMATO] };
}

export async function conferir(d: {
  groq: Pick<ClienteGroq, 'chat'>; modelos: string[]; pergunta: string; dados: unknown[]; resposta: string;
  aoEsperar?: (ms: number) => void;
}): Promise<Veredito> {
  let esperaMs = 0;
  if (!d.modelos.length) return { aprovado: false, problemas: [INDISPONIVEL], tokens: 0, esperaMs, modelo: null };
  try {
    const r = await d.groq.chat([
      { role: 'system', content: SISTEMA },
      { role: 'user', content: `Pergunta:\n${d.pergunta}\n\nDados:\n${resumoDados(d.dados)}\n\nResposta:\n${d.resposta}` },
    ], [], { modelos: d.modelos, aoEsperar: (ms) => { esperaMs += ms; d.aoEsperar?.(ms); } });
    return { ...lerVeredito(r.content), tokens: r.tokens ?? 0, esperaMs, modelo: r.modelo };
  } catch {
    return { aprovado: false, problemas: [INDISPONIVEL], tokens: 0, esperaMs, modelo: null };
  }
}
