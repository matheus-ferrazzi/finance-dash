// E1: liga as peças — webhook → filtro → fila → agente → WhatsApp → registro.
// E2: antes do agente, "sim/não/número/desfaz" são lidos por código (proposta, lista, desfazer).
import type { PgAcoes } from './acoes';
import { CANCELADO, EXPIRADO, lerResposta, NADA_DESFAZER, textoDesfeito, textoFeito } from './acoesTextos';
import { responder, SO_TEXTO, type RespostaBot } from './agente';
import { lerWebhook, semIdentificadores, type ConfigEntrada, type Pergunta } from './entrada';
import { FilaBot } from './fila';
import type { ClienteGroq } from './groq';
import { criarLocais } from './locais';
import type { PgRegistroBot } from './registro';

const CHEIA = '⏳ Muitas perguntas de uma vez, manda de novo daqui a pouco.';
const LEMBRAR = 200;
const LISTA_VALE = 5 * 60_000;

type Res = { ok: boolean; dados: any };
type Item = Pergunta & { curta?: boolean };

export function criarBot(d: {
  cfg: ConfigEntrada; groq: Pick<ClienteGroq, 'chat'>; painel: (c: string) => Promise<Res>;
  painelPost: (c: string, corpo: object) => Promise<Res>;
  /** 22/10: mensagens que o Zeca mandou no grupo (para explicar) */
  mensagens?: () => Promise<{ tipo: string; quando: string; texto: string }[]>;
  registro: Pick<PgRegistroBot, 'gravar' | 'contexto'>;
  acoes: Pick<PgAcoes, 'criar' | 'pendente' | 'confirmar' | 'cancelar' | 'ultimaFeita'>;
  wa: { enviarComId(t: string): Promise<string | null>; enviarImagemComId(png: Buffer, l: string): Promise<string | null> };
  renderizar: (svg: string) => Promise<Buffer>; hoje: () => string; painelUrl: string; log: (m: string) => void;
}) {
  const enviados = new Set<string>();
  const refs = new Map();                      // pessoa → refs L1..L5 da última busca (só no worker)
  const listas = new Map<string, number>();    // pessoa → quando recebeu a última lista de candidatos
  const vistos = new Set<string>();            // ids de mensagens já tratadas (webhook pode entregar de novo)
  let curtas: Promise<void> = Promise.resolve(); // "sim/não/número" em série, fora da fila de perguntas
  // escrita no painel: falha de rede vira resposta de erro (nunca silêncio)
  const post = (c: string, corpo: object): Promise<Res> => d.painelPost(c, corpo).catch((e) => ({ ok: false, dados: { erro: e instanceof Error ? e.message : String(e) } }));
  const lembrar = (id: string | null) => {
    if (!id) return;
    enviados.add(id);
    if (enviados.size > LEMBRAR) enviados.delete(enviados.values().next().value as string);
  };
  const mandar = async (texto: string, svg: string | null) => {
    if (svg) {
      try { lembrar(await d.wa.enviarImagemComId(await d.renderizar(svg), texto)); return; } catch { /* cai para o texto */ }
    }
    lembrar(await d.wa.enviarComId(texto));
  };

  /** "sim/não/desfaz/número" resolvidos por código. true = tratado (não vai ao agente). Pode reescrever o texto. */
  async function respostaCurta(p: Item): Promise<{ tratado: boolean; texto?: string }> {
    const r = lerResposta(p.texto);
    if (r === 'sim' || r === 'nao') {
      const pend = await d.acoes.pendente(p.pessoa);
      if (!pend) return { tratado: !!p.curta };                  // "sim" solto: ignora; "bot sim": vira pergunta
      if (pend.expirada) { await mandar(EXPIRADO, null); return { tratado: true }; }
      if (r === 'nao') { await d.acoes.cancelar(pend.id); await mandar(CANCELADO, null); return { tratado: true }; }
      if (!(await d.acoes.confirmar(pend.id))) return { tratado: true };   // outro "sim" já confirmou
      const ex = await post('/api/bot/executar', { id: pend.id });
      await mandar(ex.ok ? textoFeito(ex.dados.resumo, pend.tipo === 'avulsa' ? '/contas' : '/gastos', d.painelUrl)
        : `⚠️ Não consegui gravar: ${ex.dados?.erro ?? 'erro'}`, null);
      if (!ex.ok) d.log(`bot: ação ${pend.id} não gravou`);
      return { tratado: true };
    }
    if (r === 'desfaz') {
      const f = await d.acoes.ultimaFeita(p.pessoa);
      if (!f) { await mandar(NADA_DESFAZER, null); return { tratado: true }; }
      const dz = await post('/api/bot/desfazer', { id: f.id, pessoa: p.pessoa });
      await mandar(dz.ok ? textoDesfeito(f.resumo) : `⚠️ Não consegui desfazer: ${dz.dados?.erro ?? 'erro'}`, null);
      return { tratado: true };
    }
    if (r && typeof r === 'object') {
      const quando = listas.get(p.pessoa);
      if (!quando || Date.now() - quando > LISTA_VALE) return { tratado: !!p.curta };
      return { tratado: false, texto: `quero o L${r.numero}` };
    }
    return { tratado: !!p.curta };
  }

  const fila = new FilaBot<Item>(async (item) => {
    let p: Item = item;
    const c = await respostaCurta(p);
    if (c.tratado) return;
    if (c.texto) p = { ...p, texto: c.texto };
    const contexto = await d.registro.contexto(30, 3).catch(() => []);
    const locais = criarLocais({ pessoa: p.pessoa, hoje: d.hoje(), refs, painel: d.painel, painelPost: d.painelPost, acoes: d.acoes, mensagens: d.mensagens });
    const r: RespostaBot = await responder(p, { groq: d.groq, painel: d.painel, contexto, hoje: d.hoje(), painelUrl: d.painelUrl, locais });
    if (r.texto.startsWith('🔎')) listas.set(p.pessoa, Date.now());
    let erroEnvio: string | null = null;
    // E1-M4: o erro do WhatsApp pode trazer o JID do grupo ou um telefone — nunca vai assim para log/tabela
    try { await mandar(r.texto, r.svg); } catch (e) { erroEnvio = semIdentificadores(`envio: ${e instanceof Error ? e.message : String(e)}`); }
    await d.registro.gravar({
      pessoa: p.pessoa, pergunta: p.texto, ferramentas: r.ferramentas, resposta: r.texto, modelo: r.modelo, ms: r.ms,
      trava: r.trava, semFerramenta: r.semFerramenta, erro: r.erro ?? erroEnvio, tokens: r.tokens,
    }).catch((e) => d.log(`bot: falha ao registrar (${e instanceof Error ? e.message : String(e)})`));
    if (r.erro || erroEnvio) d.log(`bot: pergunta de ${p.pessoa} com erro (${r.erro ?? erroEnvio})`);
  }, 5, () => { void mandar(CHEIA, null).catch(() => {}); });

  return {
    enviados,
    receber(corpo: unknown) {
      const e = lerWebhook(corpo, d.cfg, enviados);
      if (e.tipo === 'pergunta' || e.tipo === 'resposta') {
        if (e.p.id) {
          if (vistos.has(e.p.id)) return;
          vistos.add(e.p.id);
          if (vistos.size > 500) vistos.delete(vistos.values().next().value as string);
        }
      }
      if (e.tipo === 'pergunta') fila.colocar(e.p);
      else if (e.tipo === 'resposta') {
        // nunca ocupa vaga de pergunta nem gera "⏳": sem nada pendente, some em silêncio
        const p: Item = { ...e.p, curta: true };
        curtas = curtas.then(async () => {
          const c = await respostaCurta(p);
          if (!c.tratado && c.texto) fila.colocar({ ...p, curta: false, texto: c.texto });
        }).catch((err) => d.log(semIdentificadores(`bot: resposta curta falhou (${err instanceof Error ? err.message : String(err)})`)));
      }
      else if (e.tipo === 'nao_texto') void mandar(SO_TEXTO, null).catch(() => {});
    },
  };
}
