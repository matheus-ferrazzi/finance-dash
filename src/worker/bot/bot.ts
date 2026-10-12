// E1: liga as peças — webhook → filtro → fila → agente → WhatsApp → registro.
// E2: antes do agente, "sim/não/número/desfaz" são lidos por código (proposta, lista, desfazer).
import type { PgAcoes } from './acoes';
import { CANCELADO, EXPIRADO, lerResposta, NADA_DESFAZER, textoDesfeito, textoFeito } from './acoesTextos';
import { responder, SO_TEXTO, type RespostaBot } from './agente';
import { lerWebhook, type ConfigEntrada, type Pergunta } from './entrada';
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
  registro: Pick<PgRegistroBot, 'gravar' | 'contexto'>;
  acoes: Pick<PgAcoes, 'criar' | 'pendente' | 'confirmar' | 'cancelar' | 'ultimaFeita'>;
  wa: { enviarComId(t: string): Promise<string | null>; enviarImagemComId(png: Buffer, l: string): Promise<string | null> };
  renderizar: (svg: string) => Promise<Buffer>; hoje: () => string; painelUrl: string; log: (m: string) => void;
}) {
  const enviados = new Set<string>();
  const refs = new Map();                      // pessoa → refs L1..L5 da última busca (só no worker)
  const listas = new Map<string, number>();    // pessoa → quando recebeu a última lista de candidatos
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
      const ex = await d.painelPost('/api/bot/executar', { id: pend.id });
      await mandar(ex.ok ? textoFeito(ex.dados.resumo, pend.tipo === 'avulsa' ? '/contas' : '/gastos', d.painelUrl)
        : `⚠️ Não consegui gravar: ${ex.dados?.erro ?? 'erro'}`, null);
      if (!ex.ok) d.log(`bot: ação ${pend.id} não gravou`);
      return { tratado: true };
    }
    if (r === 'desfaz') {
      const f = await d.acoes.ultimaFeita(p.pessoa);
      if (!f) { await mandar(NADA_DESFAZER, null); return { tratado: true }; }
      const dz = await d.painelPost('/api/bot/desfazer', { id: f.id, pessoa: p.pessoa });
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
    const locais = criarLocais({ pessoa: p.pessoa, hoje: d.hoje(), refs, painel: d.painel, painelPost: d.painelPost, acoes: d.acoes });
    const r: RespostaBot = await responder(p, { groq: d.groq, painel: d.painel, contexto, hoje: d.hoje(), painelUrl: d.painelUrl, locais });
    if (r.texto.startsWith('🔎')) listas.set(p.pessoa, Date.now());
    let erroEnvio: string | null = null;
    try { await mandar(r.texto, r.svg); } catch (e) { erroEnvio = `envio: ${e instanceof Error ? e.message : String(e)}`; }
    await d.registro.gravar({
      pessoa: p.pessoa, pergunta: p.texto, ferramentas: r.ferramentas, resposta: r.texto, modelo: r.modelo, ms: r.ms,
      trava: r.trava, semFerramenta: r.semFerramenta, erro: r.erro ?? erroEnvio,
    }).catch((e) => d.log(`bot: falha ao registrar (${e instanceof Error ? e.message : String(e)})`));
    if (r.erro || erroEnvio) d.log(`bot: pergunta de ${p.pessoa} com erro (${r.erro ?? erroEnvio})`);
  }, 5, () => { void mandar(CHEIA, null).catch(() => {}); });

  return {
    enviados,
    receber(corpo: unknown) {
      const e = lerWebhook(corpo, d.cfg, enviados);
      if (e.tipo === 'pergunta') fila.colocar(e.p);
      else if (e.tipo === 'resposta') fila.colocar({ ...e.p, curta: true });
      else if (e.tipo === 'nao_texto') void mandar(SO_TEXTO, null).catch(() => {});
    },
  };
}
