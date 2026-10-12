// E1: liga as peças — webhook → filtro → fila → agente → WhatsApp → registro.
import { responder, SO_TEXTO, type RespostaBot } from './agente';
import { lerWebhook, type ConfigEntrada, type Pergunta } from './entrada';
import { FilaBot } from './fila';
import type { ClienteGroq } from './groq';
import type { PgRegistroBot } from './registro';

const CHEIA = '⏳ Muitas perguntas de uma vez, manda de novo daqui a pouco.';
const LEMBRAR = 200;

export function criarBot(d: {
  cfg: ConfigEntrada; groq: Pick<ClienteGroq, 'chat'>; painel: (c: string) => Promise<{ ok: boolean; dados: any }>;
  registro: Pick<PgRegistroBot, 'gravar' | 'contexto'>;
  wa: { enviarComId(t: string): Promise<string | null>; enviarImagemComId(png: Buffer, l: string): Promise<string | null> };
  renderizar: (svg: string) => Promise<Buffer>; hoje: () => string; painelUrl: string; log: (m: string) => void;
}) {
  const enviados = new Set<string>();
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

  const fila = new FilaBot<Pergunta>(async (p) => {
    const contexto = await d.registro.contexto(30, 3).catch(() => []);
    const r: RespostaBot = await responder(p, { groq: d.groq, painel: d.painel, contexto, hoje: d.hoje(), painelUrl: d.painelUrl });
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
      else if (e.tipo === 'nao_texto') void mandar(SO_TEXTO, null).catch(() => {});
    },
  };
}
