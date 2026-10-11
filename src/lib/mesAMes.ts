// O que a Previsão mês a mês mostra (F2b). Só remonta números que já existem na projeção:
// nenhuma regra nova de previsão mora aqui.
import { compromissoAtivoNoMes, type ProjecaoBase, type ProjecaoMes } from './previsao';
import { traduzCategoria } from './format';
import { mesValido } from './links';
import { faixaMes, faixaMesCorrente, type Calibracao } from './faixa';
import type { Componentes } from './backtest';
import type { MesPassado } from './queries'; // só o tipo: some na compilação, não puxa o banco

export interface LinhaLista {
  tipo: 'passado' | 'atual' | 'futuro'; mes: string;
  /** sobra do mês: real no passado, prevista no atual e no futuro */
  sobra: number;
  /** só no passado: a sobra que a previsão da véspera dava */
  previsto: number | null;
  /** dinheiro em conta no fim do mês */
  saldoFim: number;
  /** pior caso do saldo no fim (null sem calibração ou no passado) */
  piorCaso: number | null;
}
export interface Item { nome: string; valor: number; nota?: string }
export interface LinhaDetalhe { chave: 'entra' | 'casa' | 'debito' | 'cartao'; titulo: string; total: number; itens: Item[] }
export interface LinhaAtual { chave: LinhaDetalhe['chave']; titulo: string; jaAconteceu: number; aindaFalta: number }
export interface LinhaPassado { chave: keyof Componentes; titulo: string; previsto: number; real: number; diferenca: number }
export interface Parcelado { chave: string; banco: string; valorParcela: number; dataFim: string; parcelaAtual: number | null; parcelaTotal: number | null }

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (o: Record<string, number>) => Object.values(o).reduce((s, v) => s + v, 0);

export function linhasDaLista(projecao: ProjecaoMes[], passados: MesPassado[], calib: Calibracao | null, diasRestantes: number, diasMesAtual: number): LinhaLista[] {
  return [
    ...passados.map((p): LinhaLista => ({ tipo: 'passado', mes: p.mes, sobra: p.real.saldo, previsto: p.previsto.saldo, saldoFim: p.saldoFim, piorCaso: null })),
    ...projecao.map((m, k): LinhaLista => ({
      tipo: k === 0 ? 'atual' : 'futuro', mes: m.mes, sobra: m.saldo, previsto: null, saldoFim: m.saldoProjetado,
      piorCaso: !calib ? null : k === 0
        ? faixaMesCorrente(m.saldoProjetado, diasRestantes, diasMesAtual, calib).piorCaso
        : faixaMes(m.saldoProjetado, k, calib).piorCaso,
    })),
  ];
}

/** Os meses passados são complemento: se a busca falhar, a lista sai sem eles em vez de a tela cair. */
export function semPassadosSeFalhar(p: Promise<MesPassado[]>): Promise<MesPassado[]> {
  return p.catch((e) => { console.error('meses passados da previsão falharam', e); return []; });
}

/** Posição do mês pedido no `?mes=` dentro da lista; -1 (mostra a lista) se inválido ou fora do intervalo. */
export function indiceDoMes(linhas: { mes: string }[], v: string | undefined): number {
  const mes = mesValido(v);
  return mes ? linhas.findIndex((l) => l.mes === mes) : -1;
}

