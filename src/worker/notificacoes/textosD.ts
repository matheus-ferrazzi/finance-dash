// Mensagens do D (WhatsApp): diário, semanal e mensal no grupo do casal; técnico no privado do Matheus.
// Tom contido, Markdown do WhatsApp (*negrito*), um emoji por linha (D2), link na última linha. Funções puras.
import { linhasBackup, linhasSaude, type BackupDados, type SaudeDados } from './textos';
import type { Aviso } from '../../lib/avisos';
import type { Desafio } from '../../lib/desafio';
import { mesLabel } from '../../lib/format';
import { seta } from '../../lib/seta';
import { alertasDaMeta, type Alerta, type EstadoMeta, type MemoriaAlertas } from '../../lib/metaMes';

// os mesmos JSON das rotas /api/resumo/* do painel (o worker não importa do painel)
export interface ResumoDiario {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
  contas: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[];
  /** D2: gráfico (opcional: painel antigo não manda) */
  serie?: { dia: number; acumulado: number }[]; cabeNoMes?: number; diasNoMes?: number;
  /** Onda 2: avisos por exceção (cheque especial, juros, orçamento, fora do padrão) */
  avisos?: Aviso[];
}
export interface ResumoSemanal {
  semana: { inicio: string; fim: string }; total: number; mediaTotal: number;
  grupos: { nome: string; emoji: string; semana: number; media: number }[];
  trilha: { fase: number; titulo: string; proximoPasso: string };
  /** E3: quanto do total da semana foi em dinheiro vivo */
  totalDinheiro?: number;
  todosGrupos?: { nome: string; emoji: string; semana: number; media: number }[];
  /** E3-M4: total na mesma base da média (sem dinheiro se ainda não há 4 semanas dele); ausente = total */
  totalComparado?: number;
  /** S7: faturas fechadas a pagar (a vencer + em atraso) e o próximo vencimento (dd/mm) */
  faturas?: { aPagar: number; proximoVencimento: string | null };
  /** P7: andamento do desafio do mês (gasto do grupo no mês até agora) */
  desafio?: Desafio & { gasto: number; pct: number };
}
export interface ResumoMensal {
  mes: string; mesLabel: string; sobraReal: number; sobraPrevista: number; saldoFim: number;
  trilha: { fase: number; titulo: string; mudou: boolean; faseAntes: number | null };
  /** S6: total da carteira hoje e aplicação líquida do mês fechado (resgate negativo) */
  investimentos?: { total: number; aplicadoNoMes: number };
  mesNovo: { mesLabel: string; fechaCom: number };
  historico?: { mes: string; mesLabel: string; sobra: number }[];
  /** P7: o desafio do mês que fechou (com o resultado) e o do mês novo */
  desafio?: { anterior: (Desafio & { gasto: number; cumpriu: boolean }) | null; novo: Desafio | null };
}
export interface DadosTecnico {
  saude: SaudeDados; backup: BackupDados; consentimentos: { banco: string; responsavel: string; dias: number }[];
  /** E1: saúde do bot de perguntas */
  bot?: { falhas24h: number; modelosSumidos: string[] };
  /** S2: conexões da Pluggy sem atualizar há mais de 30 h */
  conexoes?: { banco: string; responsavel: string; horas: number }[];
}

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const sinal = (v: number) => (v < 0 ? '🔴' : '🟢');

/** ▰ por fase alcançada, ▱ pelas que faltam (4 fases). */
export function barraTrilha(fase: number): string {
  const f = Math.max(1, Math.min(4, fase));
  return '▰'.repeat(f) + '▱'.repeat(4 - f);
}

function linhaAviso(a: Aviso): string {
  switch (a.tipo) {
    case 'negativo': return `🔴 Conta ${a.banco} (${a.responsavel}) no negativo: *${brl(a.valor)}* (o cheque especial cobra juros)`;
    case 'juros': return `🔴 Juros de atraso no ${a.banco} (${a.responsavel}): ${brl(a.valor)}`;
    case 'orcamento': return `${a.emoji} ${a.item} passou de ${a.pct}% do teto: ${brl(a.gasto)} de ${brl(a.teto)}`;
    case 'fora_do_padrao': return `🧐 Fora do padrão: ${a.descricao}, ${brl(a.valor)} (costuma ser ${brl(a.mediana)})`;
  }
}

