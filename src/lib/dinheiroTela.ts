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
