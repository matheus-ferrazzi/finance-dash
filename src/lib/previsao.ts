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
  /** gasto LIVRE no débito (fora casa e fora contas travadas) — o dia a dia */
  despesaVariavelMediaMensal: number;
  /** contas travadas pagas no débito (consórcio, seguro, impostos, tarifas…): média mensal */
  despesaFixaDebitoMedia?: number;
  /** fração do gasto livre que historicamente sai DEPOIS do dia de hoje (perfil dos últimos 6 meses);
   *  null/ausente = proporcional aos dias que faltam */
  fracaoRestanteDebito?: number | null;
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
    variavelJaGasto: number;               // gasto livre no débito (fora casa e fora contas travadas)
    fixoJaGasto?: number;                  // contas travadas já pagas no débito neste mês
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
 * Valor típico de uma parte: mediana dos meses, sem os meses de EXTRA (acima de 1,5x a mediana —
 * plantão, bônus, férias). O extra conta como recebido no mês em que cai, mas não vira o "normal":
 * com uma fonte nova e poucos meses, um único mês com extra puxava a mediana para cima.
 */
function valorTipico(valores: readonly number[]): number {
  const m = mediana(valores);
  const semExtra = valores.filter((v) => v <= 1.5 * m);
  return mediana(semExtra.length ? semExtra : valores);
}

/**
 * Parte de uma fonte de receita: a mesma fonte paga em quinzenas diferentes (salário em
 * duas partes, ~dia 4 e ~dia 19) e cada quinzena tem o seu valor típico. Assim um extra
 * na 1ª parte (plantão) não "come" a 2ª parte, que continua prevista.
 */
export function chaveParte(fonte: string, dia: number): string {
  return `${fonte}|${dia <= 15 ? 1 : 2}`;
}

/**
 * Receita recorrente por parte (fonte + quinzena). Recorrente = apareceu em pelo menos 2 dos meses-base
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
    const chave = chaveParte(e.fonte, e.dia);
    const f = porFonte.get(chave) ?? { nome: e.nome, responsavel: e.responsavel, porMes: new Map<string, number>(), dias: [] as number[] };
    f.porMes.set(e.mes, (f.porMes.get(e.mes) ?? 0) + e.valor);
    f.dias.push(e.dia);
    porFonte.set(chave, f);
  }
  return [...porFonte.entries()]
    .filter(([, f]) => f.porMes.size >= minimo && [...f.porMes.keys()].some((m) => recentes.has(m)))
    .map(([fonte, f]) => ({
      fonte, nome: f.nome, responsavel: f.responsavel,
      valor: Math.round(valorTipico([...f.porMes.values()]) * 100) / 100,
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

/**
 * O que ainda falta entrar neste mês: as partes que ainda não caíram, pelo valor típico.
 * Parte que já caiu sai inteira, com qualquer valor (veio maior por extra, ou menor).
 * `recebidoPorParte` é chaveado por `chaveParte(fonte, dia)`.
 */
export function receitaAindaAEntrar(partes: readonly ReceitaPrevista[], recebidoPorParte: Record<string, number>): ReceitaPrevista[] {
  return partes.filter((p) => !((recebidoPorParte[p.fonte] ?? 0) > 0));
}

/** Troca de um compromisso a partir de um mês — ex.: aluguel novo depois de mudar de cidade. */
export interface Cenario { aPartirDe: string; categoria: string; valor: number }

/**
 * Aplica o cenário sobre a base, sem gravar nada e sem mudar a base original:
 * o compromisso daquela categoria que começou antes termina no mês anterior; o que
 * começaria depois sai; entra o novo valor a partir de `aPartirDe`. Sem compromisso
 * cadastrado na categoria, a média histórica vale até lá (a projeção só cobre com o
 * compromisso a partir do mês em que ele existe).
 */
export function aplicarCenario(base: ProjecaoBase, c: Cenario): ProjecaoBase {
  const fimAnterior = `${addMonths(c.aPartirDe, -1)}-01`;
  const compromissos = base.compromissosManuais.flatMap((m): CompromissoManual[] => {
    if (m.categoria !== c.categoria) return [m];
    if (m.dataInicio.slice(0, 7) >= c.aPartirDe) return [];
    if (m.dataFim && m.dataFim.slice(0, 7) < c.aPartirDe) return [m];
    return [{ ...m, dataFim: fimAnterior }];
  });
  compromissos.push({
    id: -1, nome: `Cenário: ${c.categoria}`, categoria: c.categoria, valor: c.valor, responsavel: 'casal',
    dataInicio: `${c.aPartirDe}-01`, mesesTotais: null, observacao: 'cenário (não gravado)', dataFim: null,
  });
  return { ...base, compromissosManuais: compromissos };
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
    // O gasto não é uniforme no mês: o começo concentra contas e compras grandes. Multiplicar o
    // ritmo dos primeiros dias pelos dias que faltam previa, no dia 10, R$ 5 mil a mais do que saía
    // (teste contra jun–set/2026). Agora:
    // - conta travada (consórcio, seguro, imposto) é compromisso: média − o que já saiu, não vira ritmo;
    // - gasto livre: fração histórica do mês que ainda falta (perfil); da 1ª semana em diante, metade
    //   pela média e metade pelo observado até hoje escalado pelo perfil (erro médio 3.025 → 554).
    const diaHoje = Number(hoje.split('-')[2]);
    const dias = diasNoMes(anchor);
    const fr = base.fracaoRestanteDebito ?? (dias - diaHoje) / dias;
    const pelaMedia = base.despesaVariavelMediaMensal * fr;
    const despesaVariavel = diaHoje >= 7
      ? (pelaMedia + mc.variavelJaGasto * fr / Math.max(0.05, 1 - fr)) / 2
      : pelaMedia;
    const fixoQueFalta = Math.max(0, (base.despesaFixaDebitoMedia ?? 0) - (mc.fixoJaGasto ?? 0));
    const despesaFixa = mc.agendadoRestante + fixoQueFalta;
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

    const despesaVariavel = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
    const receita = receitaMensal;
    const fatura = faturaFutura(base, mes, i === 1 ? (diasAnchor - diaHojeNum) / diasAnchor : 1);
    const parcelas = Math.min(fatura, base.creditoPorVencimento[mes] ?? 0);
    const saldo = receita - despesaFixa - despesaManual - despesaCasa - despesaVariavel - fatura;
    saldoProjetado += saldo;
    out.push({ mes, mesLabel: mesLabel(mes), receita, despesaFixa, despesaManual, despesaCasa, despesaVariavel, fatura, parcelas, saldo, saldoProjetado });
  }
  return out;
}