/** Mês futuro: as quatro linhas com os itens de onde cada número vem. Os totais fecham com a sobra. */
export function detalheMesFuturo(base: ProjecaoBase, m: ProjecaoMes, parcelados: Parcelado[]) {
  const ativos = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, m.mes));
  const cobertas = new Set(ativos.map((c) => c.categoria));
  // parcelas já lançadas que caem no mês (o total delas é m.parcelas); o resto da fatura é a média de compras novas
  const conhecidas = m.parcelas > 0 ? parcelados.filter((p) => p.dataFim.slice(0, 7) >= m.mes) : [];
  const listadas = conhecidas.reduce((s, p) => s + p.valorParcela, 0);
  const outras = r2(m.parcelas - listadas);
  // a lista é pela data da parcela e m.parcelas pelo vencimento da fatura: quando a lista passa do total
  // do mês, mostra só o total, para os itens nunca somarem mais que a linha
  const parcelasDoMes: Item[] = listadas > m.parcelas + 0.5
    ? [{ nome: 'Parcelas já lançadas', valor: r2(m.parcelas) }]
    : [
      ...conhecidas.map((p) => ({ nome: p.chave, valor: p.valorParcela, nota: notaParcela(p, m.mes) })),
      ...(outras > 0.5 ? [{ nome: 'Outras compras já lançadas', valor: outras }] : []),
    ];
  const linhas: LinhaDetalhe[] = [
    // rendimento automático de centavos é ruído na lista (o total continua com ele)
    { chave: 'entra', titulo: 'Entra', total: m.receita,
      itens: base.fontesReceita.filter((f) => f.valor >= 1).map((f) => ({ nome: f.nome, valor: f.valor, nota: `dia ${f.diaTipico}` })) },
    { chave: 'casa', titulo: 'Casa e fixos', total: r2(m.despesaManual + m.despesaCasa), itens: [
      ...ativos.map((c) => ({ nome: c.nome, valor: c.valor })),
      ...Object.entries(base.despesaCasaPorCategoria).filter(([cat]) => !cobertas.has(cat))
        .map(([cat, v]) => ({ nome: traduzCategoria(cat), valor: r2(v), nota: 'média' })),
    ] },
    // nos meses futuros despesaFixa é 0 (o travado já está em despesaVariavel); somar protege se isso mudar
    { chave: 'debito', titulo: 'Débito', total: r2(m.despesaVariavel + m.despesaFixa), itens: [
      { nome: 'Dia a dia (média)', valor: base.despesaVariavelMediaMensal },
      { nome: 'Contas travadas (média)', valor: base.despesaFixaDebitoMedia ?? 0 },
    ] },
    { chave: 'cartao', titulo: 'Cartão', total: m.fatura, itens: [
      ...parcelasDoMes,
      { nome: 'Compras novas (média)', valor: r2(m.fatura - m.parcelas) },
    ] },
  ];
  return { linhas, sobra: m.saldo, saldoFim: m.saldoProjetado };
}

/** "banco · parcela k/N" no mês: contada a partir da última parcela (dataFim), que não muda. */
function notaParcela(p: Parcelado, mes: string): string {
  if (!p.parcelaTotal) return p.banco;
  const [fy, fm] = p.dataFim.slice(0, 7).split('-').map(Number);
  const [y, m] = mes.split('-').map(Number);
  const k = p.parcelaTotal - ((fy - y) * 12 + (fm - m));
  return k >= 1 && k <= p.parcelaTotal ? `${p.banco} · parcela ${k}/${p.parcelaTotal}` : p.banco;
}

/** Mês em andamento: o que já aconteceu até hoje × o que a projeção diz que ainda falta. */
export function detalheMesAtual(base: ProjecaoBase, m0: ProjecaoMes): { linhas: LinhaAtual[]; fechaCom: number } {
  const mc = base.mesCorrente;
  return {
    linhas: [
      { chave: 'entra', titulo: 'Entra', jaAconteceu: r2(soma(mc.recebidoPorFonte)), aindaFalta: r2(m0.receita) },
      { chave: 'casa', titulo: 'Casa e fixos', jaAconteceu: r2(soma(mc.casaNoMesPorCategoria)), aindaFalta: r2(m0.despesaManual + m0.despesaCasa) },
      { chave: 'debito', titulo: 'Débito', jaAconteceu: r2(mc.variavelJaGasto + (mc.fixoJaGasto ?? 0)), aindaFalta: r2(m0.despesaVariavel + m0.despesaFixa) },
      { chave: 'cartao', titulo: 'Cartão', jaAconteceu: r2(mc.faturaJaPaga), aindaFalta: r2(m0.fatura) },
    ],
    fechaCom: m0.saldoProjetado,
  };
}

export interface Conciliacao { saldoInicio: number; sobra: number; transferencias: number; saldoFim: number }

/**
 * Mês fechado: previsto na véspera × real × diferença (real − previsto), e a conta que fecha o saldo:
 * a sobra é receita − despesas; o saldo em conta também mexe com transferências entre contas que não
 * se anulam, aplicações/resgates e o que não passa pela conta (casa no crédito). Isso é o resíduo.
 */
export function detalheMesPassado(p: MesPassado): { linhas: LinhaPassado[]; saldoFim: number; conciliacao: Conciliacao } {
  const L: [keyof Componentes, string][] = [['receita', 'Entra'], ['casa', 'Casa e fixos'], ['debito', 'Débito'], ['fatura', 'Cartão'], ['saldo', 'Sobra do mês']];
  return {
    linhas: L.map(([k, titulo]) => ({ chave: k, titulo, previsto: r2(p.previsto[k]), real: r2(p.real[k]), diferenca: r2(p.real[k] - p.previsto[k]) })),
    saldoFim: p.saldoFim,
    conciliacao: {
      saldoInicio: p.saldoInicio, sobra: r2(p.real.saldo),
      transferencias: r2(p.saldoFim - p.saldoInicio - p.real.saldo), saldoFim: p.saldoFim,
    },
  };
}
