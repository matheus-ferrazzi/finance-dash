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
  'Você é o Zeca, o assistente financeiro do casal Matheus e Ariane, num grupo de WhatsApp. Chamam você por "Zeca" ou "bot".',
  `Quem perguntou: ${quem}. Hoje é ${hoje} (horário de São Paulo).`,
  'Use SEMPRE as ferramentas para qualquer número. Nunca some, subtraia, calcule percentual ou invente valor: copie os valores das ferramentas.',
  'Se nenhuma ferramenta serve, diga que ainda não sabe responder. Não chute.',
  'Responda em português, tom contido, até 8 linhas, um emoji no começo de cada linha, *negrito* do WhatsApp para o número principal.',
  'Não escreva links nem caminhos (/gastos etc.): o sistema acrescenta o link do painel.',
  'Para corrigir a categoria de um gasto: buscar_lancamentos e depois propor_categoria com a ref L1..L5 que ela devolveu. Para conta avulsa: propor_conta_avulsa. Gasto pago em dinheiro vivo: propor_gasto_dinheiro.',
  'Você nunca grava nada: as propostas só valem quando a pessoa responder "sim". Não diga que algo foi feito.',
  'Num pedido de lançar ou mudar algo, chame a ferramenta de proposta mesmo que a data ou o valor pareçam fora do permitido: ela responde o motivo, e você repassa esse motivo.',
  'Períodos: hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM. "Eu" = quem perguntou.',
  // 22/10: explicar as mensagens do próprio Zeca
  'Se a pergunta vier com uma "Mensagem citada", ela é uma mensagem sua. Se perguntarem de uma mensagem sua sem citar ("explica o diário", "o que foi aquele alerta?"), use mensagens_do_zeca.',
  // 27/10: explicava o que cada termo significa ("Hoje dá pra gastar: o valor que pode ser usado…"); agora mostra a conta
  'Ao explicar uma mensagem ou um número (dá pra gastar, ritmo, nesse passo, pela média, mês no vermelho): NÃO repita a mensagem e NÃO diga o que o termo significa. Mostre a conta que chegou no número, com os valores.',
  'A conta vem pronta no campo "explicacao" (uma frase por número, na ordem da conta): copie as frases com os valores, sem refazer conta. Comece sempre pela "Origem" e pelo que ainda sai: é o que explica a sobra.',
  'Mensagem citada: a conta vem junto com ela. Sem citar: use o "explicacao" da mensagem em mensagens_do_zeca (números da hora em que ela saiu); se ela não tiver "explicacao", use o de situacao_mes, tire TODOS os números dele (nenhum da mensagem) e diga na primeira linha que são os números de agora.',
  'Ritmo acima do que dá pra gastar: chame também maiores_gastos com este_mes e cite os 2 ou 3 maiores, para dizer o que puxou o ritmo.',
  'Na explicação: até 10 linhas, sem explicar a saudação ("Bom dia!"). "out/26" é o mês (outubro de 2026), nunca um dia.',
  'A cor de cada linha é a bolinha que está nela na mensagem: nunca diga outra cor. Só se a pergunta afirmar algo que a mensagem não diz (ex.: "fecha no azul" quando a linha diz vermelho e o valor é negativo), a primeira linha da resposta corrige, direto: "Na verdade não fecha no azul: pela média fecha em -R$ X (🔴)."',
  'Na explicação, o emoji do começo de cada linha é só um: 👉 (nada antes nem depois dele). As bolinhas 🟢🟡🔴 só aparecem no meio da frase, quando você cita a cor de uma linha da mensagem.',
  'Outras linhas das suas mensagens (sem "conta"; explique com os números da mensagem):',
  '- Bolinhas: 🟢 bom, 🟡 atenção, 🔴 ruim; a primeira linha da mensagem é o assunto e o tom.',
  '- "Atenção · Fora do padrão": um gasto bem maior do que costuma ser naquele lugar.',
  '- "Meta de gastos": débito + crédito (compra parcelada conta a parcela do mês), fora contas da casa e dívida antiga; a meta é a média dos 6 meses fechados menos 10%.',
  '- "Dívida antiga fora do total": renegociação, parcelamento de fatura, empréstimo, juros e encargos de atraso não entram no total de gastos; aparecem à parte.',
  '- "Gasto grande": um gasto a partir de 500 reais, sem aluguel, contas fixas nem dívida antiga.',
  '- "Semana acima/abaixo da média": o gasto do dia a dia da semana comparado com a média das 4 semanas anteriores.',
  '- "Aviso técnico": algo do sistema falhou (conexão de banco parada, backup, rodada de atualização).',
].join('\n');

