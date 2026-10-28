// 28/10 (Zeca fase 3): a consulta livre do Zeca. O modelo escolhe parâmetros; o SQL (queries.ts) só filtra pelas
// regras do painel e devolve as linhas; aqui, sem banco, filtra o resto, agrupa e soma.
import { CATEGORIAS_CONHECIDAS, mesLabel, traduzCategoria } from './format';
import { GRUPOS_VALIDOS, grupoDaCategoria } from './grupos';
import { nomeSemDocumento } from './categoriaPainel';
import { lerPessoa, resolverPeriodo } from './periodos';
import type { Resp } from './queries';

export type OQue = 'gastos' | 'dia_a_dia' | 'entradas' | 'lancamentos';
export type Agrupar = 'nada' | 'categoria' | 'grupo' | 'loja' | 'dia' | 'semana' | 'mes' | 'pessoa';
type Forma = 'debito' | 'credito' | 'dinheiro';
type Periodo = { inicio: string; fimExcl: string; label: string };

export type PedidoConsulta = {
  oQue: OQue; periodo: Periodo; pessoa: Resp; grupo: string | null; categoria: string | null; texto: string | null;
  forma: Forma | null; min: number | null; max: number | null; agrupar: Agrupar; ordem: 'valor' | 'data'; limite: number;
};
/** `valor` já com o sinal do gasto (estorno negativo); `forma` 'Débito' | 'Crédito' | 'Dinheiro' | ''; `data` AAAA-MM-DD */
export type LinhaBruta = { data: string; valor: number; descricao: string; categoria: string; pessoa: string; forma: string };
export type ResultadoConsulta = {
  regra: string; periodo: string; pessoa: Resp; total: number; totalDinheiro: number; qtd: number;
  linhas: { chave: string; valor: number; qtd: number }[]; cortadas: number;
};

export const REGRA_DO: Record<OQue, string> = {
  gastos: 'gasto: débito, crédito e dinheiro vivo; sem dívida antiga',
  dia_a_dia: 'dia a dia: débito e PIX, fora contas da casa e contas fixas (o ritmo)',
  entradas: 'entradas: as receitas, como na tela do painel',
  lancamentos: 'lançamentos de gasto e de entrada',
};
const O_QUE: OQue[] = ['gastos', 'dia_a_dia', 'entradas', 'lancamentos'];
const AGRUPAR: Agrupar[] = ['nada', 'categoria', 'grupo', 'loja', 'dia', 'semana', 'mes', 'pessoa'];
const FORMAS: Forma[] = ['debito', 'credito', 'dinheiro'];
const FORMA_DA: Record<Forma, string> = { debito: 'Débito', credito: 'Crédito', dinheiro: 'Dinheiro' };
const LIMITE_MAX = 20;
const MESES_MAX = 24;

const r2 = (x: number) => Math.round(x * 100) / 100;
const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const segunda = (d: string) => somaDias(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));

const ERRO_PERIODO = 'periodo inválido: use hoje, esta_semana, semana_passada, este_mes, mes_passado, AAAA-MM ou AAAA-MM-DD..AAAA-MM-DD (até 24 meses, sem futuro)';

