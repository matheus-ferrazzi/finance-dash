// Trilha do casal (F3): sair das dívidas → fazer sobrar → reserva → patrimônio. Regras e textos puros.
import { addMonths } from './previsao';
import { mesLabel } from './format';

const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const CATS_DIVIDA = ['Loans and financing', 'Loans'];
const PALAVRAS_DIVIDA = ['RENEGOCIA', 'PARCELAMENTO DE FATURA', 'PARC.FATURA', 'EMPREST', 'FINANCIAMENTO'];
const CATS_ATRASO = ['Interests charged', 'Late payment and overdraft costs'];
// ROTATIV (Onda 2): IOF e juros do rotativo do cartão também são sinal de fatura não paga inteira
const PALAVRAS_ATRASO = ['JUROS DE MORA', 'ENCARGOS DE ATRASO', 'ENC ATRASO', 'ROTATIV'];

/** Dívida de verdade (renegociação, parcelamento de fatura, empréstimo); compra parcelada comum não é. */
export function ehDivida(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_DIVIDA.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_DIVIDA.some((p) => d.includes(p));
}

/** Juros/encargos de atraso: sinal de fatura não paga inteira ou de conta no negativo. */
export function ehAtraso(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_ATRASO.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_ATRASO.some((p) => d.includes(p));
}

/**
 * 17/10: ehDivida || ehAtraso em SQL, das mesmas listas (a meta de gastos tira a dívida antiga no banco). As palavras
 * só têm letra, ponto e espaço: nada que o ILIKE trate como curinga.
 */
export function sqlDividaOuAtraso(desc = 'descricao', cat = 'categoria'): string {
  const lit = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
  const semAc = `translate(upper(${desc}), 'ÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'AAAAEEIOOOUUC')`;
  return `(COALESCE(${cat}, '') IN (${lit([...CATS_DIVIDA, ...CATS_ATRASO])}) OR ${semAc} LIKE ANY (ARRAY[${lit([...PALAVRAS_DIVIDA, ...PALAVRAS_ATRASO].map((p) => `%${p}%`))}]))`;
}

export interface LancDivida {
  descricao: string; categoria: string | null; banco: string; forma: string; data: string; valor: number;
  parcelaTotal?: number | null;
  /** F3 (a): a parcela n de m — sem as futuras lançadas, n < m ainda é dívida aberta */
  parcelaNumero?: number | null;
}
/** `plano` = nº de parcelas do plano (N9): a mesma dívida pode ter dois planos com a mesma descrição */
export interface DividaAtiva { chave: string; nome: string; banco: string; plano: number | null; valorParcela: number; restantes: number | null; fim: string | null }
/** Correções do casal (F4b): grupos marcados "não é dívida" saem; "é dívida" entram mesmo sem a regra pegar. */
export interface MarcasDivida { nao: ReadonlySet<string>; sim: ReadonlySet<string> }
const SEM_MARCAS: MarcasDivida = { nao: new Set(), sim: new Set() };

const nomeDivida = (d: string) => d.toLowerCase().replace(/[0-9/.]/g, ' ').replace(/\s+/g, ' ').trim();

/** A chave de um grupo de dívida (as parcelas do mesmo parcelamento): descrição sem números + banco. */
export function chaveDivida(descricao: string, banco: string): string {
  return `${nomeDivida(descricao)}|${banco}`;
}

