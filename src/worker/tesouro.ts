// Títulos do Tesouro de conexão desligada (17/10/2026: o Inter saiu do Meu Pluggy e não dá para recriar no plano
// grátis). O valor sai do preço público do Tesouro Transparente: quantidade × PU de resgate (venda) do dia mais
// recente. É o valor BRUTO — o banco mostrava o líquido de IR. Funções puras; a tarefa fica em tarefas.ts.

export const URL_PRECOS_TESOURO =
  'https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv';

export interface Titulo { tipo: string; ano: number }
export interface Preco { data: string; pu: number }

// o código vem antes do " - " no nome da Pluggy ("LFT - Tesouro Selic 2027"); "NTN-B Princ" antes de "NTN-B"
const POR_CODIGO: readonly [string, string][] = [
  ['LFT', 'Tesouro Selic'],
  ['LTN', 'Tesouro Prefixado'],
  ['NTN-F', 'Tesouro Prefixado com Juros Semestrais'],
  ['NTN-B PRINC', 'Tesouro IPCA+'],
  ['NTN-B', 'Tesouro IPCA+ com Juros Semestrais'],
];

/** "LFT - Tesouro Selic 2027" → { tipo: 'Tesouro Selic', ano: 2027 }; fora do Tesouro ou sem ano: null. */
export function tituloDoNome(nome: string): Titulo | null {
  const [codigo, resto] = nome.split(' - ');
  if (!resto) return null;
  const ano = resto.match(/\b(20\d{2})\s*$/);
  const tipo = POR_CODIGO.find(([c]) => codigo.trim().toUpperCase() === c)?.[1];
  return tipo && ano ? { tipo, ano: Number(ano[1]) } : null;
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const iso = (ddmmaaaa: string) => `${ddmmaaaa.slice(6, 10)}-${ddmmaaaa.slice(3, 5)}-${ddmmaaaa.slice(0, 2)}`;

/** Preços por título (tipo + vencimento), cada um na data mais recente do arquivo. */
export function lerPrecosTesouro(csv: string): Map<string, Preco & { tipo: string; vencimento: string }> {
  const out = new Map<string, Preco & { tipo: string; vencimento: string }>();
  for (const linha of csv.split(/\r?\n/).slice(1)) {
    const c = linha.split(';');
    if (c.length < 8) continue;
    const [tipo, venc, base, , , , puVenda, puBase] = c;
    // PU de resgate; título que não se vende de volta naquele dia vem 0: o PU base é a melhor marcação
    const pu = num(puVenda) || num(puBase);
    if (!(pu > 0)) continue;
    const vencimento = iso(venc), data = iso(base), k = `${tipo}|${vencimento}`;
    const ja = out.get(k);
    if (!ja || data > ja.data) out.set(k, { tipo, vencimento, data, pu });
  }
  return out;
}

/** O preço do título pelo tipo e ano; null sem preço ou com dois vencimentos do mesmo tipo no ano (ambíguo). */
export function precoDoTitulo(precos: ReturnType<typeof lerPrecosTesouro>, t: Titulo): Preco | null {
  const achados = Array.from(precos.values()).filter((p) => p.tipo === t.tipo && p.vencimento.startsWith(`${t.ano}-`));
  return achados.length === 1 ? { data: achados[0].data, pu: achados[0].pu } : null;
}
