// E1: montadores puros das respostas das ferramentas do bot (as contas que o modelo não pode fazer).
// E3: o gasto em dinheiro vivo entra somado, e cada item diz quanto dele foi em dinheiro.
import { agruparGastos, grupoDaCategoria } from './grupos';

const r2 = (x: number) => Math.round(x * 100) / 100;
const soma = (m: ReadonlyMap<string, number>) => r2(Array.from(m.values()).reduce((s, v) => s + v, 0));
const VAZIO: ReadonlyMap<string, number> = new Map();

/** Soma dois mapas categoria → valor (puro: os montadores não dependem do banco). */
export function somarMapas(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Map<string, number> {
  const m = new Map(a);
  for (const [k, v] of b) m.set(k, r2((m.get(k) ?? 0) + v));
  return m;
}

export function montarGasto(porCat: ReadonlyMap<string, number>, grupo: string | null, dinheiro: ReadonlyMap<string, number> = VAZIO) {
  const tudo = somarMapas(porCat, dinheiro);
  if (grupo === null) {
    const porGrupo = new Map<string, number>();
    for (const [cat, v] of dinheiro) {
      const g = grupoDaCategoria(cat)?.nome ?? 'Resto';
      porGrupo.set(g, r2((porGrupo.get(g) ?? 0) + v));
    }
    const itens = agruparGastos(tudo, 0).map((g) => ({ nome: g.nome, valor: r2(g.total), dinheiro: porGrupo.get(g.nome) ?? 0 }))
      .filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor);
    return { total: soma(tudo), totalDinheiro: soma(dinheiro), itens };
  }
  const itens = Array.from(tudo.entries())
    .filter(([cat]) => (grupoDaCategoria(cat)?.nome ?? 'Resto') === grupo)
    .map(([nome, valor]) => ({ nome, valor: r2(valor), dinheiro: dinheiro.get(nome) ?? 0 }))
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  return { total: r2(itens.reduce((s, i) => s + i.valor, 0)), totalDinheiro: r2(itens.reduce((s, i) => s + i.dinheiro, 0)), itens };
}

export function montarComparar(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>,
  dinA: ReadonlyMap<string, number> = VAZIO, dinB: ReadonlyMap<string, number> = VAZIO) {
  const ta = somarMapas(a, dinA), tb = somarMapas(b, dinB);
  const ga = montarGasto(ta, null).itens, gb = montarGasto(tb, null).itens;
  const nomes = Array.from(new Set([...ga.map((g) => g.nome), ...gb.map((g) => g.nome)]));
  const grupos = nomes.map((nome) => {
    const va = ga.find((g) => g.nome === nome)?.valor ?? 0, vb = gb.find((g) => g.nome === nome)?.valor ?? 0;
    return { nome, a: va, b: vb, diferenca: r2(va - vb) };
  }).sort((x, y) => Math.abs(y.diferenca) - Math.abs(x.diferenca)).slice(0, 8);
  const totalA = soma(ta), totalB = soma(tb);
  return {
    totalA, totalB, diferenca: r2(totalA - totalB), pct: totalB > 0 ? Math.round(((totalA - totalB) / totalB) * 1000) / 10 : null, grupos,
    totalDinheiroA: soma(dinA), totalDinheiroB: soma(dinB),
  };
}