/** Dívidas ainda em aberto: parcelas depois de hoje; prestação no débito (sem data futura) fica sem fim. */
export function agruparDividas(lancs: LancDivida[], hoje: string, marcas: MarcasDivida = SEM_MARCAS): DividaAtiva[] {
  // agrupa por dívida (chave da marcação) E por plano (parcela_total): dois planos não se fundem
  const grupos = new Map<string, LancDivida[]>();
  for (const l of lancs) {
    const k = chaveDivida(l.descricao, l.banco);
    // F4b: a marca pode ser do plano (chave#parcelas): vale só para aquele parcelamento
    const kp = l.parcelaTotal ? `${k}#${l.parcelaTotal}` : null;
    const nao = marcas.nao.has(k) || (kp !== null && marcas.nao.has(kp));
    const sim = marcas.sim.has(k) || (kp !== null && marcas.sim.has(kp));
    if (nao || !(ehDivida(l.descricao, l.categoria) || sim)) continue;
    const g = `${k}#${l.parcelaTotal ?? ''}`;
    grupos.set(g, [...(grupos.get(g) ?? []), l]);
  }
  const out: DividaAtiva[] = [];
  for (const [g, ls] of Array.from(grupos)) {
    const [k, p] = g.split('#');
    const [nome, banco] = k.split('|');
    const plano = p ? Number(p) : null;
    const futuras = ls.filter((l) => l.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
    // F3 (a): a última parcela vista (n de m) — se faltam parcelas além das já lançadas, a dívida segue aberta
    const ultVista = [...ls].sort((a, b) => a.data.localeCompare(b.data))[ls.length - 1];
    const faltamDepois = plano && ultVista.parcelaNumero ? plano - ultVista.parcelaNumero : 0;
    if (futuras.length > 0) {
      const ult = futuras[futuras.length - 1];
      out.push({ chave: k, nome, banco, plano, valorParcela: ult.valor, restantes: futuras.length, fim: ult.data.slice(0, 7) });
    } else if (faltamDepois > 0) {
      out.push({ chave: k, nome, banco, plano, valorParcela: ultVista.valor, restantes: faltamDepois, fim: addMonths(ultVista.data.slice(0, 7), faltamDepois) });
    } else if (ls.some((l) => l.forma === 'Débito')) {
      const ult = [...ls].sort((a, b) => a.data.localeCompare(b.data))[ls.length - 1];
      out.push({ chave: k, nome, banco, plano, valorParcela: ult.valor, restantes: null, fim: null });
    }
  }
  return out.sort((a, b) => (a.fim ?? '9999').localeCompare(b.fim ?? '9999'));
}

/** Meses em que o saldo em conta (reconstruído do saldo de hoje e dos movimentos) ficou negativo. */
export function mesesComContaNegativa(saldoHoje: number, movs: Record<string, number>, desde: string, hoje: string): string[] {
  const dias = Object.keys(movs).filter((d) => d >= desde && d <= hoje).sort();
  let saldo = saldoHoje - dias.reduce((s, d) => s + movs[d], 0);
  const meses = new Set<string>();
  if (saldo < -0.005) meses.add(desde.slice(0, 7));
  for (const d of dias) {
    saldo += movs[d];
    if (saldo < -0.005) meses.add(d.slice(0, 7));
  }
  return Array.from(meses).sort();
}

export const MESES_RESERVA = 6;
export const META_PATRIMONIO = 0.1;

/** Metas que o casal ajusta pela tela (F4b); sem ajuste, os padrões acima. */
export interface MetasTrilha { mesesReserva: number; metaPatrimonio: number }
export const METAS_PADRAO: MetasTrilha = { mesesReserva: MESES_RESERVA, metaPatrimonio: META_PATRIMONIO };

export type ChaveMeta = 'meses_reserva' | 'meta_patrimonio';
/** Valor da tela (meses ou %, aceita vírgula) → valor gravado (meses inteiros; patrimônio em fração). */
export function validarMeta(chave: unknown, valor: unknown): { ok: true; chave: ChaveMeta; valor: number } | { ok: false; erro: string } {
  // só número simples ("12", "12,5", "12.5"): Number() sozinho aceitaria "0x10" e "1e1"
  const txt = String(valor ?? '').trim();
  const valido = typeof valor === 'number' ? Number.isFinite(valor) : /^\d+([.,]\d+)?$/.test(txt);
  const vazio = !valido;
  const n = typeof valor === 'number' ? valor : Number(txt.replace(',', '.'));
  if (chave === 'meses_reserva') {
    if (vazio || !Number.isInteger(n) || n < 1 || n > 24) return { ok: false, erro: 'Meses da reserva: número inteiro de 1 a 24.' };
    return { ok: true, chave, valor: n };
  }
  if (chave === 'meta_patrimonio') {
    if (vazio || !Number.isFinite(n) || n < 1 || n > 50) return { ok: false, erro: 'Patrimônio: de 1% a 50%.' };
    return { ok: true, chave, valor: Math.round(n * 10) / 1000 };
  }
  return { ok: false, erro: 'Meta desconhecida.' };
}
export const MESES_ATRASO = 2;
export const MESES_SOBRA = 3;

export interface DadosTrilha {
  hoje: string;
  dividas: DividaAtiva[];
  atrasos: { mes: string; motivo: 'juros' | 'conta_negativa' }[];
  /** meses fechados (do mais antigo), sobra e receita reais */
  passados: { mes: string; sobra: number; receita: number }[];
  /** sobra prevista dos meses futuros (projeção do casal) */
  sobraPrevista: { mes: string; sobra: number }[];
  /** a frase da meta de gasto no débito (F2a) */
  textoMeta: string;
  gastoTravado: { fixos: number; casa: number; debitoTravado: number };
  aplicado: number;
  /** aplicação líquida (aplicou − resgatou) dos meses fechados */
  aplicacaoMensal: { mes: string; valor: number }[];
  /** metas ajustadas pelo casal; ausente = padrão */
  metas?: MetasTrilha;
}
export type StatusFase = 'cumprida' | 'atual' | 'depois';
export interface Fase { n: 1 | 2 | 3 | 4; titulo: string; status: StatusFase; quando: string | null; proximoPasso: string }
export interface Trilha {
  atual: 1 | 2 | 3 | 4; fases: Fase[];
  reserva: { meta: number; aplicado: number; ritmo: number; meses: number };
  patrimonio: { pct: number; meta: number };
  sobra: { cumpridos: number; meses: { mes: string; sobra: number }[] };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// Valor dentro de uma frase: marcado no texto e desenhado à parte (com a classe "money", que o olho
// de esconder valores borra); formatado dentro da string, o valor ficaria sempre visível.
export const marcaDinheiro = (v: number) => `{{${r2(v)}}}`;

/** Separa uma frase com valores marcados em texto e números, na ordem. */
export function partesDoTexto(s: string): (string | number)[] {
  return s.split(/\{\{(-?[0-9.]+)\}\}/).map((p, i) => (i % 2 ? Number(p) : p)).filter((p) => p !== '');
}

/** As quatro fases: cumprida pelo que já aconteceu, "quando" pela previsão; a atual é a primeira não cumprida. */
export function avaliarTrilha(d: DadosTrilha): Trilha {
  const mesAtual = d.hoje.slice(0, 7);
  const metas = d.metas ?? METAS_PADRAO;

  // 1. dívidas: atraso só some da janela MESES_ATRASO meses depois
  const semFim = d.dividas.some((x) => x.fim === null);
  const ultAtraso = d.atrasos.map((a) => a.mes).sort().pop() ?? null;
  const ultParcela = d.dividas.map((x) => x.fim).filter((f): f is string => !!f).sort().pop() ?? null;
  const limpaEm = [ultParcela, ultAtraso ? addMonths(ultAtraso, MESES_ATRASO) : null].filter((x): x is string => !!x).sort().pop() ?? null;
  const f1ok = d.dividas.length === 0 && d.atrasos.length === 0;
  const q1 = f1ok ? null : semFim ? 'sem data de fim conhecida' : limpaEm ? mesLabel(limpaEm) : null;
  const p1 = ultAtraso
    ? `Houve juros ou conta negativa em ${mesLabel(ultAtraso)}: pagar a fatura inteira e não deixar a conta negativa.`
    : semFim ? 'Manter a fatura paga inteira; há dívida sem data de fim conhecida.'
    : ultParcela ? `Manter a fatura paga inteira; a última parcela de dívida é em ${mesLabel(ultParcela)}.`
    : 'Sem dívidas: manter assim.';

  // 2. fazer sobrar
  const meses = d.passados.slice(-MESES_SOBRA);
  // F3 (b): mês sem dado nenhum (nada entrou) não é mês em que sobrou
  const sobrou = (m: { sobra: number; receita?: number }) => m.sobra >= 0 && (m.receita === undefined || m.receita > 0);
  const cumpridos = meses.filter(sobrou).length;
  const f2ok = meses.length >= MESES_SOBRA && cumpridos === MESES_SOBRA;
  // F3 (c): a sequência começa nos meses fechados que já sobraram (antes só olhava a previsão e atrasava)
  const seq = [...meses.map((m) => ({ mes: m.mes, ok: sobrou(m), previsto: false })),
    ...d.sobraPrevista.map((m) => ({ mes: m.mes, ok: m.sobra >= 0, previsto: true }))];
  let q2 = 'pela previsão, não acontece em 24 meses';
  for (let j = MESES_SOBRA - 1; j < seq.length; j++) {
    const janela = seq.slice(j - MESES_SOBRA + 1, j + 1);
    // meses seguidos (sem buraco entre o último fechado e o primeiro previsto)
    const seguidos = janela.every((m, k) => k === 0 || m.mes === addMonths(janela[k - 1].mes, 1));
    if (seq[j].previsto && seguidos && janela.every((m) => m.ok)) { q2 = mesLabel(seq[j].mes); break; }
  }

  // 3. reserva
  const g = d.gastoTravado;
  const meta = r2(metas.mesesReserva * (g.fixos + g.casa + g.debitoTravado));
  const f3ok = d.aplicado >= meta;
  const ritmo = d.aplicacaoMensal.length ? r2(d.aplicacaoMensal.reduce((s, m) => s + m.valor, 0) / d.aplicacaoMensal.length) : 0;
  const falta = Math.max(0, meta - d.aplicado);
  const q3 = f3ok ? null : ritmo > 0 ? mesLabel(addMonths(mesAtual, Math.ceil(falta / ritmo))) : 'sem previsão';
  // N18: o "quando" é pelo ritmo de hoje; o passo propõe outro ritmo — quando as datas diferem, dizer as duas bases
  const em12 = mesLabel(addMonths(mesAtual, 12));
  const p3 = f3ok ? 'Reserva completa: manter.'
    : `${q3 && q3 !== em12 && q3 !== 'sem previsão' ? `No ritmo de hoje, ${q3}. ` : ''}Aplicar ${marcaDinheiro(Math.ceil(falta / 12))}/mês completa a reserva em ${em12}.`;

  // 4. patrimônio
  const receita = d.passados.reduce((s, m) => s + m.receita, 0);
  const aplicacao = d.aplicacaoMensal.reduce((s, m) => s + m.valor, 0);
  const pct = receita > 0 ? r2(aplicacao / receita) : 0;
  const receitaMedia = d.passados.length ? receita / d.passados.length : 0;

  const ok = [f1ok, f2ok, f3ok];
  const atual = ((ok.findIndex((x) => !x) + 1) || 4) as 1 | 2 | 3 | 4;
  const st = (n: number, cumprida: boolean): StatusFase => (n === atual ? 'atual' : cumprida ? 'cumprida' : 'depois');
  return {
    atual,
    fases: [
      { n: 1, titulo: 'Sair das dívidas', status: st(1, f1ok), quando: q1, proximoPasso: p1 },
      { n: 2, titulo: 'Fazer sobrar', status: st(2, f2ok), quando: f2ok ? null : q2, proximoPasso: d.textoMeta },
      { n: 3, titulo: 'Reserva de emergência', status: st(3, f3ok), quando: q3, proximoPasso: p3 },
      // F3 (d): o passo diz o % de hoje (a faixa do topo só mostra o passo)
      { n: 4, titulo: 'Construir patrimônio', status: st(4, false), quando: null, proximoPasso: `Hoje: ${Math.round(pct * 100)}% do que entra vai para aplicação. Aplicar ${Math.round(metas.metaPatrimonio * 1000) / 10}% do que entra (${marcaDinheiro(receitaMedia * metas.metaPatrimonio)}/mês).` },
    ],
    reserva: { meta, aplicado: d.aplicado, ritmo, meses: metas.mesesReserva },
    patrimonio: { pct, meta: metas.metaPatrimonio },
    sobra: { cumpridos, meses: meses.map((m) => ({ mes: m.mes, sobra: m.sobra })) },
  };
}
