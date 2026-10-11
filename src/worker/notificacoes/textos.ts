// Mensagens dos bots portados do n8n (C2). Texto idêntico ao dos nós "Monta Mensagem" (exportados em
// 11/10/2026): a comparação em sombra depende disso; o redesenho fica para o D. Funções puras.

export type Bot = 'ritmo' | 'fatura' | 'gasto' | 'saude' | 'backup';
export const BOTS: readonly Bot[] = ['ritmo', 'fatura', 'gasto', 'saude', 'backup'];
export interface Montagem<E> { texto: string | null; estado: E }

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const clean = (s: unknown) => String(s ?? '').replace(/[*_`\[\]]/g, '');

// ---------- Bot 12 — Ritmo do dia (lê /api/previsao do painel) ----------
export interface PrevisaoApi {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
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
    `Nesse ritmo ${p.mesLabel} fecha em *${brl(p.fechaCom)}*.`,
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
  return {
    texto: `💸 *Gasto acima de ${brl(LIMITE_GASTO)}*\n\n${linhas.join('\n')}\n\n_Se não reconhece, confira no app do banco._`,
    estado: { lastCriadoEm: marca },
  };
}

// ---------- Bot 05 — Saúde das conexões ----------
export interface SaudeDados {
  h_lancamentos: number | null; h_investimentos: number | null; h_faturas: number | null;
  h_worker_ok: number | null; worker_falhas_24h: number | null; ultimo_lancamento: string | null;
}
/** As linhas de problema da saúde (usadas também no aviso técnico do D). */
export function linhasSaude(s: SaudeDados): string[] {
  const LIM = 36;
  const probs: string[] = [];
  if ((s.h_faturas ?? 999) > LIM) probs.push(`• Faturas: sem atualizar há ${s.h_faturas}h`);
  if ((s.h_investimentos ?? 999) > LIM) probs.push(`• Investimentos: sem atualizar há ${s.h_investimentos}h`);
  if ((s.h_lancamentos ?? 999) > 72) probs.push(`• Lançamentos: nada novo há ${s.h_lancamentos}h (pode ser normal se sem gastos)`);
  if ((s.h_worker_ok ?? 999) > 19) probs.push(`• Ingestão (worker): última rodada completa há ${s.h_worker_ok ?? '—'}h`);
  if ((s.worker_falhas_24h ?? 0) > 0) probs.push(`• Ingestão (worker): ${s.worker_falhas_24h} rodada(s) com falha nas últimas 24h`);
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