type ContaCitada = { explicacao: string[]; agora: boolean };
/** 22/10: a pergunta com a mensagem citada (respondida) na frente, para o modelo saber de qual mensagem se fala. */
const comCitada = (p: Pergunta, conta: ContaCitada | null) => {
  if (!p.citada) return p.texto;
  const titulo = conta?.agora
    ? 'Conta de AGORA (a mensagem é de antes e não guardou a conta): diga na primeira linha que são os números de agora e não use nenhum número da mensagem'
    : 'Conta desta mensagem (números da hora em que ela saiu)';
  const bloco = conta ? `\n${titulo}, campo explicacao:\n${conta.explicacao.map((l) => `- ${l}`).join('\n')}\n` : '';
  return `Mensagem citada:\n"""\n${p.citada}\n"""\n${bloco}\nPergunta: ${p.texto}`;
};
/** Primeira linha sem negrito nem espaços: acha a mensagem citada entre as que o Zeca mandou. */
const chaveMsg = (t: string) => (t.split('\n').find((l) => l.trim()) ?? '').replace(/[*_\s]/g, '');
/** Percentuais escritos no texto (a trava só aceita % que veio de dado). */
const pctsDoTexto = (t: string) => [...t.matchAll(/(-?\d+(?:,\d+)?)\s*%/g)].map((m) => Number(m[1].replace(',', '.')));

type DepsResponder = {
  groq: Pick<ClienteGroq, 'chat'>; painel: (caminho: string) => Promise<{ ok: boolean; dados: any }>;
  /** E1-M3: com quem perguntou (um "e eu?" de outra pessoa não vira a pessoa errada) */
  contexto: { pessoa?: string; pergunta: string; resposta: string }[]; hoje: string; painelUrl: string;
  /** E2: ferramentas que rodam no worker (busca com refs, propostas) */
  locais?: Record<string, (args: any) => Promise<{ ok: boolean; dados: any }>>;
};

/**
 * 27/10: a conta por trás da mensagem citada, buscada antes do modelo — com só o texto citado ele explicava sem
 * chamar ferramenta (e sem conta). Diário com a conta guardada: a daquela hora; diário sem ela (antes de 27/10)
 * ou citação que não achou a mensagem mas fala do ritmo: a de agora. Outras mensagens: nada (explica com o texto).
 */
async function contaDaCitada(citada: string, d: DepsResponder): Promise<ContaCitada | null> {
  try {
    const ms: any[] = (await d.locais?.mensagens_do_zeca?.({}))?.dados?.mensagens ?? [];
    const m = ms.find((x) => chaveMsg(String(x.texto ?? '')) === chaveMsg(citada));
    if (Array.isArray(m?.explicacao)) return { explicacao: m.explicacao, agora: false };
    if (m ? m.tipo !== 'diario' : !/dá pra gastar|nesse passo|pela média/i.test(citada)) return null;
    const s = await d.painel('/api/bot/situacao');
    return s.ok && Array.isArray(s.dados?.explicacao) ? { explicacao: s.dados.explicacao, agora: true } : null;
  } catch { return null; }
}

