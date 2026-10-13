// E1: as 8 ferramentas do bot — schema para o Groq, rota do painel, texto montado (trava) e gráfico.
import { CATEGORIAS_PAINEL, traduzCategoria } from '../../lib/format';
import { CATEGORIAS_GASTO, GRUPOS_VALIDOS } from '../../lib/grupos';
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
  fn('investimentos', 'Carteira de investimentos do casal: total, por tipo e os maiores ativos.'),
  fn('buscar_lancamentos', 'Acha até 5 gastos para corrigir (por texto, como o nome de quem recebeu, e/ou valor). Devolve refs L1..L5.',
    { texto: { type: 'string' }, valor: { type: 'number' }, periodo: PERIODO, pessoa: PESSOA }),
  fn('propor_categoria', `Propõe mudar a categoria de um gasto achado por buscar_lancamentos (NÃO grava: o casal confirma). Categorias: ${CATEGORIAS_PAINEL.map((c) => `${c} = ${traduzCategoria(c)}`).join('; ')}.`,
    { ref: { type: 'string', description: 'L1..L5 da busca' }, categoria: { type: 'string', enum: CATEGORIAS_PAINEL },
      escopo: { type: 'string', enum: ['este', 'pessoa', 'texto'], description: 'este = só este gasto; pessoa = todos da mesma pessoa/empresa; texto = todos com o mesmo texto' },
      texto: { type: 'string', description: 'só com escopo texto (opcional)' } }, ['ref', 'categoria', 'escopo']),
  fn('propor_conta_avulsa', 'Propõe pôr uma conta avulsa nas contas do mês (NÃO grava: o casal confirma).',
    { nome: { type: 'string' }, valor: { type: 'number' }, mes: { type: 'string', description: 'AAAA-MM; padrão este mês' }, pessoa: { type: 'string', enum: ['Matheus', 'Ariane', 'eu'] } }, ['nome', 'valor']),
  fn('propor_gasto_dinheiro', 'Propõe lançar um gasto pago em dinheiro vivo (NÃO grava: o casal confirma). Não entra no saldo do banco.',
    { valor: { type: 'number' }, descricao: { type: 'string', description: 'o que foi (ex.: feira, pastel)' }, categoria: { type: 'string', enum: CATEGORIAS_GASTO },
      data: { type: 'string', description: 'AAAA-MM-DD; padrão hoje' }, pessoa: { type: 'string', enum: ['Matheus', 'Ariane', 'eu'] } }, ['valor', 'descricao', 'categoria']),
];
// E2/E3: rodam no worker (busca guarda refs; propostas não gravam)
export const LOCAIS = ['buscar_lancamentos', 'propor_categoria', 'propor_conta_avulsa', 'propor_gasto_dinheiro'];
export const NOMES_FERRAMENTAS = TOOLS.map((t) => t.function.name);

const ROTA: Record<string, string> = {
  situacao_mes: 'situacao', gasto_periodo: 'gasto', maiores_gastos: 'maiores', comparar: 'comparar',
  faturas: 'faturas', contas_do_mes: 'contas', trilha: 'trilha', simular_compra: 'simular', investimentos: 'investimentos',
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
      l.push(`💸 Hoje dá pra gastar *${brl(d.dapraGastarHoje)}* no débito e PIX`);
      if (d.diasRestantes > 0) l.push(`${d.ritmoAtualDia > d.dapraGastarHoje ? '🔥' : '🐢'} Ritmo: ${brl(d.ritmoAtualDia)} por dia`);
      l.push(`${d.fechaCom < 0 ? '📉' : '📈'} ${d.mesLabel} fecha em *${brl(d.fechaCom)}*`);
      if (d.fechaCom < 0) l.push(d.saiDoVermelho ? `🗓️ Sai do vermelho em ${d.saiDoVermelho}` : '🗓️ Não sai do vermelho nos próximos 24 meses');
      break;
    case 'gasto_periodo':
      l.push(`💰 Gasto em ${d.periodo} (${quem(d.pessoa)}${d.grupo ? `, ${d.grupo}` : ''}): *${brl(d.total)}*${d.totalDinheiro > 0 ? ` (💵 ${brl(d.totalDinheiro)})` : ''}`);
      for (const i of d.itens.slice(0, 6)) l.push(`• ${i.nome}: ${brl(i.valor)}${i.dinheiro > 0 ? ` (💵 ${brl(i.dinheiro)})` : ''}`);
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
      if (d.totalDinheiroA > 0 || d.totalDinheiroB > 0) l.push(`💵 em dinheiro: ${brl(d.totalDinheiroA ?? 0)} × ${brl(d.totalDinheiroB ?? 0)}`);
      for (const g of d.grupos.slice(0, 5)) l.push(`${g.diferenca > 0 ? '⬆️' : g.diferenca < 0 ? '⬇️' : '➖'} ${g.nome}: ${brl(g.a)} × ${brl(g.b)}`);
      break;
    case 'faturas': {
      // N4: a última fatura FECHADA de cada cartão (histórico), com situação — não o limite usado
      const de = (s: string) => d.itens.filter((x: any) => x.situacao === s);
      l.push(d.total > 0 ? `💳 Faturas a pagar: *${brl(d.total)}*` : '💳 Nenhuma fatura a pagar agora');
      for (const f of de('a_vencer')) l.push(`🔸 ${f.banco} (${f.pessoa}): falta ${brl(f.falta)} de ${brl(f.total)}, vence ${f.vencimento}`);
      for (const f of de('atrasada')) l.push(`🔴 ${f.banco} (${f.pessoa}): falta ${brl(f.falta)} de ${brl(f.total)}, venceu ${f.vencimento} (em atraso)`);
      for (const f of de('parcelada')) l.push(`🧩 ${f.banco} (${f.pessoa}): ${brl(f.total)} de ${f.vencimento}, parcelada`);
      for (const f of de('paga')) l.push(`✅ ${f.banco} (${f.pessoa}): ${brl(f.total)} de ${f.vencimento}, paga`);
      break;
    }
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
      // E1-M8: provável e pior caso discordando, os dois aparecem
      if (d.cabeProvavel === true && !d.cabe) {
        l.push('✅ Pelo número provável, cabe');
        l.push(`❌ Pelo pior caso, ${d.mesQueFura} vai para o vermelho`);
      } else {
        l.push(d.cabe ? '✅ Cabe: nenhum mês vai para o vermelho por causa dela' : `❌ Não cabe: ${d.mesQueFura} vai para o vermelho`);
      }
      if (d.aprofunda > 0) l.push(`📉 Aprofunda o pior mês em ${brl(d.aprofunda)}`);
      break;
    case 'investimentos':
      l.push(`💼 Investimentos: *${brl(d.total)}*`);
      for (const t of d.porTipo ?? []) l.push(`• ${t.tipo}: ${brl(t.total)}`);
      for (const m of (d.maiores ?? []).slice(0, 5)) l.push(`🔝 ${m.nome}: ${brl(m.valor)}`);
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
