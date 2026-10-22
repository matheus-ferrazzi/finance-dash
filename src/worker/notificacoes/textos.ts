// Mensagens dos bots portados do n8n (C2). Texto idêntico ao dos nós "Monta Mensagem" (exportados em
// 11/10/2026): a comparação em sombra depende disso; o redesenho fica para o D. Funções puras.

export type Bot = 'ritmo' | 'fatura' | 'gasto' | 'saude' | 'backup' | 'diario' | 'semanal' | 'mensal' | 'tecnico' | 'meta' | 'alerta-meta';
export const BOTS: readonly Bot[] = ['ritmo', 'fatura', 'gasto', 'saude', 'backup', 'diario', 'semanal', 'mensal', 'tecnico', 'meta', 'alerta-meta'];
export interface Montagem<E> { texto: string | null; estado: E }

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clean = (s: unknown) => String(s ?? '').replace(/[*_`\[\]]/g, '');

export type Tom = 'bom' | 'atencao' | 'ruim' | 'info';
const BOLINHA: Record<Tom, string> = { bom: '🟢', atencao: '🟡', ruim: '🔴', info: '⚪' };
/**
 * 19/10: a primeira linha de toda mensagem do Zeca — a bolinha do tom e o assunto em negrito, para a notificação já
 * dizer do que se trata e se é bom ou ruim. Bolinha sempre no começo (no fim da linha o WhatsApp a deixava sozinha).
 */
export function titulo(tom: Tom, assunto: string, detalhe?: string | null): string {
  return `${BOLINHA[tom]} *${assunto}*${detalhe ? ` · ${detalhe}` : ''}`;
}

export type Bloco = string | readonly string[] | null | undefined | false;
/**
 * 20/10: a mensagem em blocos, com uma linha em branco entre eles (pedido do Matheus: mais organizado). Texto solto é
 * um bloco de uma linha; lista (grupos da semana, contas, avisos, links) fica junta num bloco só. Vazio some.
 */
export function emBlocos(blocos: readonly Bloco[]): string {
  return blocos
    .map((b) => (typeof b === 'string' ? b : b ? b.filter(Boolean).join('\n') : ''))
    .filter(Boolean)
    .join('\n\n');
}

// ---------- Bot 12 — Ritmo do dia (lê /api/previsao do painel) ----------
export interface PrevisaoApi {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
  /** o que sobra para o dia a dia no resto do mês (base do "no ritmo atual") */
  sobraParaODiaADia?: number;
  receitasAReceber: { valor: number }[];
}
export function montarRitmo(p: PrevisaoApi): string | null {
  // sem dias restantes não há o que distribuir: no último dia do mês a conta "quanto por dia" não diz nada
  if (!p.diasRestantes || p.diasRestantes <= 0) return null;
  const seguro = p.ritmoSeguroDia || 0;
  const atual = p.ritmoAtualDia || 0;
  const acima = atual > seguro;
  const pct = seguro > 0 ? Math.round(((atual - seguro) / seguro) * 100) : 0;
  const entra = (p.receitasAReceber || []).reduce((s, r) => s + Number(r.valor || 0), 0);
  const linhas = [
    `🎯 *Ritmo de hoje*`,
    ``,
    `Da pra gastar *${brl(seguro)}* hoje.`,
    `Voce vem gastando ${brl(atual)}/dia` + (acima ? ` — *${pct}% acima*.` : ` — dentro do que cabe.`),
    ``,
    // N8 (auditoria 13/10): o fecha-com é pela média; no ritmo atual o mês fecharia em outro valor
    `Pela media dos ultimos meses, ${p.mesLabel} fecha em *${brl(p.fechaCom)}*.`,
    ...(acima && typeof p.sobraParaODiaADia === 'number'
      ? [`No ritmo atual, fecharia perto de *${brl(p.sobraParaODiaADia - atual * p.diasRestantes)}*.`] : []),
    `Faltam ${p.diasRestantes} dias` + (entra > 0 ? ` e ainda entram ${brl(entra)}.` : `.`),
  ];
  return linhas.join('\n');
}

// ---------- Bot 08 — Vencimento de fatura (0–3 dias; uma vez por ciclo) ----------
export interface FaturaAviso { banco: string; responsavel: string; valor: number; venc: string; venc_iso: string; dias: number }
export function montarFatura(fats: FaturaAviso[], estado: { alertados: string[] } | null): Montagem<{ alertados: string[] }> {
  const done = estado?.alertados ?? [];
  const intacto = { texto: null, estado: { alertados: done } };
  if (!fats.length) return intacto;
  const key = (f: FaturaAviso) => `${f.banco}|${f.responsavel}|${f.venc_iso}`;
  const novos = fats.filter((f) => !done.includes(key(f)));
  if (!novos.length) return intacto;
  const alertados = done.concat(novos.map(key)).slice(-100);
  const linhas = novos.map((f) => {
    const q = f.dias === 0 ? 'vence *hoje*' : f.dias === 1 ? 'vence *amanhã*' : `vence em *${f.dias} dias*`;
    return `• ${f.banco} (${f.responsavel}): ${brl(f.valor)} — ${q} (${f.venc})`;
  });
  return { texto: `📅 *Vencimento de fatura*\n\n${linhas.join('\n')}\n\n_Programe o pagamento pra não pagar juros._`, estado: { alertados } };
}

// ---------- Bot 09 — Gasto grande (≥ R$ 500; só os novos; 1ª execução só marca) ----------
export interface GastoGrande { id_transacao: string; criado_em: string; valor: number; descricao: string; banco: string; responsavel: string; data: string }
const LIMITE_GASTO = 500;
export function montarGasto(txs: GastoGrande[], estado: { lastCriadoEm: string } | null): Montagem<{ lastCriadoEm: string }> {
  const last = estado?.lastCriadoEm || '';
  const novos = last ? txs.filter((t) => t.criado_em > last) : [];
  const marca = txs.length ? txs.reduce((m, t) => (t.criado_em > m ? t.criado_em : m), last) : last;
  // primeira execução: só define a marca, não alerta histórico
  if (!last || !novos.length) return { texto: null, estado: { lastCriadoEm: marca } };
  const linhas = novos.map((t) => `• ${brl(t.valor)} — ${clean(t.descricao)} (${t.banco}, ${t.responsavel}, ${t.data})`);
  const topo = novos.length === 1
    ? titulo('atencao', 'Gasto grande', `${brl(novos[0].valor)} no ${novos[0].banco} (${novos[0].responsavel})`)
    : titulo('atencao', `${novos.length} gastos grandes`, `${brl(novos.reduce((s, t) => s + Number(t.valor), 0))} no total`);
  return {
    texto: `${topo}\n\n💸 *Gasto acima de ${brl(LIMITE_GASTO)}*\n\n${linhas.join('\n')}\n\n_Se não reconhece, confira no app do banco._`,
    estado: { lastCriadoEm: marca },
  };
}

// ---------- Bot 05 — Saúde das conexões ----------
export interface SaudeDados {
  h_lancamentos: number | null; h_investimentos: number | null; h_faturas: number | null;
  h_worker_ok: number | null; worker_falhas_24h: number | null; ultimo_lancamento: string | null;
  /**
   * 17/10: conexões paradas (pluggy_itens). Item do Meu Pluggy não se atualiza pela API: quando a Pluggy o tira da
   * atualização automática (sem nextAutoSyncAt), só quem é dono da conexão destrava, no Meu Pluggy.
   */
  conexoes?: { banco: string; responsavel: string; horas: number }[] | null;
  /** 22/10: as rodadas que falharam nas últimas 24h, com a tarefa, quando (SP) e o erro; ausente = fonte antiga */
  falhas?: { tarefa: string; quando: string; erro: string | null }[] | null;
}

const NOME_TAREFA: Record<string, string> = {
  transacoes: 'Ingestão dos lançamentos', faturas: 'Ingestão das faturas', saldos: 'Ingestão dos saldos',
  investimentos: 'Ingestão dos investimentos', itens: 'Status das conexões', tesouro: 'Preço do Tesouro',
};
/** As linhas de problema da saúde (usadas também no aviso técnico do D). */
export function linhasSaude(s: SaudeDados): string[] {
  const LIM = 36;
  const probs: string[] = [];
  if ((s.h_faturas ?? 999) > LIM) probs.push(`• Faturas: sem atualizar há ${s.h_faturas}h`);
  if ((s.h_investimentos ?? 999) > LIM) probs.push(`• Investimentos: sem atualizar há ${s.h_investimentos}h`);
  if ((s.h_lancamentos ?? 999) > 72) probs.push(`• Lançamentos: nada novo há ${s.h_lancamentos}h (pode ser normal se sem gastos)`);
  if ((s.h_worker_ok ?? 999) > 19) probs.push(`• Ingestão (worker): última rodada completa há ${s.h_worker_ok ?? '—'}h`);
  // 22/10: com a lista, uma linha por falha dizendo qual tarefa, quando e o erro ("Ingestão (worker)" escondia que
  // quem falhou foi o preço do Tesouro); sem a lista, a contagem antiga
  if (s.falhas?.length) {
    for (const f of s.falhas) probs.push(`• ${NOME_TAREFA[f.tarefa] ?? f.tarefa}: falhou em ${f.quando}${f.erro ? ` (${f.erro})` : ''}`);
  } else if ((s.worker_falhas_24h ?? 0) > 0) probs.push(`• Ingestão (worker): ${s.worker_falhas_24h} rodada(s) com falha nas últimas 24h`);
  for (const c of s.conexoes ?? []) {
    const quanto = c.horas >= 48 ? `${Math.floor(c.horas / 24)} dias` : `${Math.round(c.horas)} h`;
    probs.push(`• ${c.banco} (${c.responsavel}): sem atualizar há ${quanto}, abrir o Meu Pluggy e atualizar a conexão`);
  }
  return probs;
}

export function montarSaude(s: SaudeDados): string | null {
  const probs = linhasSaude(s);
  if (!probs.length) return null;
  return `⚠️ *Alerta de sincronização*\n\nAlgo pode ter parado de atualizar:\n${probs.join('\n')}\n\nÚltimo lançamento: ${s.ultimo_lancamento || '—'}`;
}

// ---------- Bot 11 — Guarda do backup (calado quando está tudo bem) ----------
export interface BackupDados {
  h_desde_ok: number | null; h_desde_n8n: number | null; n8n_workflows: number | null; h_desde_offsite: number | null;
  tamanho: number | null; tabelas: number | null; falhas_24h: number | null; ultimo_erro: string | null;
}
/** As linhas de problema do backup (usadas também no aviso técnico do D). */
export function linhasBackup(s: BackupDados): string[] {
  const probs: string[] = [];
  // o backup roda 1x/dia às 04h UTC: 30h de folga cobre um atraso sem alarme falso
  const hOk = s.h_desde_ok ?? 9999;
  if (hOk > 30) probs.push(`• Postgres (os dados): ultimo OK ${hOk === 9999 ? 'nunca' : 'ha ' + hOk + 'h'}`);
  // o n8n guarda a lógica: os bots e a ingestão antiga
  const hN8n = s.h_desde_n8n ?? 9999;
  if (hN8n > 30) probs.push(`• n8n (os bots): ultimo OK ${hN8n === 9999 ? 'nunca' : 'ha ' + hN8n + 'h'}`);
  // a cópia no PC depende dele estar ligado: 72h aguenta um fim de semana
  const hOff = s.h_desde_offsite ?? 9999;
  if (hOff > 72) probs.push(`• Copia no PC: ${hOff === 9999 ? 'nunca foi puxada' : 'ultima ha ' + hOff + 'h'}`);
  if ((s.falhas_24h || 0) > 0) {
    probs.push(`• ${s.falhas_24h} falha(s) em 24h` + (s.ultimo_erro ? ` — ultima: ${clean(s.ultimo_erro)}` : ''));
  }
  return probs;
}

export function montarBackup(s: BackupDados): string | null {
  const probs = linhasBackup(s);
  if (!probs.length) return null;
  const mb = s.tamanho ? (s.tamanho / 1048576).toFixed(2) + ' MB' : '?';
  // paridade com o n8n: o "\b" abaixo é o mesmo do original (vira o caractere de controle backspace, não uma
  // barra) — corrigir no redesenho do D, não aqui
  return `🗄️ *Backup com problema*\n\n${probs.join('\n')}\n\n` +
    `Ultimo bom: ${mb} / ${s.tabelas || '?'} tabelas, ${s.n8n_workflows || '?'} workflows.\n` +
    `_Conferir:_ \`tail /root/n8n-docker/backups/backup.log\` na VPS, ou o log em 01-financas\backups no PC.`;
}
