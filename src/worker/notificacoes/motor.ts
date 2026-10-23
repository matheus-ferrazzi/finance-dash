// Motor das notificações (C2): busca os dados, lê o estado, monta a mensagem, envia ou só registra (sombra).
// O estado (marca d'água do gasto, faturas avisadas) vem da última linha do bot em QUALQUER modo: a sombra
// já o mantém, e a troca para real não repete avisos nem dispara o histórico.
import type { Canal } from './canal';
import { montarBackup, montarFatura, montarGasto, montarRitmo, montarSaude, type Bot } from './textos';
import { montarDiario, montarAlertasMeta, montarMensal, montarMeta, montarSemanal, montarTecnico } from './textosD';
import { graficoDiario, graficoMensal, graficoMeta, graficoOrcamento, graficoSemanal } from './graficos';
import { paraPng } from './png';
import { linkPara } from '../../lib/links';

export interface LinhaNotif {
  bot: Bot; modo: 'sombra' | 'real'; texto: string | null; enviado: boolean; erro: string | null; estado: unknown | null;
}
export interface RegistroNotif {
  ultimoEstado(bot: Bot): Promise<unknown | null>;
  gravar(l: LinhaNotif): Promise<void>;
  /** C2: houve envio real com sucesso deste bot nos últimos `minutos` (trava entre comando manual e agendado) */
  enviadoRecente?(bot: Bot, minutos: number): Promise<boolean>;
}
export type Fontes = { [b in Bot]: () => Promise<unknown> };
export interface ResultadoNotif {
  bot: Bot; modo: string; texto: string | null; enviado: boolean; erro: string | null;
  /** D2: o gráfico (só no dry-run, para conferência com --png) */
  svg?: string | null;
}

/**
 * Para onde vai cada mensagem: o técnico vai para o Matheus; diário, semanal, mensal, meta e gasto grande (19/10), para
 * o grupo; os outros bots do C2 seguem no Telegram (fora da agenda desde 17/10, só à mão).
 */
export function destinoDe(bot: Bot): 'grupo' | 'matheus' | 'telegram' {
  if (bot === 'tecnico') return 'matheus';
  return bot === 'diario' || bot === 'semanal' || bot === 'mensal' || bot === 'meta' || bot === 'alerta-meta' || bot === 'gasto' ? 'grupo' : 'telegram';
}
export interface Canais { grupo: Canal | null; matheus: Canal | null; telegram: Canal | null }

/** Real só se o bot está em NOTIF_REAL e o canal está configurado; senão, sombra. */
export function modoDoBot(bot: Bot, notifReal: string | undefined, temCanal: boolean): 'sombra' | 'real' {
  const lista = (notifReal ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return temCanal && lista.includes(bot) ? 'real' : 'sombra';
}

type Montada = { texto: string | null; estado: unknown | null; svg?: string | null };
// o gráfico nunca derruba a mensagem: deu erro, vai sem
const seguro = (g: () => string | null) => { try { return g(); } catch { return null; } };

function montar(bot: Bot, dados: any, estado: any, painel: string): Montada {
  const base = painel.replace(/\/+$/, '');
  const url = (tela: Parameters<typeof linkPara>[0], mes?: string) => base + linkPara(tela, mes ? { mes } : {}, '');
  switch (bot) {
    case 'diario': return { texto: montarDiario(dados, url('inicio')), estado: null, svg: seguro(() => graficoDiario(dados)) };
    // N19: o link abre a semana da mensagem, não o mês. Z2 (23/10): no recorte do "dia a dia" (tipo=livre), o número da mensagem
    case 'semanal': return { texto: montarSemanal(dados, { gastos: base + linkPara('gastos', { semana: dados?.semana?.inicio, tipo: 'livre' }, ''), trilha: url('trilha') }), estado: null, svg: seguro(() => graficoSemanal(dados)) };
    case 'mensal': return { texto: montarMensal(dados, url('previsao', dados?.mes)), estado: null, svg: seguro(() => graficoMensal(dados)) };
    case 'tecnico': return { texto: montarTecnico(dados), estado: null };
    case 'ritmo': return { texto: montarRitmo(dados), estado: null };
    // meta de gastos (débito + crédito desde 17/10) — andamento (sem memória) e alertas (memória do mês no estado)
    // Z4 (23/10): o número da meta só existe no card da home; o teto do orçamento, só no /orcamento
    case 'meta': return { texto: montarMeta(dados, url('inicio')), estado: null, svg: seguro(() => graficoMeta(dados)) };
    case 'alerta-meta': {
      const a = montarAlertasMeta(dados, estado, (temMeta) => url(temMeta ? 'inicio' : 'orcamento'));
      return { texto: a.texto, estado: a.estado, svg: a.texto ? seguro(() => (a.temMeta ? graficoMeta(dados) : graficoOrcamento(dados?.orcamento ?? []))) : null };
    }
    case 'fatura': return montarFatura(dados ?? [], estado);
    case 'gasto': return montarGasto(dados ?? [], estado);
    case 'saude': return { texto: montarSaude(dados ?? {}), estado: null };
    case 'backup': return { texto: montarBackup(dados ?? {}), estado: null };
  }
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** JSON com as chaves dos objetos em ordem alfabética (listas na ordem delas): igual para o mesmo conteúdo. */
function jsonOrdenado(x: unknown): string {
  const ord = (v: unknown): unknown => (Array.isArray(v) ? v.map(ord)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ord((v as any)[k])])) : v);
  return JSON.stringify(ord(x) ?? null);
}

