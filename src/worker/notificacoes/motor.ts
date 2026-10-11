// Motor das notificações (C2): busca os dados, lê o estado, monta a mensagem, envia ou só registra (sombra).
// O estado (marca d'água do gasto, faturas avisadas) vem da última linha do bot em QUALQUER modo: a sombra
// já o mantém, e a troca para real não repete avisos nem dispara o histórico.
import type { Canal } from './canal';
import { montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude, type Bot } from './textos';

export interface LinhaNotif {
  bot: Bot; modo: 'sombra' | 'real'; texto: string | null; enviado: boolean; erro: string | null; estado: unknown | null;
}
export interface RegistroNotif {
  ultimoEstado(bot: Bot): Promise<unknown | null>;
  gravar(l: LinhaNotif): Promise<void>;
}
export type Fontes = { [b in Bot]: () => Promise<unknown> };
export interface ResultadoNotif { bot: Bot; modo: string; texto: string | null; enviado: boolean; erro: string | null }

/** Real só se o bot está em NOTIF_REAL e o canal está configurado; senão, sombra. */
export function modoDoBot(bot: Bot, notifReal: string | undefined, temCanal: boolean): 'sombra' | 'real' {
  const lista = (notifReal ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return temCanal && lista.includes(bot) ? 'real' : 'sombra';
}

function montar(bot: Bot, dados: any, estado: any): { texto: string | null; estado: unknown | null } {
  switch (bot) {
    case 'ritmo': return { texto: montarRitmo(dados), estado: null };
    case 'fatura': return montarFatura(dados ?? [], estado);
    case 'gasto': return montarGasto(dados ?? [], estado);
    case 'saude': return { texto: montarSaude(dados ?? {}), estado: null };
    case 'backup': return { texto: montarBackup(dados ?? {}), estado: null };
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function rodarNotificacao(
  bot: Bot,
  d: { fontes: Fontes; registro: RegistroNotif; canal: Canal | null; modo: 'sombra' | 'real' | 'dry-run' },
): Promise<ResultadoNotif> {
  // sem canal não há como enviar: o que seria real vira sombra (registra, não envia)
  const modo = d.modo === 'real' && !d.canal ? 'sombra' : d.modo;
  const anterior = await d.registro.ultimoEstado(bot);
  let dados: unknown;
  try {
    dados = await d.fontes[bot]();
  } catch (e) {
    const erro = msg(e);
    if (modo !== 'dry-run') await d.registro.gravar({ bot, modo, texto: null, enviado: false, erro, estado: null });
    return { bot, modo, texto: null, enviado: false, erro };
  }
  const m = montar(bot, dados, anterior);
  if (modo === 'dry-run') return { bot, modo, texto: m.texto, enviado: false, erro: null };
  const estadoMudou = m.estado !== null && JSON.stringify(m.estado) !== JSON.stringify(anterior);
  if (m.texto === null) {
    if (estadoMudou) await d.registro.gravar({ bot, modo, texto: null, enviado: false, erro: null, estado: m.estado });
    return { bot, modo, texto: null, enviado: false, erro: null };
  }
  let enviado = false;
  let erro: string | null = null;
  if (modo === 'real') {
    try {
      await d.canal!.enviar(m.texto);
      enviado = true;
    } catch (e) {
      erro = msg(e);
    }
  }
  await d.registro.gravar({ bot, modo, texto: m.texto, enviado, erro, estado: m.estado });
  return { bot, modo, texto: m.texto, enviado, erro };
}
