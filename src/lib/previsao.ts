// Modelo da previsibilidade: tipos e funções puras, sem banco.
// Os ingredientes vêm de getProjecaoBase (queries.ts). Tudo recebe a data de
// referência `hoje` ('AAAA-MM-DD', fuso SP) — é o que permite calcular a previsão
// "como se fosse" uma data passada e comparar com o que aconteceu.
import { currentDateSP, mesLabel } from './format';

/** compromissos cadastrados manualmente (aluguel, luz, água, financiamentos — a Pluggy não sabe "até quando") */
export interface CompromissoManual {
  id: number; nome: string; categoria: string; valor: number; responsavel: string;
  dataInicio: string; mesesTotais: number | null; observacao: string | null; dataFim: string | null;
}

export interface SaldoConta {
  banco: string; responsavel: string; saldo: number; atualizadoPluggy: string | null;
}

/** Fonte de receita recorrente (quem paga) com o valor mensal típico. */
export interface ReceitaPrevista {
  /** documento da contraparte, ou a descrição sem dígitos quando o banco não manda documento */
  fonte: string;
  nome: string; valor: number; diaTipico: number; responsavel: string;
}

/** Uma entrada de dinheiro, já atribuída à fonte. */
export interface EntradaReceita {
  fonte: string; nome: string; mes: string; dia: number; valor: number; responsavel: string;
}

/** ingredientes crus da projeção — combinados por computeProjecao (função pura, sem DB) */
export interface ProjecaoBase {
  patrimonioAtual: number;
  saldoContasAtual: number;
  /** reaproveitado pela página — evita refazer as mesmas consultas */
  saldoContas: { total: number; contas: SaldoConta[] };
  /** fontes de receita recorrentes nos meses-base, com o valor mensal típico (mediana) */
  fontesReceita: ReceitaPrevista[];
  /** gasto no DÉBITO (fora casa) — o que sai direto da conta */
  despesaVariavelMediaMensal: number;
  /** compras novas no crédito por mês (fora parcelamentos) — vira fatura */
  creditoNovoMedio: number;
  /** média mensal por categoria da casa (aluguel/luz/água/internet/telefone/gás) */
  despesaCasaPorCategoria: Record<string, number>;
  /** 'AAAA-MM' do vencimento -> compras no crédito já lançadas (conhecidas em hoje) que vencem nele */
  creditoPorVencimento: Record<string, number>;
  /** 'AAAA-MM' do vencimento -> total real da fatura (histórico da Pluggy), só as que vencem até o mês de hoje */
  faturaReal: Record<string, number>;
  compromissosManuais: CompromissoManual[];
  /** o que já aconteceu no mês em andamento — usado pra fechar o mês corrente */
  mesCorrente: {
    /** o que cada fonte já pagou no mês */
    recebidoPorFonte: Record<string, number>;
    receitaAgendada: number;
    /** o que ainda falta entrar de cada fonte recorrente (ex.: a 2ª parte do salário) */
    receitasAReceber: ReceitaPrevista[];
    variavelJaGasto: number;               // no débito, fora casa
    agendadoRestante: number;              // débito já datado no resto do mês (fora casa)
    faturaJaPaga: number;                  // fatura de cartão já paga neste mês
    casaNoMesPorCategoria: Record<string, number>; // inclui o que já saiu e o que está agendado
  };
}

export interface ProjecaoMes {
  mes: string; mesLabel: string;
  receita: number;
  despesaFixa: number;     // débito já agendado no mês
  despesaManual: number;   // fixos cadastrados
  despesaCasa: number;
  despesaVariavel: number; // gasto no débito
  fatura: number;          // fatura de cartão que sai da conta no mês
  parcelas: number;        // parte da fatura já contratada (parcelamentos)
  saldo: number;           // fluxo de CAIXA do mês
  saldoProjetado: number;  // dinheiro em conta no fim daquele mês
  /** no mês em andamento os valores são o que AINDA falta acontecer, não o mês inteiro */
  emAndamento?: boolean;
}

export interface Ritmo {
  diaHoje: number;
  diasRestantes: number;
  /** quanto dá pra gastar por dia, daqui até o fim do mês, sem fechar no vermelho */
  ritmoSeguroDia: number;
  /** média diária que já está sendo praticada neste mês */
  ritmoAtualDia: number;
  /** o total livre que sobra pro dia a dia no resto do mês */
  sobraParaODiaADia: number;
  fechaCom: number;
}

