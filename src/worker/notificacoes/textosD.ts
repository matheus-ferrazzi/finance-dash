// Mensagens do D (WhatsApp): diário, semanal e mensal no grupo do casal; técnico no privado do Matheus.
// Tom contido, Markdown do WhatsApp (*negrito*), um emoji por linha (D2), link na última linha. Funções puras.
import { linhasBackup, linhasSaude, type BackupDados, type SaudeDados } from './textos';

// os mesmos JSON das rotas /api/resumo/* do painel (o worker não importa do painel)
export interface ResumoDiario {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
  contas: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[];
  /** D2: gráfico (opcional: painel antigo não manda) */
  serie?: { dia: number; acumulado: number }[]; cabeNoMes?: number; diasNoMes?: number;
}
export interface ResumoSemanal {
  semana: { inicio: string; fim: string }; total: number; mediaTotal: number;
  grupos: { nome: string; emoji: string; semana: number; media: number }[];
  trilha: { fase: number; titulo: string; proximoPasso: string };
  /** E3: quanto do total da semana foi em dinheiro vivo */
  totalDinheiro?: number;
  todosGrupos?: { nome: string; emoji: string; semana: number; media: number }[];
}
export interface ResumoMensal {
  mes: string; mesLabel: string; sobraReal: number; sobraPrevista: number; saldoFim: number;
  trilha: { fase: number; titulo: string; mudou: boolean; faseAntes: number | null };
  mesNovo: { mesLabel: string; fechaCom: number };
  historico?: { mes: string; mesLabel: string; sobra: number }[];
}
export interface DadosTecnico {
  saude: SaudeDados; backup: BackupDados; consentimentos: { banco: string; responsavel: string; dias: number }[];
  /** E1: saúde do bot de perguntas */
  bot?: { falhas24h: number; modelosSumidos: string[] };
}

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const sinal = (v: number) => (v < 0 ? '🔴' : '🟢');

/** ▰ por fase alcançada, ▱ pelas que faltam (4 fases). */
export function barraTrilha(fase: number): string {
  const f = Math.max(1, Math.min(4, fase));
  return '▰'.repeat(f) + '▱'.repeat(4 - f);
}

export function montarDiario(r: ResumoDiario, link: string): string {
  const l = ['☀️ *Bom dia!*'];
  if (r.diasRestantes > 0) {
    const acima = r.ritmoAtualDia > r.ritmoSeguroDia;
    l.push(`💸 Hoje dá pra gastar *${brl(r.ritmoSeguroDia)}*`);
    l.push(acima
      ? `🔥 Ritmo: ${brl(r.ritmoAtualDia)} por dia, acima do que cabe 🔴`
      : `🐢 Ritmo: ${brl(r.ritmoAtualDia)} por dia, dentro do que cabe 🟢`);
    l.push(`${r.fechaCom < 0 ? '📉' : '📈'} ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  } else {
    // último dia do mês: não há o que distribuir por dia
    l.push(`📅 Último dia do mês: ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  }
  if (r.contas.length) l.push('', ...r.contas.map((c) => `🧾 ${c.nome} (${brl(c.valor)}) vence ${c.quando}`));
  l.push('', `👉 ${link}`);
  return l.join('\n');
}

function seta(semana: number, media: number): string {
  if (media > 0 && semana >= 2 * media) return '⏫';
  if (media > 0 && semana <= media / 2) return '⏬';
  if (semana > media) return '⬆️';
  if (semana < media) return '⬇️';
  return '➖';
}

export function montarSemanal(r: ResumoSemanal, links: { gastos: string; trilha: string }): string {
  const l = [`📊 *Semana de ${ddmm(r.semana.inicio)} a ${ddmm(r.semana.fim)}*`];
  if (r.total <= 0) l.push('💤 Nenhum gasto registrado na semana.');
  else if (r.mediaTotal > 0 && r.total !== r.mediaTotal) {
    const pct = Math.round((Math.abs(r.total - r.mediaTotal) / r.mediaTotal) * 100);
    l.push(`💰 Gastaram ${brl(r.total)}, ${r.total > r.mediaTotal ? `🔺 ${pct}% acima` : `🔻 ${pct}% abaixo`} da média`);
  } else l.push(`💰 Gastaram ${brl(r.total)}.`);
  if ((r.totalDinheiro ?? 0) > 0) l.push(`💵 ${brl(r.totalDinheiro)} em dinheiro vivo`);
  if (r.grupos.length) l.push('', ...r.grupos.map((g) => `${g.emoji} ${g.nome}: ${brl(g.semana)} ${seta(g.semana, g.media)} (média ${brl(g.media)})`));
  l.push('', `🧭 *Trilha* ${barraTrilha(r.trilha.fase)} fase ${r.trilha.fase}: ${r.trilha.titulo}`, `➡️ ${r.trilha.proximoPasso}`,
    '', `👉 ${links.gastos}`, `👉 ${links.trilha}`);
  return l.join('\n');
}

export function montarMensal(r: ResumoMensal, link: string): string {
  const sobra = r.sobraReal >= 0
    ? `🟢 Sobrou ${brl(r.sobraReal)} (previsto ${brl(r.sobraPrevista)})`
    : `🔴 Faltou ${brl(-r.sobraReal)} (previsto ${brl(r.sobraPrevista)})`;
  const trilha = r.trilha.mudou && r.trilha.faseAntes !== null
    ? `🚀 *Trilha* ${barraTrilha(r.trilha.fase)} passaram da fase ${r.trilha.faseAntes} para a ${r.trilha.fase}: ${r.trilha.titulo}`
    : `🧭 *Trilha* ${barraTrilha(r.trilha.fase)} seguem na fase ${r.trilha.fase}: ${r.trilha.titulo}`;
  return [
    `📅 *${r.mesLabel} fechou*${r.sobraReal >= 0 ? ' 🎉' : ''}`,
    sobra,
    `🏦 Saldo em conta no fim: ${brl(r.saldoFim)} ${sinal(r.saldoFim)}`,
    '', trilha,
    '', `🔮 ${r.mesNovo.mesLabel} começa fechando em ${brl(r.mesNovo.fechaCom)}`,
    '', `👉 ${link}`,
  ].join('\n');
}

/** Só quando algo quebrou; null quando está tudo bem. */
export function montarTecnico(d: DadosTecnico): string | null {
  const linhas = [
    ...[...linhasSaude(d.saude), ...linhasBackup(d.backup)].map((x) => `🔴 ${x.replace(/^• /, '')}`),
    ...d.consentimentos.map((c) => (c.dias < 0
      ? `🔴 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy venceu`
      : `🟡 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy vence em ${c.dias} dias`)),
  ];
  if (d.bot?.falhas24h) linhas.push(`🔴 Bot: ${d.bot.falhas24h} pergunta(s) com falha nas últimas 24h`);
  for (const m of d.bot?.modelosSumidos ?? []) linhas.push(`🔴 Bot: modelo ${m} não existe mais na Groq`);
  if (!linhas.length) return null;
  return ['🛠️ *Aviso técnico*', '', ...linhas].join('\n');
}
