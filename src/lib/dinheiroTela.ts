// E3: gasto em dinheiro como linha das telas Gastos e Buscar (id próprio: não é lançamento do banco).
type GastoDinheiro = { id: number; data: string; valor: number; descricao: string; categoria: string; pessoa: string };
type LancTela = { id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string; classe: string; dinheiroId?: number };

export function paraLancamentos(gs: GastoDinheiro[]) {
  return gs.map((g) => ({
    id: `din-${g.id}`, data: g.data, valor: g.valor, descricao: g.descricao, categoria: g.categoria,
    banco: '💵 Dinheiro', responsavel: g.pessoa, classe: 'despesa', dinheiroId: g.id,
  }));
}

/** Busca: resultados do banco e do dinheiro numa lista só, mais recentes primeiro. */
export function juntarBusca(banco: LancTela[], dinheiro: GastoDinheiro[]): LancTela[] {
  return [...banco, ...paraLancamentos(dinheiro)].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}

/** N19: "Por banco" da própria lista mostrada (com filtro e com o dinheiro), para as barras somarem o total. */
export function porBanco(ls: readonly { banco: string; valor: number }[]): { banco: string; total: number }[] {
  const m = new Map<string, number>();
  for (const l of ls) m.set(l.banco, (m.get(l.banco) ?? 0) + l.valor);
  return Array.from(m, ([banco, total]) => ({ banco, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);
}