export function addMonths(anchorYYYYMM: string, n: number): string {
  const [y, m] = anchorYYYYMM.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function diasNoMes(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function mediana(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/**
 * Receita recorrente por fonte. Recorrente = apareceu em pelo menos 2 dos meses-base
 * (ou em todos, se houver só um). Valor = mediana dos totais mensais em que apareceu:
 * um mês com bônus ou adiantamento não puxa a previsão como puxava a média simples.
 * Entrada avulsa (uma vez só) não entra.
 */
export function receitaRecorrente(entradas: readonly EntradaReceita[], mesesBase: readonly string[]): ReceitaPrevista[] {
  const base = new Set(mesesBase);
  const minimo = Math.max(1, Math.min(2, base.size));
  // ainda ativa: apareceu em um dos 2 meses mais recentes (emprego antigo, que parou, não conta)
  const recentes = new Set([...base].sort().reverse().slice(0, 2));
  const porFonte = new Map<string, { nome: string; responsavel: string; porMes: Map<string, number>; dias: number[] }>();
  for (const e of entradas) {
    if (!base.has(e.mes)) continue;
    const f = porFonte.get(e.fonte) ?? { nome: e.nome, responsavel: e.responsavel, porMes: new Map<string, number>(), dias: [] as number[] };
    f.porMes.set(e.mes, (f.porMes.get(e.mes) ?? 0) + e.valor);
    f.dias.push(e.dia);
    porFonte.set(e.fonte, f);
  }
  return [...porFonte.entries()]
    .filter(([, f]) => f.porMes.size >= minimo && [...f.porMes.keys()].some((m) => recentes.has(m)))
    .map(([fonte, f]) => ({
      fonte, nome: f.nome, responsavel: f.responsavel,
      valor: Math.round(mediana([...f.porMes.values()]) * 100) / 100,
      diaTipico: Math.round(mediana(f.dias)),
    }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);
}

/**
 * Meses-base da receita: os 6 últimos meses fechados, consecutivos.
 * - Não usa os "meses confiáveis" (filtro de transferências, feito para as médias de gasto):
 *   com eles a base podia ser julho + fevereiro, e um salário novo desde maio deixava de ser
 *   "recorrente".
 * - 6 e não 3: renda que alterna entre dois patamares (medido em 2026) faz a mediana de 3
 *   meses pular para um lado ou outro conforme a janela; a de 6 fica no meio.
 */
export function mesesBaseReceita(hoje: string): string[] {
  const mes = hoje.slice(0, 7);
  return [1, 2, 3, 4, 5, 6].map((i) => addMonths(mes, -i));
}

/** O que ainda falta entrar de cada fonte neste mês. Só fica o que falta mais de 10% do valor da fonte. */
export function receitaAindaAEntrar(fontes: readonly ReceitaPrevista[], recebidoPorFonte: Record<string, number>): ReceitaPrevista[] {
  return fontes
    .map((f) => ({ f, falta: Math.round((f.valor - (recebidoPorFonte[f.fonte] ?? 0)) * 100) / 100 }))
    .filter(({ f, falta }) => falta > 0.1 * f.valor)
    .map(({ f, falta }) => ({ ...f, valor: falta }));
}

/**
 * O número mais acionável do app: quanto cabe gastar hoje.
 *
 * Fica aqui, e não dentro de quem exibe, porque a home e o endpoint dos bots
 * precisam do mesmo número — duas cópias da conta viravam duas verdades.
 */
export function computeRitmo(base: ProjecaoBase, atual: ProjecaoMes, hoje: string = currentDateSP()): Ritmo {
  const diaHoje = Number(hoje.split('-')[2]);
  const diasRestantes = Math.max(0, diasNoMes(atual.mes) - diaHoje);

  // tudo que não é gasto do dia a dia já está comprometido; o que sobra é o que
  // dá pra gastar até o fim do mês sem fechar no vermelho
  const sobraParaODiaADia = base.saldoContasAtual + atual.receita
    - atual.despesaFixa - atual.despesaManual - atual.despesaCasa - atual.fatura;

  return {
    diaHoje,
    diasRestantes,
    sobraParaODiaADia,
    ritmoSeguroDia: diasRestantes > 0 ? Math.max(0, sobraParaODiaADia / diasRestantes) : 0,
    ritmoAtualDia: diaHoje > 0 ? base.mesCorrente.variavelJaGasto / diaHoje : 0,
    fechaCom: atual.saldoProjetado,
  };
}

function compromissoAtivoNoMes(c: CompromissoManual, mes: string): boolean {
  if (mes < c.dataInicio.slice(0, 7)) return false;
  if (c.dataFim && mes > c.dataFim.slice(0, 7)) return false;
  return true;
}

/**
 * Fatura que sai da conta num mês FUTURO, pelo vencimento:
 * - fatura real conhecida (histórico) manda;
 * - senão, compras já lançadas que vencem nele + as compras novas que ainda vão
 *   acontecer: no mês seguinte, só a fração do mês corrente que falta; depois, a média cheia.
 * Antes usava as parcelas DATADAS no mês, que oscilavam sem relação com a fatura.
 */
function faturaFutura(base: ProjecaoBase, mes: string, fracaoNovas: number): number {
  return base.faturaReal[mes] ?? (base.creditoPorVencimento[mes] ?? 0) + base.creditoNovoMedio * fracaoNovas;
}

/**
 * Função pura (sem DB) — monta a série mês a mês.
 * Regra central: mês futuro NUNCA fica vazio. Mesmo sem nada lançado nele, ele já
 * nasce com as parcelas conhecidas + os fixos cadastrados + a média real de gasto
 * variável. É isso que evita o falso otimismo de planilha ("não preenchi, logo sobrou").
 * `saldoProjetado` parte do saldo REAL das contas correntes (Pluggy) e vai
 * somando o fluxo de cada mês = quanto dinheiro você teria em conta naquele mês.
 */
export function computeProjecao(base: ProjecaoBase, horizonMeses: number, hoje: string = currentDateSP()): ProjecaoMes[] {
  const anchor = hoje.slice(0, 7);
  const receitaMensal = base.fontesReceita.reduce((s, f) => s + f.valor, 0);
  const out: ProjecaoMes[] = [];
  let saldoProjetado = base.saldoContasAtual;

  // --- mês em andamento: só o que AINDA falta acontecer ---
  // O saldo de hoje já reflete tudo que passou, então somar o mês inteiro contaria duplicado.
  {
    const mc = base.mesCorrente;
    const ativos = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, anchor));
    const cobertas = new Set(ativos.map((c) => c.categoria));

    // Fixo cadastrado que ainda não saiu neste mês. O desconto do que já foi pago
    // é POR CATEGORIA, não por item: com dois compromissos "Housing" de R$1000 e
    // R$1000 já pago, descontar em cada um zerava os dois (some R$1000 da conta).
    const pagoPorCategoria: Record<string, number> = {};
    const despesaManual = ativos.reduce((s, c) => {
      const jaPago = mc.casaNoMesPorCategoria[c.categoria] ?? 0;
      const consumido = pagoPorCategoria[c.categoria] ?? 0;
      const abate = Math.min(c.valor, Math.max(0, jaPago - consumido));
      pagoPorCategoria[c.categoria] = consumido + abate;
      return s + (c.valor - abate);
    }, 0);
    // casa: o que falta pra atingir a média de cada categoria ainda não coberta por cadastro
    const despesaCasa = Object.entries(base.despesaCasaPorCategoria)
      .filter(([cat]) => !cobertas.has(cat))
      .reduce((s, [cat, media]) => s + Math.max(0, media - (mc.casaNoMesPorCategoria[cat] ?? 0)), 0);
    // Gasto do dia a dia é diário. Depois da 1ª semana o ritmo REAL do mês é um
    // previsor melhor que a média histórica — se você está gastando menos, a
    // projeção acompanha em vez de insistir que você vai recuperar o atraso.
    const diaHoje = Number(hoje.split('-')[2]);
    const dias = diasNoMes(anchor);
    const ritmo = diaHoje >= 7
      ? mc.variavelJaGasto / diaHoje
      : base.despesaVariavelMediaMensal / dias;
    const despesaVariavel = ritmo * (dias - diaHoje);
    const despesaFixa = mc.agendadoRestante;
    // o que ainda falta entrar de cada fonte recorrente (a 2ª parte do salário, etc) + o já agendado
    const receita = mc.receitasAReceber.reduce((s, r) => s + r.valor, 0) + mc.receitaAgendada;
    // fatura que vence neste mês (real, se já fechou) menos o que já foi pago
    const fatura = Math.max(0, (base.faturaReal[anchor] ?? base.creditoPorVencimento[anchor] ?? 0) - mc.faturaJaPaga);
    const parcelas = Math.min(fatura, base.creditoPorVencimento[anchor] ?? 0);

    const saldo = receita - despesaFixa - despesaManual - despesaCasa - despesaVariavel - fatura;
    saldoProjetado += saldo;
    out.push({
      mes: anchor, mesLabel: mesLabel(anchor), receita, despesaFixa, despesaManual,
      despesaCasa, despesaVariavel, fatura, parcelas, saldo, saldoProjetado, emAndamento: true,
    });
  }

  const diaHojeNum = Number(hoje.split('-')[2]);
  const diasAnchor = diasNoMes(anchor);
  for (let i = 1; i <= horizonMeses; i++) {
    const mes = addMonths(anchor, i);
    const despesaFixa = 0; // no caixa, parcela de cartão sai dentro da fatura
    const ativosNoMes = base.compromissosManuais.filter((c) => compromissoAtivoNoMes(c, mes));
    const despesaManual = ativosNoMes.reduce((s, c) => s + c.valor, 0);

    // se você cadastrou um compromisso naquela categoria da casa, o SEU número manda
    // e a média histórica daquela categoria não entra (senão contaria duas vezes)
    const categoriasCobertas = new Set(ativosNoMes.map((c) => c.categoria));
    const despesaCasa = Object.entries(base.despesaCasaPorCategoria)
      .filter(([cat]) => !categoriasCobertas.has(cat))
      .reduce((s, [, v]) => s + v, 0);

    const despesaVariavel = base.despesaVariavelMediaMensal;
    const receita = receitaMensal;
    const fatura = faturaFutura(base, mes, i === 1 ? (diasAnchor - diaHojeNum) / diasAnchor : 1);
    const parcelas = Math.min(fatura, base.creditoPorVencimento[mes] ?? 0);
    const saldo = receita - despesaFixa - despesaManual - despesaCasa - despesaVariavel - fatura;
    saldoProjetado += saldo;
    out.push({ mes, mesLabel: mesLabel(mes), receita, despesaFixa, despesaManual, despesaCasa, despesaVariavel, fatura, parcelas, saldo, saldoProjetado });
  }
  return out;
}
