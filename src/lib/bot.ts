// E1: montadores puros das respostas das ferramentas do bot (as contas que o modelo não pode fazer).
import { agruparGastos, grupoDaCategoria } from './grupos';

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (m: ReadonlyMap<string, number>) => r2(Array.from(m.values()).reduce((s, v) => s + v, 0));

export function montarGasto(porCat: ReadonlyMap<string, number>, grupo: string | null): { total: number; itens: { nome: string; valor: number }[] } {
  if (grupo === null) {
    const itens = agruparGastos(porCat, 0).map((g) => ({ nome: g.nome, valor: r2(g.total) })).filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
    return { total: soma(porCat), itens };
  }
  const itens = Array.from(porCat.entries())
    .filter(([cat]) => (grupoDaCategoria(cat)?.nome ?? 'Resto') === grupo)
    .map(([nome, valor]) => ({ nome, valor: r2(valor) }))
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  return { total: r2(itens.reduce((s, i) => s + i.valor, 0)), itens };
}

export function montarComparar(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>) {
  const ga = montarGasto(a, null).itens, gb = montarGasto(b, null).itens;
  const nomes = Array.from(new Set([...ga.map((g) => g.nome), ...gb.map((g) => g.nome)]));
  const grupos = nomes.map((nome) => {
    const va = ga.find((g) => g.nome === nome)?.valor ?? 0, vb = gb.find((g) => g.nome === nome)?.valor ?? 0;
    return { nome, a: va, b: vb, diferenca: r2(va - vb) };
  }).sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca)).slice(0, 8);
  const totalA = soma(a), totalB = soma(b);
  return { totalA, totalB, diferenca: r2(totalA - totalB), pct: totalB > 0 ? Math.round(((totalA - totalB) / totalB) * 1000) / 10 : null, grupos };
}
