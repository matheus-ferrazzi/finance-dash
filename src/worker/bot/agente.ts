// E1: o agente — o Groq escolhe ferramentas e escreve; números só das ferramentas (trava); até 4 rodadas.
import { caminhoDa, formatar, graficoDaFerramenta, TOOLS } from './ferramentas';
import type { ClienteGroq, MsgChat } from './groq';
import type { Pergunta } from './entrada';
import { respostaConfere } from './trava';

export const FALHA = '⚠️ Não consegui responder agora. Tenta de novo em alguns minutos.';
export const SEM_FERRAMENTA = '🤷 Ainda não sei responder isso. Anotei a pergunta.';
export const SO_TEXTO = '🎧 Por enquanto só leio texto.';
const RODADAS = 4;
const SEMPRE_MONTADO = new Set(['simular_compra', 'faturas', 'contas_do_mes', 'investimentos']);

/** O link do painel é do sistema, não do modelo: tira o que ele escreveu (relativo ou completo) e põe o certo no fim. */
function comLink(texto: string, painelUrl: string, link: string | undefined): string {
  if (!link) return texto;
  const base = painelUrl.replace(/\/+$/, '');
  const linhas = texto.split('\n').filter((l) => !(base && l.includes(base)) && !/(^|\s)\/[a-z][\w-]*(\?\S*)?\s*$/i.test(l));
  return `${linhas.join('\n').trimEnd()}\n\n👉 ${base}${link}`;
}

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
  'Não escreva links nem caminhos (/gastos etc.): o sistema acrescenta o link do painel.',
  'Para corrigir a categoria de um gasto: buscar_lancamentos e depois propor_categoria com a ref L1..L5 que ela devolveu. Para conta avulsa: propor_conta_avulsa. Gasto pago em dinheiro vivo: propor_gasto_dinheiro.',
  'Você nunca grava nada: as propostas só valem quando a pessoa responder "sim". Não diga que algo foi feito.',
  'Num pedido de lançar ou mudar algo, chame a ferramenta de proposta mesmo que a data ou o valor pareçam fora do permitido: ela responde o motivo, e você repassa esse motivo.',
  'Períodos: hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM. "Eu" = quem perguntou.',
].join('\n');

export async function responder(p: Pergunta, d: {
  groq: Pick<ClienteGroq, 'chat'>; painel: (caminho: string) => Promise<{ ok: boolean; dados: any }>;
  contexto: { pergunta: string; resposta: string }[]; hoje: string; painelUrl: string;
  /** E2: ferramentas que rodam no worker (busca com refs, propostas) */
  locais?: Record<string, (args: any) => Promise<{ ok: boolean; dados: any }>>;
}): Promise<RespostaBot> {
  const t0 = Date.now();
  const ferramentas: RespostaBot['ferramentas'] = [];
  const resultados: unknown[] = [];
  let ultima: { nome: string; dados: any } | null = null;
  // E2: a proposta criada nesta conversa sempre é mostrada (uma proposta escondida seria confirmada às cegas)
  let proposta: string | null = null;
  // E3: motivo da última proposta recusada (data futura, valor fora…) — vira a resposta se o modelo não explicar
  let recusa: string | null = null;
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
        // E2: proposta e lista são textos do sistema — o modelo não reescreve
        if (proposta) return fimCom(proposta, { modelo, svg: null });
        if (ultima?.dados?.lista) return fimCom(ultima.dados.lista, { modelo, svg: null });
        // decisão (simular) e listas que o modelo resumia mal (faturas, contas): sempre o texto montado
        if (ultima && SEMPRE_MONTADO.has(ultima.nome)) return fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo });
        if (!texto || !respostaConfere(texto, resultados)) {
          // sem dado de ferramenta para montar: não arrisca texto com número não conferido
          if (ultima) return fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: !!texto });
          if (recusa) return fimCom(`⚠️ Não deu para lançar: ${recusa.replace(/\.+$/, '')}.`, { modelo });
          return fimCom(FALHA, { modelo, erro: 'resposta sem dados conferidos' });
        }
        // a resposta nunca pode parecer um chamado ("bot ...") ou o bot se responderia
        // WhatsApp usa *um* asterisco para negrito; o modelo às vezes escreve o **Markdown**
        const zap = texto.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
        const final = /^\s*bot(?![\p{L}\p{N}])/iu.test(zap) ? `🤖 ${zap}` : zap;
        return fimCom(ultima ? comLink(final, d.painelUrl, ultima.dados?.link) : final, { modelo });
      }
      msgs.push({ role: 'assistant', content: r.content, tool_calls: r.toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.nome, arguments: t.args } })) });
      for (const t of r.toolCalls) {
        let args: Record<string, unknown> = {};
        let res: { ok: boolean; dados: any };
        try { args = JSON.parse(t.args || '{}'); } catch { args = {}; }
        const jsonOk = /^\s*\{[\s\S]*\}\s*$/.test(t.args || '{}');
        const local = d.locais?.[t.nome];
        if (local) {
          res = jsonOk ? await local(args).catch((e) => ({ ok: false, dados: { erro: String(e) } })) : { ok: false, dados: { erro: 'argumentos inválidos' } };
        } else {
          const caminho = jsonOk ? caminhoDa(t.nome, args, p.pessoa) : null;
          res = caminho ? await d.painel(caminho).catch((e) => ({ ok: false, dados: { erro: String(e) } })) : { ok: false, dados: { erro: 'ferramenta ou argumentos inválidos' } };
        }
        ferramentas.push({ nome: t.nome, args, ok: res.ok });
        if (res.ok) { resultados.push(res.dados); ultima = { nome: t.nome, dados: res.dados }; }
        if (res.ok && res.dados?.proposta) proposta = res.dados.proposta;
        if (!res.ok && t.nome.startsWith('propor_') && typeof res.dados?.erro === 'string') recusa = res.dados.erro;
        msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(res.dados) });
      }
    }
    // rodadas esgotadas: responde com o que já tem (proposta primeiro)
    if (proposta) return fimCom(proposta, { modelo, svg: null });
    return ultima ? fimCom(formatar(ultima.nome, ultima.dados, d.painelUrl), { modelo, trava: true }) : fimCom(FALHA, { modelo, erro: 'rodadas esgotadas sem dados' });
  } catch (e) {
    return fimCom(FALHA, { modelo, erro: e instanceof Error ? e.message : String(e), svg: null });
  }
}
