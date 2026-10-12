// E3: gasto em dinheiro como linha da tela Gastos (id próprio: não é lançamento do banco).
export function paraLancamentos(gs: { id: number; data: string; valor: number; descricao: string; categoria: string; pessoa: string }[]) {
  return gs.map((g) => ({ id: `din-${g.id}`, data: g.data, valor: g.valor, descricao: g.descricao, categoria: g.categoria, banco: '💵 Dinheiro', responsavel: g.pessoa, dinheiroId: g.id }));
}
