// Mensagens do D (WhatsApp): diário, semanal e mensal no grupo do casal; técnico no privado do Matheus.
// Tom contido, Markdown do WhatsApp (*negrito*), link em texto puro na última linha. Funções puras.
import { linhasBackup, linhasSaude, type BackupDados, type SaudeDados } from './textos';

// os mesmos JSON das rotas /api/resumo/* do painel (o worker não importa do painel)
export interface ResumoDiario {
  mesLabel: string; fechaCom: number; diasRestantes: number; ritmoSeguroDia: number; ritmoAtualDia: number;
  contas: { nome: string; valor: number; quando: 'hoje' | 'amanhã' }[];
}
export interface ResumoSemanal {
  semana: { inicio: string; fim: string }; total: number; mediaTotal: number;
  grupos: { nome: string; emoji: string; semana: number; media: number }[];
  trilha: { fase: number; titulo: string; proximoPasso: string };
}
export interface ResumoMensal {
  mes: string; mesLabel: string; sobraReal: number; sobraPrevista: number; saldoFim: number;
  trilha: { fase: number; titulo: string; mudou: boolean; faseAntes: number | null };
  mesNovo: { mesLabel: string; fechaCom: number };
}
export interface DadosTecnico {
  saude: SaudeDados; backup: BackupDados; consentimentos: { banco: string; responsavel: string; dias: number }[];
}

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function montarDiario(r: ResumoDiario, link: string): string {
  const l: string[] = [];
  if (r.diasRestantes > 0) {
    l.push(`*Bom dia.* Hoje dá pra gastar *${brl(r.ritmoSeguroDia)}*.`);
    l.push(`Vocês vêm gastando ${brl(r.ritmoAtualDia)} por dia, ${r.ritmoAtualDia > r.ritmoSeguroDia ? 'acima do que cabe' : 'dentro do que cabe'}.`);
    l.push(`Nesse ritmo, ${r.mesLabel} fecha em *${brl(r.fechaCom)}*.`);
  } else {
    // último dia do mês: não há o que distribuir por dia
    l.push(`*Bom dia.* Último dia do mês: ${r.mesLabel} fecha em *${brl(r.fechaCom)}*.`);
  }
  if (r.contas.length) {
    l.push('', `*Contas:* ${r.contas.map((c) => `${c.nome} (${brl(c.valor)}) vence ${c.quando}`).join('; ')}.`);
  }
  l.push('', link);
  return l.join('\n');
}

export function montarSemanal(r: ResumoSemanal, links: { gastos: string; trilha: string }): string {
  const l = [`*Semana de ${ddmm(r.semana.inicio)} a ${ddmm(r.semana.fim)}*`];
  if (r.total <= 0) l.push('Nenhum gasto registrado na semana.');
  else l.push(`Gastaram ${brl(r.total)}` + (r.mediaTotal > 0 ? ` (a média é ${brl(r.mediaTotal)}).` : '.'));
  for (const g of r.grupos) {
    const seta = g.semana > g.media ? ' ↑' : g.semana < g.media ? ' ↓' : '';
    l.push(`${g.emoji} ${g.nome}: ${brl(g.semana)} (média ${brl(g.media)})${seta}`);
  }
  l.push('', `*Trilha:* fase ${r.trilha.fase}, ${r.trilha.titulo}. ${r.trilha.proximoPasso}`, '', links.gastos, links.trilha);
  return l.join('\n');
}

export function montarMensal(r: ResumoMensal, link: string): string {
  const sobra = r.sobraReal >= 0 ? `Sobrou ${brl(r.sobraReal)}` : `Faltou ${brl(-r.sobraReal)}`;
  const trilha = r.trilha.mudou && r.trilha.faseAntes !== null
    ? `*Trilha:* passaram da fase ${r.trilha.faseAntes} para a ${r.trilha.fase}, ${r.trilha.titulo}.`
    : `*Trilha:* seguem na fase ${r.trilha.fase}, ${r.trilha.titulo}.`;
  return [
    `*${r.mesLabel} fechou.*`,
    `${sobra} (o previsto era ${brl(r.sobraPrevista)}).`,
    `Saldo em conta no fim: ${brl(r.saldoFim)}.`,
    '', trilha,
    '', `${r.mesNovo.mesLabel} começa fechando em ${brl(r.mesNovo.fechaCom)}.`,
    '', link,
  ].join('\n');
}

/** Só quando algo quebrou; null quando está tudo bem. */
export function montarTecnico(d: DadosTecnico): string | null {
  const linhas = [
    ...linhasSaude(d.saude),
    ...linhasBackup(d.backup),
    ...d.consentimentos.map((c) => (c.dias < 0
      ? `• Consentimento do ${c.banco} (${c.responsavel}) na Pluggy venceu`
      : `• Consentimento do ${c.banco} (${c.responsavel}) na Pluggy vence em ${c.dias} dias`)),
  ];
  if (!linhas.length) return null;
  return [`*Aviso técnico*`, '', ...linhas].join('\n');
}
