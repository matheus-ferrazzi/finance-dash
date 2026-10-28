// E1: o agente — o Groq escolhe ferramentas e escreve; números só das ferramentas (trava); até 4 rodadas.
import { caminhoDa, formatar, graficoDaFerramenta } from './ferramentas';
import { escolherGrupos, ferramentasDe, TODOS_GRUPOS, type Grupo } from './escolha';
import { LimiteGroq, type ClienteGroq, type MsgChat } from './groq';
import type { Pergunta } from './entrada';
import { respostaConfere } from './trava';
import { INDISPONIVEL, modeloConferente, type conferir } from './conferente';

export const FALHA = '⚠️ Não consegui responder agora. Tenta de novo em alguns minutos.';
export const SEM_FERRAMENTA = '🤷 Ainda não sei responder isso. Anotei a pergunta.';
export const SO_TEXTO = '🎧 Por enquanto só leio texto.';
// 28/10 (fase 3): reprovou duas vezes no conferente — vai o que o código montou, com esta linha antes
export const SEGURA = 'Não consegui conferir a análise; os números que tenho com certeza são estes:';
/** 28/10 (fase 3): resposta com número (R$, %, valor com centavos) passa pelo conferente */
const TEM_NUMERO = /R\$|%|\d,\d{2}/;
/** 28/10 (fase 3): perguntas do vermelho e do ritmo (ou sobre o diário) levam o que puxou o ritmo, buscado pelo código */
const PUXOU = /vermelh|ritmo|negativ|estour|di[áa]rio/i;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
async function puxouRitmo(d: { painel: (c: string) => Promise<{ ok: boolean; dados: any }> }): Promise<any | null> {
  try {
    const r = await d.painel('/api/bot/consulta?o_que=dia_a_dia&periodo=este_mes&agrupar=loja&limite=3');
    return r.ok && Array.isArray(r.dados?.linhas) && r.dados.linhas.length ? r.dados : null;
  } catch { return null; }
}
function linhaPuxou(c: { linhas: { chave: string; valor: number }[] }): string {
  const ns = c.linhas.map((l) => `${l.chave} (${brl(l.valor)})`);
  return `👉 O que mais puxou o ritmo do dia a dia este mês: ${ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns.at(-1)}` : ns[0]}.`;
}
// 28/10 (fase 3): uma análise usa situação, consulta, cálculo e resposta
const RODADAS = 6;
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
  /** 27/10: tokens do Groq somados em todas as rodadas */
  tokens: number;
  /** 28/10 (fase 2): ms esperando a cota do Groq, somados em todas as rodadas */
  esperaMs: number;
  /** 28/10 (fase 3): veredito do conferente (null = não conferida: sem número, texto do sistema ou sem conferente) */
  conferencia: 'aprovada' | 'reescrita' | 'segura' | null;
  problemas: string[];
  tokensConferente: number;
}

// 28/10 (fase 2): textos da espera e do limite do Groq (tom contido, sem termo técnico)
const minutos = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
const plural = (n: number, s: string) => `${n} ${s}${n > 1 ? 's' : ''}`;
function tempo(ms: number): string {
  const m = minutos(ms);
  return m < 60 ? plural(m, 'minuto') : plural(Math.ceil(m / 60), 'hora');
}
export function textoEspera(ms: number): string {
  return `⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de ${plural(minutos(ms), 'minuto')}.`;
}
export function textoLimite(e: LimiteGroq): string {
  if (!e.diario) return `⚠️ O serviço de respostas está no limite e só libera daqui a cerca de ${tempo(e.esperaMs ?? 0)}. Manda a pergunta de novo depois disso.`;
  return `⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo ${e.esperaMs ? `daqui a cerca de ${tempo(e.esperaMs)}` : 'mais tarde'}.`;
}

// 27/10 (fase 1, tokens): as regras de proposta só vão com as ferramentas de proposta, e as das mensagens do Zeca só
// quando se fala de mensagem (escolha.ts); as de explicar um número valem sempre ("pq estamos no vermelho?" é base)
const SISTEMA = (quem: string, hoje: string, grupos: ReadonlySet<Grupo>) => [
  'Você é o Zeca, o assistente financeiro do casal Matheus e Ariane, num grupo de WhatsApp. Chamam você por "Zeca" ou "bot".',
  `Quem perguntou: ${quem}. Hoje é ${hoje} (horário de São Paulo).`,
  // 28/10 (fase 3): analista — consulta, calcula e explica o porquê; o código confere cada número
  'Responda como quem olhou os números: diga o que aconteceu e por quê, com os valores. Não defina termos.',
  'Todo número vem de uma ferramenta. Para dados use situacao_mes, gasto_periodo, maiores_gastos, comparar ou consultar; para qualquer conta (soma, diferença, divisão, quantas vezes, %) use calcular. Nunca faça conta de cabeça.',
  'Se os dados não respondem, diga o que não dá para saber. Não chute.',
  'Responda em português, tom contido, até 12 linhas, um emoji no começo de cada linha, *negrito* do WhatsApp para o número principal.',
  'Não escreva links nem caminhos (/gastos etc.): o sistema acrescenta o link do painel.',
  // 28/10 (conjunto de perguntas): "Origem: gasto_periodo (Mercado, mês_passado)" ia para o grupo
  'Não escreva nomes de ferramentas, de campos ou de parâmetros (gasto_periodo, explicacao, este_mes…): escreva como gente.',
  'Use o mínimo de ferramentas: quase sempre uma basta. Só chame outra se a pergunta precisar dela.',
  ...(grupos.has('propostas') ? [
    'Para corrigir a categoria de um gasto: buscar_lancamentos e depois propor_categoria com a ref L1..L5 que ela devolveu. Para conta avulsa: propor_conta_avulsa. Gasto pago em dinheiro vivo: propor_gasto_dinheiro.',
    'Você nunca grava nada: as propostas só valem quando a pessoa responder "sim". Não diga que algo foi feito.',
    'Num pedido de lançar ou mudar algo, chame a ferramenta de proposta mesmo que a data ou o valor pareçam fora do permitido: ela responde o motivo, e você repassa esse motivo.',
  ] : []),
  'Períodos: hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM. "Eu" = quem perguntou.',
  // 27/10: explicava o que cada termo significa ("Hoje dá pra gastar: o valor que pode ser usado…"); agora mostra a conta
  'Ao explicar uma mensagem ou um número (dá pra gastar, ritmo, nesse passo, pela média, mês no vermelho): NÃO repita a mensagem e NÃO diga o que o termo significa. Mostre a conta que chegou no número, com os valores.',
  '"explicacao" e a conta das mensagens são fonte de dados, não texto para copiar. Ao explicar a sobra ou o vermelho, comece pelo dinheiro que há nas contas e pelo que ainda sai.',
  // 28/10 (conjunto de perguntas): como sugestão o modelo não buscava, e a resposta do vermelho ficava sem o porquê
  'Pergunta de por que está no vermelho ou por que o ritmo está alto: chame situacao_mes E consultar (o_que dia_a_dia, periodo este_mes, agrupar loja, limite 3) e diga quais gastos puxaram o ritmo, com os valores. O aluguel e as contas fixas não entram no ritmo.',
  'Não refaça as contas da "explicacao" (elas já vêm prontas) nem invente conta nova: se precisar de uma, use calcular. Valores sempre no formato R$ 1.234,56.',
  'Na explicação: até 12 linhas, sem explicar a saudação ("Bom dia!"). "out/26" é o mês (outubro de 2026), nunca um dia.',
  ...(grupos.has('mensagens') ? MENSAGENS : []),
].join('\n');

// 22/10: explicar as mensagens do próprio Zeca
const MENSAGENS = [
  'Se a pergunta vier com uma "Mensagem citada", ela é uma mensagem sua. Se perguntarem de uma mensagem sua sem citar ("explica o diário", "o que foi aquele alerta?"), use mensagens_do_zeca.',
  'Mensagem citada: a conta vem junto com ela. Sem citar: use o "explicacao" da mensagem em mensagens_do_zeca (números da hora em que ela saiu); se ela não tiver "explicacao", use o de situacao_mes, tire TODOS os números dele (nenhum da mensagem) e diga na primeira linha que são os números de agora.',
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
];

/** `fechas`: os dois "fecha em" rotulados (pelaMediaFechaEm / fechaCom, nessePassoFechaEm), para a trava */
type ContaCitada = { explicacao: string[]; agora: boolean; fechas: Record<string, number> };
const FECHAS = ['fechaCom', 'pelaMediaFechaEm', 'nessePassoFechaEm'];
const fechasDe = (x: any) => Object.fromEntries(FECHAS.filter((k) => typeof x?.[k] === 'number').map((k) => [k, x[k]]));
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
  /** 28/10 (fase 2): cada espera da cota do Groq (o bot avisa o grupo) */
  aoEsperar?: (ms: number) => void;
  /** 28/10 (fase 3): o conferente e a lista de modelos (ele usa outro que não o que escreveu); sem ele, não confere */
  conferir?: typeof conferir;
  modelos?: string[];
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
    if (Array.isArray(m?.explicacao)) return { explicacao: m.explicacao, agora: false, fechas: fechasDe(m) };
    if (m ? m.tipo !== 'diario' : !/dá pra gastar|nesse passo|pela média/i.test(citada)) return null;
    const s = await d.painel('/api/bot/situacao');
    return s.ok && Array.isArray(s.dados?.explicacao) ? { explicacao: s.dados.explicacao, agora: true, fechas: fechasDe(s.dados) } : null;
  } catch { return null; }
}

/**
 * 27/10 (fase 1): o conjunto reduzido de ferramentas (escolha.ts) pode errar — "aquele pix do fulano é mercado" não
 * tem palavra de correção. Sem nenhuma ferramenta usada, refaz uma vez com todas; nunca uma terceira.
 */
export async function responder(p: Pergunta, d: DepsResponder): Promise<RespostaBot> {
  const t0 = Date.now();
  const grupos = escolherGrupos(p, d.contexto);
  const r = await tentar(p, d, grupos);
  if (!r.semFerramenta || grupos.size >= TODOS_GRUPOS.size) return r;
  const r2 = await tentar(p, d, TODOS_GRUPOS);
  return { ...r2, tokens: r.tokens + r2.tokens, esperaMs: r.esperaMs + r2.esperaMs, tokensConferente: r.tokensConferente + r2.tokensConferente, ms: Date.now() - t0 };
}

async function tentar(p: Pergunta, d: DepsResponder, grupos: ReadonlySet<Grupo>): Promise<RespostaBot> {
  const t0 = Date.now();
  const ferramentas: RespostaBot['ferramentas'] = [];
  const conta = p.citada ? await contaDaCitada(p.citada, d) : null;
  // 22/10: a mensagem citada vale como dado conferido (o Zeca explica com os números dela). 27/10: com a conta de
  // agora, só ela vale — número da mensagem misturado com o de agora é de outra hora
  const resultados: unknown[] = !p.citada ? [] : conta?.agora ? [{ explicacao: conta.explicacao, ...conta.fechas }]
    : [{ citada: p.citada, pct: pctsDoTexto(p.citada), ...(conta ? { explicacao: conta.explicacao, ...conta.fechas } : {}) }];
  // 28/10 (fase 3): no vermelho, o que puxou o ritmo vem do código (o modelo não buscava nem com regra obrigatória)
  const puxou = PUXOU.test(`${p.texto} ${p.citada ?? ''}`) ? await puxouRitmo(d) : null;
  if (puxou) resultados.push(puxou);
  const comPuxou = (t: string) => (puxou ? `${t}\n${linhaPuxou(puxou)}` : t);
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
    { role: 'system', content: SISTEMA(p.pessoa, d.hoje, grupos) },
    ...d.contexto.flatMap((c): MsgChat[] => [
      { role: 'user', content: c.pessoa ? `${c.pessoa}: ${c.pergunta}` : c.pergunta }, { role: 'assistant', content: c.resposta },
    ]),
    { role: 'user', content: comCitada(p, conta) + (puxou
      ? `\n\nO que mais puxou o ritmo do dia a dia este mês (já consultado; use no porquê):\n${puxou.linhas.map((l: any) => `- ${l.chave}: ${brl(l.valor)}`).join('\n')}`
      : '') },
  ];
  let tokens = 0;
  let esperaMs = 0;
  const aoEsperar = (ms: number) => { esperaMs += ms; d.aoEsperar?.(ms); };
  let conferencia: RespostaBot['conferencia'] = null;
  const problemas: string[] = [];
  let tokensConferente = 0;
  const fimCom = (texto: string, extra: Partial<RespostaBot> = {}): RespostaBot => ({
    texto, svg: ultima ? graficoDaFerramenta(ultima.nome, ultima.dados) : null, ferramentas, modelo: null,
    trava: false, semFerramenta: false, erro: null, ms: Date.now() - t0, tokens, esperaMs, conferencia, problemas, tokensConferente, ...extra,
  });
  // 28/10 (fase 3): o link é o da última ferramenta do painel que tem um (a calculadora não tem)
  const linkFinal = () => [...respondidas.values()].reverse().find((x) => x?.link)?.link ?? ultima?.dados?.link;
  // a resposta nunca pode parecer um chamado ("bot ...") ou o bot se responderia;
  // WhatsApp usa *um* asterisco para negrito; o modelo às vezes escreve o **Markdown**
  const polir = (t: string) => {
    const zap = t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
    return /^\s*bot(?![\p{L}\p{N}])/iu.test(zap) ? `🤖 ${zap}` : zap;
  };
  const conferirTexto = async (t: string) => {
    const v = await d.conferir!({ groq: d.groq, modelos: modeloConferente(modelo, d.modelos ?? []), pergunta: comCitada(p, conta), dados: resultados, resposta: t, aoEsperar });
    tokensConferente += v.tokens;
    problemas.push(...v.problemas);
    return v;
  };
  let modelo: string | null = null;
  try {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const r = await d.groq.chat(msgs, ferramentasDe(grupos), { aoEsperar });
      modelo = r.modelo;
      tokens += r.tokens ?? 0;
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
          // 28/10: o texto barrado fica registrado — sem ele não dá para saber por que a análise não passou
          if (texto) problemas.push(`trava barrou: ${texto}`);
          // sem dado de ferramenta para montar: não arrisca texto com número não conferido
          // 27/10: a explicação barrada (um "fecha em" no lugar do outro…) vira as frases prontas da conta;
          // 28/10: só quando a situação é a única ferramenta (com a compra junto, a resposta da compra sumia)
          //        com a consulta do dia a dia junto (o que puxou o ritmo), ela vem depois das frases
          const sit = respondidas.get('situacao_mes');
          if (texto && sit && Array.isArray(sit.explicacao) && [...respondidas.keys()].every((k) => k === 'situacao_mes' || k === 'consultar')) {
            const frases = sit.explicacao.map((l: string) => `👉 ${l}`).join('\n');
            const cons = respondidas.get('consultar');
            const extra = cons ? `\n\n${formatar('consultar', cons, d.painelUrl).replace(/\n\n👉 \S+$/, '')}` : '';
            return fimCom(comLink(comPuxou(frases) + extra, d.painelUrl, sit.link), { modelo, trava: true });
          }
          // 28/10: explicando uma mensagem sem citar, a conta guardada da mais recente que tem conta (não a lista)
          //        — só se a pergunta fala do diário ou a mais recente é ela ("o último alerta" não vira a conta do diário)
          const ms: any[] = ultima?.nome === 'mensagens_do_zeca' ? ultima.dados?.mensagens ?? [] : [];
          const comConta = /di[áa]rio/i.test(p.texto) || Array.isArray(ms.at(-1)?.explicacao)
            ? [...ms].reverse().find((m) => Array.isArray(m.explicacao)) : null;
          if (texto && comConta) return fimCom(comConta.explicacao.map((l: string) => `👉 ${l}`).join('\n'), { modelo, trava: true });
          if (ultima) return fimCom(montadoDeTodas(), { modelo, trava: !!texto });
          // 27/10: explicando uma mensagem citada, a conta dela já é a resposta
          if (conta) return fimCom(comPuxou(conta.explicacao.map((l) => `👉 ${l}`).join('\n')), { modelo, trava: !!texto });
          if (recusa) return fimCom(`⚠️ Não deu para lançar: ${recusa.replace(/\.+$/, '')}.`, { modelo });
          return fimCom(FALHA, { modelo, erro: 'resposta sem dados conferidos' });
        }
        const comLinkFinal = (t: string) => (ultima ? comLink(t, d.painelUrl, linkFinal()) : t);
        // 28/10 (fase 3): resposta do modelo com número passa pelo conferente; uma reescrita; depois a segura
        if (!d.conferir || !TEM_NUMERO.test(texto)) return fimCom(comLinkFinal(polir(texto)), { modelo });
        const v1 = await conferirTexto(texto);
        if (v1.aprovado) { conferencia = 'aprovada'; return fimCom(comLinkFinal(polir(texto)), { modelo }); }
        // sem conferente não há problema para corrigir: reescrever só gastaria cota na hora em que ela falta
        const semConferente = v1.problemas.every((x) => x === INDISPONIVEL);
        msgs.push({ role: 'assistant', content: texto });
        msgs.push({ role: 'user', content: `O conferente apontou estes problemas:\n${problemas.map((x) => `- ${x}`).join('\n')}\nReescreva a resposta corrigindo só isso, com os mesmos dados.` });
        // as mesmas ferramentas (o histórico tem chamadas delas); se ele chamar uma em vez de reescrever, vai a segura
        const r2 = semConferente ? null : await d.groq.chat(msgs, ferramentasDe(grupos), { aoEsperar });
        tokens += r2?.tokens ?? 0;
        const texto2 = (r2?.content ?? '').trim();
        if (texto2 && respostaConfere(texto2, resultados) && (await conferirTexto(texto2)).aprovado) {
          conferencia = 'reescrita';
          return fimCom(comLinkFinal(polir(texto2)), { modelo });
        }
        conferencia = 'segura';
        const corpo = respondidas.size ? montadoDeTodas() : conta ? conta.explicacao.map((l) => `👉 ${l}`).join('\n') : null;
        if (!corpo) return fimCom(FALHA, { modelo, erro: 'conferente reprovou e sem dado montável', svg: null });
        return fimCom(`${SEGURA}\n${corpo}`, { modelo });
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
          resultados.push(res.dados);
          // 28/10: a calculadora é dado para a trava, não resposta — virando a "última" o montado saía "Não sei responder isso"
          if (t.nome !== 'calcular') ultima = { nome: t.nome, dados: res.dados };
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
    if (e instanceof LimiteGroq) return fimCom(textoLimite(e), { modelo, erro: `limite do Groq (${e.diario ? 'diário' : 'por minuto'})`, svg: null });
    return fimCom(FALHA, { modelo, erro: e instanceof Error ? e.message : String(e), svg: null });
  }
}