export function montarDiario(r: ResumoDiario, link: string): string {
  const l = ['☀️ *Bom dia!*'];
  if (r.diasRestantes > 0) {
    const acima = r.ritmoAtualDia > r.ritmoSeguroDia;
    l.push(`💸 Hoje dá pra gastar *${brl(r.ritmoSeguroDia)}* no débito e PIX`);
    l.push(acima
      ? `🔥 Ritmo: ${brl(r.ritmoAtualDia)} por dia, acima do que cabe 🔴`
      : `🐢 Ritmo: ${brl(r.ritmoAtualDia)} por dia, dentro do que cabe 🟢`);
    l.push(`${r.fechaCom < 0 ? '📉' : '📈'} ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  } else {
    // último dia do mês: tudo o que sobra é de hoje (N11); ritmo por dia não diz mais nada
    l.push(`💸 Último dia do mês: dá pra gastar *${brl(r.ritmoSeguroDia)}* hoje`);
    l.push(`📅 ${r.mesLabel} fecha em *${brl(r.fechaCom)}* ${sinal(r.fechaCom)}`);
  }
  if (r.avisos?.length) l.push('', '⚠️ *Atenção*', ...r.avisos.map(linhaAviso));
  if (r.contas.length) l.push('', ...r.contas.map((c) => `🧾 ${c.nome} (${brl(c.valor)}) vence ${c.quando}`));
  l.push('', `👉 ${link}`);
  return l.join('\n');
}

export function montarSemanal(r: ResumoSemanal, links: { gastos: string; trilha: string }): string {
  const l = [`📊 *Semana de ${ddmm(r.semana.inicio)} a ${ddmm(r.semana.fim)}*`];
  // E3-M4: o % usa a base comparável com a média (sem o dinheiro enquanto não há 4 semanas dele)
  const base = r.totalComparado ?? r.total;
  if (r.total <= 0) l.push('💤 Nenhum gasto registrado na semana.');
  else if (r.mediaTotal > 0 && base !== r.mediaTotal) {
    const pct = Math.round((Math.abs(base - r.mediaTotal) / r.mediaTotal) * 100);
    l.push(`💰 No dia a dia gastaram ${brl(r.total)}, ${base > r.mediaTotal ? `🔺 ${pct}% acima` : `🔻 ${pct}% abaixo`} da média`);
  } else l.push(`💰 No dia a dia gastaram ${brl(r.total)}.`);
  if ((r.totalDinheiro ?? 0) > 0) l.push(`💵 dos quais ${brl(r.totalDinheiro)} em dinheiro vivo`);
  if (r.grupos.length) l.push('', ...r.grupos.map((g) => `${g.emoji} ${g.nome}: ${brl(g.semana)} ${seta(g.semana, g.media)} (média ${brl(g.media)})`));
  if ((r.faturas?.aPagar ?? 0) > 0) {
    l.push('', `💳 Faturas a pagar: ${brl(r.faturas!.aPagar)}${r.faturas!.proximoVencimento ? ` (próximo vencimento ${r.faturas!.proximoVencimento})` : ''}`);
  }
  const d = r.desafio;
  if (d) {
    l.push('', `🎯 Desafio de ${mesLabel(d.mes)}: ${d.emoji} ${d.grupo} em ${brl(d.gasto)} de ${brl(d.meta)} (${d.pct}%)${d.gasto > d.meta ? ', passou da meta 🔴' : ''}`);
  }
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
  // S6: carteira (o Bot 04 do Telegram trazia); aplicação líquida do mês com sinal (resgate ≠ aporte)
  const inv = r.investimentos;
  const linhaInv = inv
    ? [`💼 Investimentos: ${brl(inv.total)}${inv.aplicadoNoMes > 0 ? ` (no mês, aplicaram ${brl(inv.aplicadoNoMes)})`
      : inv.aplicadoNoMes < 0 ? ` (no mês, resgataram ${brl(-inv.aplicadoNoMes)})` : ''}`]
    : [];
  // P7: fecha o desafio do mês que acabou e anuncia o do mês novo
  const a = r.desafio?.anterior, n = r.desafio?.novo;
  const linhasDesafio = [
    ...(a ? [a.cumpriu
      ? `🏅 Desafio de ${mesLabel(a.mes)} cumprido: ${a.grupo} ficou em ${brl(a.gasto)} (meta ${brl(a.meta)})`
      : `😬 Desafio de ${mesLabel(a.mes)} não deu: ${a.grupo} ficou em ${brl(a.gasto)} (meta ${brl(a.meta)})`] : []),
    ...(n ? [`🎯 Desafio de ${mesLabel(n.mes)}: ${n.emoji} ${n.grupo} até ${brl(n.meta)} (a média é ${brl(n.media)})`] : []),
  ];
  return [
    `📅 *${r.mesLabel} fechou*${r.sobraReal >= 0 ? ' 🎉' : ''}`,
    sobra,
    `🏦 Saldo em conta no fim: ${brl(r.saldoFim)} ${sinal(r.saldoFim)}`,
    ...linhaInv,
    '', trilha,
    '', `🔮 ${r.mesNovo.mesLabel} começa fechando em ${brl(r.mesNovo.fechaCom)}`,
    ...(linhasDesafio.length ? ['', ...linhasDesafio] : []),
    '', `👉 ${link}`,
  ].join('\n');
}

/** Andamento da meta de gastos (débito + crédito; terça e sexta 9h). Sem meta (menos de 3 meses de dado): nada. */
export function montarMeta(r: { mesLabel: string; estado: EstadoMeta | null }, link: string): string | null {
  const e = r.estado;
  if (!e) return null;
  const l = [`🎯 *Meta de gastos em ${r.mesLabel}*`,
    `💸 ${brl(e.gasto)} de ${brl(e.meta)} (${e.pct}%), faltam ${e.diasRestantes} dia${e.diasRestantes === 1 ? '' : 's'}`];
  if (e.situacao === 'estourou') l.push(`🔴 Passaram da meta em ${brl(e.gasto - e.meta)}`);
  else {
    l.push(`🐢 Dá pra gastar ${brl(e.porDia)}/dia até o fim`);
    l.push(e.acimaNoRitmo > 0
      ? `📈 No ritmo atual fecha em ${brl(e.previstoFim)} 🔴 (${brl(e.acimaNoRitmo)} acima)`
      : `✅ No ritmo atual fecha em ${brl(e.previstoFim)}, dentro da meta`);
  }
  l.push('', `👉 ${link}`);
  return l.join('\n');
}

/**
 * 15/10: alertas na hora (16h50 e 8h05): ritmo vai passar, 80%, estourou e tetos do Orçamento — cada um uma vez no
 * mês (a memória vai no `estado` do registro). Nada novo: sem mensagem, só a memória atualizada.
 */
export function montarAlertasMeta(
  r: { mes: string; mesLabel: string; estado: EstadoMeta | null; orcamento: { item: string; emoji: string; teto: number; gasto: number }[] },
  anterior: MemoriaAlertas | null, link: string,
): { texto: string | null; estado: MemoriaAlertas; temMeta: boolean } {
  const { alertas, memoria } = alertasDaMeta(r.estado, r.orcamento ?? [], anterior, r.mes);
  const linha = (a: Alerta) => {
    switch (a.tipo) {
      case '80': return `🟡 Já foram 80% da meta de gastos: ${brl(a.gasto)} de ${brl(a.meta)}, faltam ${a.diasRestantes} dia${a.diasRestantes === 1 ? '' : 's'}`;
      case '100': return `🔴 Passaram da meta de gastos de ${r.mesLabel}: ${brl(a.gasto)} de ${brl(a.meta)}`;
      case 'ritmo': return `⚠️ No ritmo atual, os gastos de ${r.mesLabel} fecham em ${brl(a.previstoFim)}: ${brl(a.acima)} acima da meta. Dá pra gastar ${brl(a.porDia)}/dia até o fim`;
      case 'orcamento': return `${a.emoji || '🧾'} ${a.item} passou de ${a.pct}% do teto: ${brl(a.gasto)} de ${brl(a.teto)}`;
    }
  };
  // 16/10: com aviso da meta, o gráfico é a linha do mês; só teto do orçamento, as barras
  const temMeta = alertas.some((a) => a.tipo !== 'orcamento');
  if (!alertas.length) return { texto: null, estado: memoria, temMeta };
  return { texto: [...alertas.map(linha), '', `👉 ${link}`].join('\n'), estado: memoria, temMeta };
}

/** Só quando algo quebrou; null quando está tudo bem. */
export function montarTecnico(d: DadosTecnico): string | null {
  const linhas = [
    ...[...linhasSaude(d.saude), ...linhasBackup(d.backup)].map((x) => `🔴 ${x.replace(/^• /, '')}`),
    ...d.consentimentos.map((c) => (c.dias < 0
      ? `🔴 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy venceu`
      : `🟡 Consentimento do ${c.banco} (${c.responsavel}) na Pluggy vence ${c.dias === 0 ? 'hoje' : c.dias === 1 ? 'amanhã' : `em ${c.dias} dias`}`)),
  ];
  for (const c of d.conexoes ?? []) {
    const quanto = c.horas >= 48 ? `${Math.floor(c.horas / 24)} dias` : `${Math.round(c.horas)} h`;
    linhas.push(`🔴 Conexão ${c.banco} (${c.responsavel}) sem atualizar há ${quanto}: reconectar no Meu Pluggy`);
  }
  if (d.bot?.falhas24h) linhas.push(`🔴 Bot: ${d.bot.falhas24h} pergunta(s) com falha nas últimas 24h`);
  for (const m of d.bot?.modelosSumidos ?? []) linhas.push(`🔴 Bot: modelo ${m} não existe mais na Groq`);
  if (!linhas.length) return null;
  return ['🛠️ *Aviso técnico*', '', ...linhas].join('\n');
}
