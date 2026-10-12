/** Grupos de gasto: é isso que dá a leitura de "pra onde vai cada R$100". */
export interface DefGrupo { nome: string; emoji: string; cats: string[]; travado: boolean }

export const GRUPOS_GASTO: DefGrupo[] = [
  { nome: 'Casa', emoji: '🏠', travado: true, cats: ['Housing', 'Electricity', 'Water', 'Telecommunications', 'Gas'] },
  {
    nome: 'Dívida e seguro', emoji: '🏦', travado: true,
    cats: ['Loans and financing', 'Loans', 'Insurance', 'Taxes', 'Bank fees', 'Interests charged',
      'Late payment and overdraft costs', 'Tax on financial operations'],
  },
  { nome: 'Mercado', emoji: '🛒', travado: false, cats: ['Groceries'] },
  { nome: 'Comer fora', emoji: '🍔', travado: false, cats: ['Food delivery', 'Eating out', 'Food and drinks'] },
  {
    nome: 'Lazer e digital', emoji: '🎮', travado: false,
    // 'Internet' na Pluggy é TikTok/ByteDance, não provedor (a internet de casa está em Telecommunications)
    cats: ['Digital services', 'Gaming', 'Cinema, theater and concerts', 'Tickets', 'Travel', 'Internet', 'Bookstore', 'Gambling'],
  },
  { nome: 'Saúde', emoji: '💊', travado: false, cats: ['Healthcare', 'Pharmacy', 'Hospital clinics and labs', 'Optometry', 'Wellness'] },
  { nome: 'Pet', emoji: '🐾', travado: false, cats: ['Pet supplies and vet'] },
  {
    nome: 'Transporte', emoji: '🚗', travado: false,
    cats: ['Gas stations', 'Automotive', 'Taxi and ride-hailing', 'Public transportation', 'Parking',
      'Tolls and in vehicle payment', 'Vehicle maintenance', 'Transportation'],
  },
  { nome: 'Compras', emoji: '🛍️', travado: false, cats: ['Shopping', 'Clothing', 'Online shopping', 'Electronics', 'Houseware', 'Services'] },
];

const POR_CATEGORIA = new Map(GRUPOS_GASTO.flatMap((g) => g.cats.map((c) => [c, g] as const)));

export function grupoDaCategoria(cat: string): DefGrupo | null {
  return POR_CATEGORIA.get(cat) ?? null;
}

export interface GrupoGasto {
  nome: string; emoji: string; total: number; pctRenda: number; travado: boolean;
}

/** Soma o gasto por grupo; o que não tem grupo vira "Resto". Ordenado do maior para o menor. */
export function agruparGastos(porCat: ReadonlyMap<string, number>, renda: number): GrupoGasto[] {
  const pct = (v: number) => (renda > 0 ? (v / renda) * 100 : 0);
  const totais = new Map<string, number>();
  let resto = 0;
  for (const [cat, v] of porCat) {
    const g = grupoDaCategoria(cat);
    if (g) totais.set(g.nome, (totais.get(g.nome) ?? 0) + v);
    else resto += v;
  }
  const grupos: GrupoGasto[] = GRUPOS_GASTO
    .filter((g) => (totais.get(g.nome) ?? 0) > 0)
    .map((g) => ({ nome: g.nome, emoji: g.emoji, total: totais.get(g.nome)!, travado: g.travado, pctRenda: pct(totais.get(g.nome)!) }));
  if (resto > 0) grupos.push({ nome: 'Resto', emoji: '❓', total: resto, travado: false, pctRenda: pct(resto) });
  return grupos.sort((a, b) => b.total - a.total);
}