const LIMITE_LEGENDA = 1000;
type Renderizar = (svg: string) => Buffer | Promise<Buffer>;

/** Imagem + legenda quando dá; qualquer falha da imagem cai para o texto (a mensagem não se perde pelo gráfico). */
async function entregar(canal: Canal, texto: string, svg: string | null | undefined, renderizar: Renderizar): Promise<string | null> {
  if (svg && canal.enviarImagem) {
    if (texto.length <= LIMITE_LEGENDA) {
      try {
        await canal.enviarImagem(await renderizar(svg), texto);
        return null;
      } catch (e) {
        // inclusive tempo esgotado depois de entregar (D2-M1): uma duplicata rara é melhor que perder a mensagem
        await canal.enviar(texto);
        return `imagem: ${msg(e)}`;
      }
    }
    // D2-M2: legenda longa demais — o texto primeiro (o que importa), a imagem depois e opcional (sem imagem órfã)
    await canal.enviar(texto);
    try { await canal.enviarImagem(await renderizar(svg), ''); return null; } catch (e) { return `imagem: ${msg(e)}`; }
  }
  await canal.enviar(texto);
  return null;
}

export async function rodarNotificacao(
  bot: Bot,
  d: {
    fontes: Fontes; registro: RegistroNotif; canais: Canais; modo: 'sombra' | 'real' | 'dry-run'; painelUrl?: string;
    renderizar?: Renderizar;
  },
): Promise<ResultadoNotif> {
  // sem canal para o destino não há como enviar: o que seria real vira sombra (registra, não envia)
  const canal = d.canais[destinoDe(bot)];
  const modo = d.modo === 'real' && !canal ? 'sombra' : d.modo;
  const anterior = await d.registro.ultimoEstado(bot);
  let dados: unknown;
  try {
    dados = await d.fontes[bot]();
  } catch (e) {
    const erro = msg(e);
    if (modo !== 'dry-run') await d.registro.gravar({ bot, modo, texto: null, enviado: false, erro, estado: null });
    return { bot, modo, texto: null, enviado: false, erro };
  }
  let m: Montada;
  try {
    m = montar(bot, dados, anterior, d.painelUrl ?? '');
  } catch (e) {
    // dados num formato inesperado (ex.: o painel respondeu 200 com corpo vazio): registra, não derruba
    const erro = `dados inesperados: ${msg(e)}`;
    if (modo !== 'dry-run') await d.registro.gravar({ bot, modo, texto: null, enviado: false, erro, estado: null });
    return { bot, modo, texto: null, enviado: false, erro };
  }
  if (modo === 'dry-run') return { bot, modo, texto: m.texto, enviado: false, erro: null, svg: m.svg ?? null };
  // Z7 (23/10): o jsonb volta do Postgres com as chaves em outra ordem — comparar com as chaves ordenadas
  const estadoMudou = m.estado !== null && jsonOrdenado(m.estado) !== jsonOrdenado(anterior);
  if (m.texto === null) {
    if (estadoMudou) await d.registro.gravar({ bot, modo, texto: null, enviado: false, erro: null, estado: m.estado });
    return { bot, modo, texto: null, enviado: false, erro: null };
  }
  let enviado = false;
  let erro: string | null = null;
  // C2: o comando manual e o agendado no mesmo intervalo mandariam duas vezes
  if (modo === 'real' && (await d.registro.enviadoRecente?.(bot, 10))) {
    erro = 'já enviado nos últimos 10 min (comando manual e agendado juntos): não reenviado';
    await d.registro.gravar({ bot, modo, texto: m.texto, enviado: false, erro, estado: null });
    return { bot, modo, texto: m.texto, enviado: false, erro };
  }
  if (modo === 'real') {
    try {
      erro = await entregar(canal!, m.texto, m.svg, d.renderizar ?? ((s) => paraPng(s)));
      enviado = true;
    } catch (e) {
      erro = msg(e);
    }
  } else if (m.svg) {
    // D2-M8: sombra também gera o PNG (sem enviar), para um gráfico quebrado aparecer antes do envio real
    try { await (d.renderizar ?? ((s) => paraPng(s)))(m.svg); } catch (e) { erro = `imagem: ${msg(e)}`; }
  }
  // envio que falhou não avança o estado: a próxima execução tenta o mesmo aviso de novo (um gasto grande
  // ou uma fatura não pode se perder por uma falha passageira do Telegram). Aviso só da imagem ("imagem: …")
  // com o texto entregue avança.
  await d.registro.gravar({ bot, modo, texto: m.texto, enviado, erro, estado: modo === 'real' && !enviado ? null : m.estado });
  return { bot, modo, texto: m.texto, enviado, erro };
}