export async function responder(p: Pergunta, d: DepsResponder): Promise<RespostaBot> {
  const t0 = Date.now();
  const ferramentas: RespostaBot['ferramentas'] = [];
  const conta = p.citada ? await contaDaCitada(p.citada, d) : null;
  // 22/10: a mensagem citada vale como dado conferido (o Zeca explica com os números dela). 27/10: com a conta de
  // agora, só ela vale — número da mensagem misturado com o de agora é de outra hora
  const resultados: unknown[] = !p.citada ? [] : conta?.agora ? [{ explicacao: conta.explicacao }]
    : [{ citada: p.citada, pct: pctsDoTexto(p.citada), ...(conta ? { explicacao: conta.explicacao } : {}) }];
  let ultima: { nome: string; dados: any } | null = null;
  // E1-M6: todas as ferramentas que responderam (uma vez cada, a última resposta de cada) — o texto montado
  // mostra todas, com um link só (o da última), em vez de só a última
  const respondidas = new Map<string, any>();
  const montadoDeTodas = () => {
    const partes = Array.from(respondidas, ([nome, dados]) => formatar(nome, dados, d.painelUrl));
    if (!partes.length) return ultima ? formatar(ultima.nome, ultima.dados, d.painelUrl) : FALHA;
    const semLink = (t: string) => t.replace(/\n\n👉 \S+$/, '');
    return [...partes.slice(0, -1).map(semLink), partes[partes.length - 1]].join('\n\n');
  };
  // E2: a proposta criada nesta conversa sempre é mostrada (uma proposta escondida seria confirmada às cegas)
  let proposta: string | null = null;
  // E3: motivo da última proposta recusada (data futura, valor fora…) — vira a resposta se o modelo não explicar
  let recusa: string | null = null;
  const msgs: MsgChat[] = [
    { role: 'system', content: SISTEMA(p.pessoa, d.hoje) },
    ...d.contexto.flatMap((c): MsgChat[] => [
      { role: 'user', content: c.pessoa ? `${c.pessoa}: ${c.pergunta}` : c.pergunta }, { role: 'assistant', content: c.resposta },
    ]),
    { role: 'user', content: comCitada(p, conta) },
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
        // com mensagem citada, explicar sem ferramenta vale (os números passam pela trava contra o texto citado)
        if (!ferramentas.length && !p.citada) return fimCom(SEM_FERRAMENTA, { modelo, semFerramenta: true });
        // E2: proposta e lista são textos do sistema — o modelo não reescreve
        if (proposta) return fimCom(proposta, { modelo, svg: null });
        if (ultima?.dados?.lista) return fimCom(ultima.dados.lista, { modelo, svg: null });
        // decisão (simular) e listas que o modelo resumia mal (faturas, contas): sempre o texto montado
        if (ultima && SEMPRE_MONTADO.has(ultima.nome)) return fimCom(montadoDeTodas(), { modelo });
        if (!texto || !respostaConfere(texto, resultados)) {
          // sem dado de ferramenta para montar: não arrisca texto com número não conferido
          if (ultima) return fimCom(montadoDeTodas(), { modelo, trava: !!texto });
          // 27/10: explicando uma mensagem citada, a conta dela já é a resposta
          if (conta) return fimCom(conta.explicacao.map((l) => `👉 ${l}`).join('\n'), { modelo, trava: !!texto });
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
        if (res.ok) {
          resultados.push(res.dados); ultima = { nome: t.nome, dados: res.dados };
          if (!d.locais?.[t.nome]) { respondidas.delete(t.nome); respondidas.set(t.nome, res.dados); }
        }
        if (res.ok && res.dados?.proposta) proposta = res.dados.proposta;
        if (!res.ok && t.nome.startsWith('propor_') && typeof res.dados?.erro === 'string') recusa = res.dados.erro;
        msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(res.dados) });
      }
    }
    // rodadas esgotadas: responde com o que já tem (proposta primeiro)
    if (proposta) return fimCom(proposta, { modelo, svg: null });
    // E1-M5: não é "trava" (o modelo não escreveu texto para conferir): só o dado montado
    if (ultima?.dados?.lista) return fimCom(ultima.dados.lista, { modelo, svg: null });
    return respondidas.size ? fimCom(montadoDeTodas(), { modelo }) : fimCom(FALHA, { modelo, erro: 'rodadas esgotadas sem dados' });
  } catch (e) {
    return fimCom(FALHA, { modelo, erro: e instanceof Error ? e.message : String(e), svg: null });
  }
}
