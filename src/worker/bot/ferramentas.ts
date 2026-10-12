// E1: as 8 ferramentas do bot — schema para o Groq, rota do painel, texto montado (trava) e gráfico.
import { GRUPOS_VALIDOS } from '../../lib/grupos';
import { barraTrilha } from '../notificacoes/textosD';
import { graficoBarras } from '../notificacoes/graficos';

const PERIODO = { type: 'string', description: 'hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM' };
const PESSOA = { type: 'string', enum: ['casal', 'Matheus', 'Ariane', 'eu'], description: 'padrão casal; "eu" = quem perguntou' };
const GRUPO = { type: 'string', enum: GRUPOS_VALIDOS, description: 'grupo de gasto do painel (opcional)' };
const fn = (name: string, description: string, properties: object = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const TOOLS = [
  fn('situacao_mes', 'Quanto dá pra gastar hoje, ritmo de gasto por dia, como o mês fecha e quando sai do vermelho.'),
  fn('gasto_periodo', 'Total gasto num período, dividido por grupo (ou por categoria dentro de um grupo).', { periodo: PERIODO, pessoa: PESSOA, grupo: GRUPO }, ['periodo']),
  fn('maiores_gastos', 'Os maiores lançamentos de gasto de um período (até 10).', { periodo: PERIODO, pessoa: PESSOA, grupo: GRUPO }, ['periodo']),
  fn('comparar', 'Compara o gasto de dois períodos, por grupo, com a diferença pronta.', { periodo_a: PERIODO, periodo_b: PERIODO, pessoa: PESSOA }, ['periodo_a', 'periodo_b']),
  fn('faturas', 'Faturas dos cartões: valor, vencimento e se já foram pagas.'),
  fn('contas_do_mes', 'Contas fixas do mês: pagas, em falta (com vencimento) e a confirmar.'),
  fn('trilha', 'Fase atual da trilha (dívidas → sobrar → reserva → patrimônio), próximo passo e reserva.'),
  fn('simular_compra', 'Se uma compra cabe na previsão: valor total e número de parcelas.', { valor_total: { type: 'number' }, parcelas: { type: 'integer', minimum: 1, maximum: 48 } }, ['valor_total']),
];
export const NOMES_FERRAMENTAS = TOOLS.map((t) => t.function.name);

const ROTA: Record<string, string> = {
  situacao_mes: 'situacao', gasto_periodo: 'gasto', maiores_gastos: 'maiores', comparar: 'comparar',
  faturas: 'faturas', contas_do_mes: 'contas', trilha: 'trilha', simular_compra: 'simular',
};

export function caminhoDa(nome: string, args: Record<string, unknown>, quem: string): string | null {
  const rota = ROTA[nome];
  if (!rota) return null;
  const q = new URLSearchParams();
  const pessoa = () => { const p = String(args.pessoa ?? 'casal'); q.set('pessoa', p === 'eu' ? quem : p); };
  if (nome === 'gasto_periodo' || nome === 'maiores_gastos') {
    q.set('periodo', String(args.periodo ?? '')); pessoa(); if (args.grupo) q.set('grupo', String(args.grupo));
  } else if (nome === 'comparar') {
    q.set('periodo', String(args.periodo_a ?? '')); q.set('periodo_b', String(args.periodo_b ?? '')); pessoa();
  } else if (nome === 'simular_compra') {
    q.set('valor_total', String(args.valor_total ?? '')); q.set('parcelas', String(args.parcelas ?? 1));
  }
  const s = q.toString();
  return `/api/bot/${rota}${s ? `?${s}` : ''}`;
}

const brl = (v: unknown) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fim = (painel: string, link: string) => ['', `👉 ${painel.replace(/\/+$/, '')}${link}`];
const quem = (p: string) => (p === 'casal' ? 'casal' : p);

export function formatar(nome: string, d: any, painel: string): string {
  const l: string[] = [];
  switch (nome) {
    case 'situacao_mes':
      if (d.diasRestantes > 0) {
        l.push(`💸 Hoje dá pra gastar *${brl(d.dapraGastarHoje)}*`);
        l.push(`${d.ritmoAtualDia > d.dapraGastarHoje ? '🔥' : '🐢'} Ritmo: ${brl(d.ritmoAtualDia)} por dia`);
      }
      l.push(`${d.fechaCom < 0 ? '📉' : '📈'} ${d.mesLabel} fecha em *${brl(d.fechaCom)}*`);
      if (d.fechaCom < 0) l.push(d.saiDoVermelho ? `🗓️ Sai do vermelho em ${d.saiDoVermelho}` : '🗓️ Não sai do vermelho nos próximos 24 meses');
      break;
    case 'gasto_periodo':
      l.push(`💰 Gasto em ${d.periodo} (${quem(d.pessoa)}${d.grupo ? `, ${d.grupo}` : ''}): *${brl(d.total)}*`);
      for (const i of d.itens.slice(0, 6)) l.push(`• ${i.nome}: ${brl(i.valor)}`);
      if (!d.itens.length) l.push('💤 Nenhum gasto no período.');
      break;
    case 'maiores_gastos':
      l.push(`🧾 Maiores gastos em ${d.periodo} (${quem(d.pessoa)}${d.grupo ? `, ${d.grupo}` : ''})`);
      for (const i of d.itens.slice(0, 8)) l.push(`• ${i.data} ${i.descricao}: ${brl(i.valor)} (${i.pessoa})`);
      if (!d.itens.length) l.push('💤 Nenhum gasto no período.');
      break;
    case 'comparar':
      l.push(`📊 ${d.a} × ${d.b} (${quem(d.pessoa)})`);
      l.push(`💰 ${brl(d.totalA)} × ${brl(d.totalB)}${d.pct === null ? '' : `, ${d.diferenca > 0 ? '🔺' : '🔻'} ${Math.abs(d.pct).toLocaleString('pt-BR')}%`}`);
      for (const g of d.grupos.slice(0, 5)) l.push(`${g.diferenca > 0 ? '⬆️' : g.diferenca < 0 ? '⬇️' : '➖'} ${g.nome}: ${brl(g.a)} × ${brl(g.b)}`);
      break;
    case 'faturas':
      // fatura com vencimento passado é a última fechada (a Pluggy segue mostrando): não entra no "a vencer"
      l.push(`💳 Faturas a vencer: *${brl(d.total)}*`);
      for (const f of d.itens.filter((x: any) => !x.vencida && !x.paga)) l.push(`🔸 ${f.banco} (${f.pessoa}): ${brl(f.valor)}${f.vencimento ? `, vence ${f.vencimento}` : ''}`);
      for (const f of d.itens.filter((x: any) => x.vencida && !x.paga)) l.push(`🗓️ ${f.banco} (${f.pessoa}): ${brl(f.valor)}, venceu ${f.vencimento} (última fechada; confira se foi paga)`);
      for (const f of d.itens.filter((x: any) => x.paga)) l.push(`✅ ${f.banco} (${f.pessoa}): sem valor em aberto`);
      break;
    case 'contas_do_mes':
      l.push(`🧾 Contas de ${d.mesLabel}: falta *${brl(d.totalFalta)}*`);
      for (const c of d.falta) l.push(`🔸 ${c.nome}: ${brl(c.valor)}${c.vence ? `, vence dia ${c.vence}` : ''}`);
      for (const c of d.aConfirmar) l.push(`❔ ${c.nome}: ${brl(c.valor)} (marcada, banco não confirmou)`);
      if (d.pagas.length) l.push(`✅ ${d.pagas.length} paga(s)`);
      break;
    case 'trilha':
      l.push(`🧭 Fase ${d.fase} de 4 ${barraTrilha(d.fase)}: ${d.titulo}`);
      l.push(`➡️ ${d.proximoPasso}`);
      l.push(`🛟 Reserva: ${brl(d.reserva.aplicado)} de ${brl(d.reserva.meta)}`);
      break;
    case 'simular_compra':
      l.push(`🛒 Compra de ${brl(d.valorTotal)} em ${d.parcelas}x de ${brl(d.parcela)}`);
      l.push(d.cabe ? '✅ Cabe: nenhum mês vai para o vermelho por causa dela' : `❌ Não cabe: ${d.mesQueFura} vai para o vermelho`);
      if (d.aprofunda > 0) l.push(`📉 Aprofunda o pior mês em ${brl(d.aprofunda)}`);
      break;
    default:
      return 'Não sei responder isso.';
  }
  return [...l, ...fim(painel, d.link ?? '/')].join('\n');
}

export function graficoDaFerramenta(nome: string, d: any): string | null {
  try {
    if (nome === 'gasto_periodo') return graficoBarras(`gasto em ${d.periodo}`, (d.itens ?? []).map((i: any) => ({ nome: i.nome, valor: i.valor })));
    if (nome === 'comparar') return graficoBarras(`${d.a} × ${d.b} (traço)`, (d.grupos ?? []).map((g: any) => ({ nome: g.nome, valor: g.a, ref: g.b })));
  } catch { /* gráfico nunca derruba a resposta */ }
  return null;
}
