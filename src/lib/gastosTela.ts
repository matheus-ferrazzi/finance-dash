// Onda 5 (Gastos): contas da tela — dia a dia, crédito, grupos com categorias e seta vs média.
import type { CatGroup } from '../app/components/CategoryAccordion';
import { categoriaNoFiltro, grupoDaCategoria } from './grupos';
import { seta } from './seta';

export type LancGasto = {
  id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string;
  forma?: string; dinheiroId?: number;
};
export interface GrupoTela { nome: string; emoji: string; total: number; cats: string[]; seta: string | null; categorias: CatGroup[] }

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (ls: LancGasto[]) => r2(ls.reduce((s, x) => s + x.valor, 0));

/** O mesmo recorte do "Ritmo do dia" da home: débito e PIX, fora Casa e Dívida, sem dinheiro vivo. */
export const diaADia = (ls: LancGasto[]) =>
  soma(ls.filter((x) => !x.dinheiroId && x.forma === 'Débito' && categoriaNoFiltro(x.categoria, { tipo: 'livre' })));
export const noCredito = (ls: LancGasto[]) => soma(ls.filter((x) => x.forma === 'Crédito'));
// o pg entrega a coluna date como Date (meia-noite local), apesar do tipo dizer string: aceita os dois
const diaDoLancamento = (d: string | Date) => (typeof d === 'string' ? Number(d.slice(8, 10)) : d.getDate());
export const ateODia = (ls: LancGasto[], dia: number) => ls.filter((x) => diaDoLancamento(x.data) <= dia);
/** O que cabe no mês = o que já foi + o que ainda dá (sobra negativa não "tira" do que já foi gasto). */
export const cabeNoMes = (gasto: number, sobra: number) => r2(gasto + Math.max(0, sobra));

function grupoDe(cat: string) {
  const g = grupoDaCategoria(cat);
  return g ? { nome: g.nome, emoji: g.emoji } : { nome: 'Resto', emoji: '❓' };
}

/** Média mensal por grupo nos meses dados (mês sem gasto no grupo conta como 0). */
export function mediaPorGrupo(meses: LancGasto[][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mes of meses) for (const x of mes) { const g = grupoDe(x.categoria).nome; m.set(g, (m.get(g) ?? 0) + x.valor); }
  for (const [k, v] of m) m.set(k, r2(v / Math.max(1, meses.length)));
  return m;
}

export function gruposDoPeriodo(ls: LancGasto[], medias: Map<string, number> | null): GrupoTela[] {
  const grupos = new Map<string, { emoji: string; cats: Map<string, CatGroup> }>();
  for (const x of ls) {
    const g = grupoDe(x.categoria);
    const gr = grupos.get(g.nome) ?? { emoji: g.emoji, cats: new Map<string, CatGroup>() };
    const c = gr.cats.get(x.categoria) ?? { categoria: x.categoria, total: 0, n: 0, items: [] };
    c.total = r2(c.total + x.valor); c.n += 1;
    c.items.push({ id: x.id, data: x.data, valor: x.valor, descricao: x.descricao, banco: x.banco, responsavel: x.responsavel, dinheiroId: x.dinheiroId });
    gr.cats.set(x.categoria, c); grupos.set(g.nome, gr);
  }
  return Array.from(grupos, ([nome, gr]) => {
    const categorias = Array.from(gr.cats.values()).sort((a, b) => b.total - a.total);
    const total = r2(categorias.reduce((s, c) => s + c.total, 0));
    const media = medias?.get(nome);
    return { nome, emoji: gr.emoji, total, cats: categorias.slice(0, 3).map((c) => c.categoria), seta: media === undefined ? null : seta(total, media), categorias };
  }).sort((a, b) => b.total - a.total);
}