function lerPeriodo(v: string, hoje: string): Periodo | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(v);
  if (!m) return resolverPeriodo(v, hoje);
  const [, ini, fim] = m;
  if (!dataValida(ini) || !dataValida(fim) || fim < ini || fim > hoje) return null;
  const meses = (Number(fim.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(fim.slice(5, 7)) - Number(ini.slice(5, 7));
  if (meses > MESES_MAX) return null;
  return { inicio: ini, fimExcl: somaDias(fim, 1), label: `${ddmm(ini)} a ${ddmm(fim)}` };
}

function numero(v: string | null): number | null | undefined {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function lerPedidoConsulta(sp: URLSearchParams, hoje: string): { ok: true; v: PedidoConsulta } | { ok: false; erro: string } {
  const oQue = (sp.get('o_que') ?? '') as OQue;
  if (!O_QUE.includes(oQue)) return { ok: false, erro: `o_que inválido: use ${O_QUE.join(', ')}` };
  const periodo = lerPeriodo(sp.get('periodo') ?? '', hoje);
  if (!periodo) return { ok: false, erro: ERRO_PERIODO };
  const pessoa = lerPessoa(sp.get('pessoa'));
  if (!pessoa) return { ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' };
  const grupo = sp.get('grupo') || null;
  if (grupo && !GRUPOS_VALIDOS.includes(grupo)) return { ok: false, erro: `grupo inválido: use ${GRUPOS_VALIDOS.join(', ')}` };
  const forma = (sp.get('forma') || null) as Forma | null;
  if (forma && !FORMAS.includes(forma)) return { ok: false, erro: `forma inválida: use ${FORMAS.join(', ')}` };
  const agrupar = (sp.get('agrupar') || 'nada') as Agrupar;
  if (!AGRUPAR.includes(agrupar)) return { ok: false, erro: `agrupar inválido: use ${AGRUPAR.join(', ')}` };
  const ordem = sp.get('ordem') || 'valor';
  if (ordem !== 'valor' && ordem !== 'data') return { ok: false, erro: 'ordem inválida: use valor ou data' };
  // 28/10: "iFood" como categoria dava lista vazia e o Zeca dizia "não há registro" — loja vai no texto
  const categoria = sp.get('categoria') || null;
  if (categoria && !CATEGORIAS_CONHECIDAS.some((c) => semAcento(c) === semAcento(categoria) || semAcento(traduzCategoria(c)) === semAcento(categoria))) {
    return { ok: false, erro: `categoria "${categoria}" não existe no painel; para uma loja ou empresa use texto, para um tipo de gasto use grupo` };
  }
  const min = numero(sp.get('min')), max = numero(sp.get('max')), lim = numero(sp.get('limite'));
  if (min === undefined || max === undefined) return { ok: false, erro: 'min e max são números (reais)' };
  if (lim === undefined) return { ok: false, erro: 'limite é um número de 1 a 20' };
  return {
    ok: true,
    v: {
      oQue, periodo, pessoa, grupo, forma, agrupar, ordem, min, max,
      categoria, texto: sp.get('texto') || null,
      limite: Math.min(LIMITE_MAX, Math.max(1, Math.floor(lim ?? LIMITE_MAX))),
    },
  };
}

// 28/10: o nome da loja sem o que o banco põe na frente ("Pagamento de Pix QR Code ", "Compra no débito|")
const PREFIXO = /^(?:[^|]*\|\s*|pagamento de pix qr code\s+|pix enviado\s+(?:para\s+)?|transfer[êe]ncia enviada\s+(?:pelo pix\s+)?)/i;
const semPrefixo = (d: string) => d.replace(PREFIXO, '').trim() || d;

function chaveDa(x: LinhaBruta, a: Agrupar): string {
  switch (a) {
    case 'categoria': return traduzCategoria(x.categoria);
    case 'grupo': return grupoDaCategoria(x.categoria)?.nome ?? 'Resto';
    case 'loja': return nomeSemDocumento(semPrefixo(x.descricao)) ?? '(sem descrição)';
    case 'dia': return ddmm(x.data);
    case 'semana': return `semana de ${ddmm(segunda(x.data))}`;
    case 'mes': return mesLabel(x.data.slice(0, 7));
    case 'pessoa': return x.pessoa || '—';
    default: return '';
  }
}

export function agregarConsulta(linhas: LinhaBruta[], p: PedidoConsulta): ResultadoConsulta {
  const cat = p.categoria ? semAcento(p.categoria) : null;
  const filtradas = linhas.filter((x) =>
    (p.grupo === null || (grupoDaCategoria(x.categoria)?.nome ?? 'Resto') === p.grupo)
    && (cat === null || semAcento(x.categoria) === cat || semAcento(traduzCategoria(x.categoria)) === cat)
    && (p.forma === null || x.forma === FORMA_DA[p.forma])
    && (p.min === null || x.valor >= p.min) && (p.max === null || x.valor <= p.max));
  const total = r2(filtradas.reduce((s, x) => s + x.valor, 0));
  const totalDinheiro = r2(filtradas.filter((x) => x.forma === 'Dinheiro').reduce((s, x) => s + x.valor, 0));
  const base = { regra: REGRA_DO[p.oQue], periodo: p.periodo.label, pessoa: p.pessoa, total, totalDinheiro, qtd: filtradas.length };
  if (p.agrupar === 'nada') return { ...base, linhas: [], cortadas: 0 };
  // a primeira data de cada chave ordena por data (dia, semana, mês)
  const grupos = new Map<string, { chave: string; valor: number; qtd: number; data: string }>();
  for (const x of filtradas) {
    const k = chaveDa(x, p.agrupar);
    const g = grupos.get(k) ?? { chave: k, valor: 0, qtd: 0, data: x.data };
    g.valor = r2(g.valor + x.valor); g.qtd++; if (x.data < g.data) g.data = x.data;
    grupos.set(k, g);
  }
  const todas = [...grupos.values()].sort((a, b) => (p.ordem === 'data' ? a.data.localeCompare(b.data) : b.valor - a.valor));
  return { ...base, linhas: todas.slice(0, p.limite).map(({ chave, valor, qtd }) => ({ chave, valor, qtd })), cortadas: Math.max(0, todas.length - p.limite) };
}
