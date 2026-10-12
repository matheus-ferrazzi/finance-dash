// E1: o agente — o Groq escolhe ferramentas e escreve; números só das ferramentas (trava); até 4 rodadas.
import { caminhoDa, formatar, graficoDaFerramenta, TOOLS } from './ferramentas';
import type { ClienteGroq, MsgChat } from './groq';
import type { Pergunta } from './entrada';
import { respostaConfere } from './trava';

export const FALHA = '⚠️ Não consegui responder agora. Tenta de novo em alguns minutos.';
export const SEM_FERRAMENTA = '🤷 Ainda não sei responder isso. Anotei a pergunta.';
export const SO_TEXTO = '🎧 Por enquanto só leio texto.';
const RODADAS = 4;

export interface RespostaBot {
  texto: string; svg: string | null; ferramentas: { nome: string; args: unknown; ok: boolean }[];
  modelo: string | null; trava: boolean; semFerramenta: boolean; erro: string | null; ms: number;
}

const SISTEMA = (quem: string, hoje: string) => [
  'Você é o assistente financeiro do casal Matheus e Ariane, num grupo de WhatsApp.',
  `Quem perguntou: ${quem}. Hoje é ${hoje} (horário de São Paulo).`,
  'Use SEMPRE as ferramentas para qualquer número. Nunca some, subtraia, calcule percentual ou invente valor: copie os valores das ferramentas.',
  'Se nenhuma ferramenta serve, diga que ainda não sabe responder. Não chute.',
  'Responda em português, tom contido, até 8 linhas, um emoji no começo de cada linha, *negrito* do WhatsApp para o número principal.',
  'Períodos: hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM. "Eu" = quem perguntou.',
].join('\n');

export async function responder(p: Pergunta, d: {
  groq: Pick<ClienteGroq, 'chat'>; painel: (caminho: string) => Promise<{ ok: boolean; dados: any }>;
  contexto: { pergunta: string; resposta: string }[]; hoje: string; painelUrl: string;
}): Promise<RespostaBot> {
  const t0 = Date.now();
  const ferramentas: RespostaBot['ferramentas'] = [];
  const resultados: unknown[] = [];
  let ultima: { nome: string; dados: any } | null = null;
  const msgs: MsgChat[] = [
    { role: 'system', content: SISTEMA(p.pessoa, d.hoje) },
    ...d.contexto.flatMap((c): MsgChat[] => [{ role: 'user', content: c.pergunta }, { role: 'assistant', content: c.resposta }]),
    { role: 'user', content: p.texto },
  ];
  const fimCom = (texto: string, extra: Partial<RespostaBot> = {}): RespostaBot => ({
    texto, svg: ultima ? graficoDaFerramenta(ultima.nome, ultima.dados) : null, ferramentas, modelo: null,
    trava: false, semFerramenta: false, erro: null, ms: Date.now() - t0, ...extra,
  });
  let modelo: string | null = null;
  try {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const r = await d.groq.chat(msgs, TOOLS);
      modelo = r.modelo;
      if (!r.toolCalls.length) {
        const texto = (r.content ?? '').trim();
        if (!ferramentas.length) return fimCom(SEM_FERRAMENTA, { modelo, semFerramenta: true });
        if (!texto || !respostaConfere(texto, resultados)) {
          // sem dado de ferramenta para montar: não arrisca texto com número não conferido
          return ultima ? fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: !!texto }) : fimCom(FALHA, { modelo, erro: 'resposta sem dados conferidos' });
        }
        // a resposta nunca pode parecer um chamado ("bot ...") ou o bot se responderia
        return fimCom(/^\s*bot(?![\p{L}\p{N}])/iu.test(texto) ? `🤖 ${texto}` : texto, { modelo });
      }
      msgs.push({ role: 'assistant', content: r.content, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.nome, arguments: t.args } })) });
      for (const t of r.toolCalls) {
        let args: Record<string, unknown> = {};
        let res: { ok: boolean; dados: any };
        try { args = JSON.parse(t.args || '{}'); } catch { args = {}; }
        const caminho = /^\s*\{[\s\S]*\}\s*$/.test(t.args || '{}') ? caminhoDa(t.nome, args, p.pessoa) : null;
        res = caminho ? await d.painel(caminho).catch((e) => ({ ok: false, dados: { erro: String(e) } })) : { ok: false, dados: { erro: 'ferramenta ou argumentos inválidos' } };
        ferramentas.push({ nome: t.nome, args, ok: res.ok });
        if (res.ok) { resultados.push(res.dados); ultima = { nome: t.nome, dados: res.dados }; }
        msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(res.dados) });
      }
    }
    // rodadas esgotadas: responde com o que já tem
    return ultima ? fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: true }) : fimCom(FALHA, { modelo, erro: 'rodadas esgotadas sem dados' });
  } catch (e) {
    return fimCom(FALHA, { modelo, erro: e instanceof Error ? e.message : String(e), svg: null });
  }
}
