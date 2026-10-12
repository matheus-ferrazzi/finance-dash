// E2: textos das ações (montados pelo sistema) e a leitura de "sim/não/número/desfaz" (código, não modelo).
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export const CANCELADO = '❌ Cancelado.';
export const EXPIRADO = '⌛ Essa proposta expirou. Pede de novo.';
export const NADA_DESFAZER = '🤷 Nada para desfazer nas últimas 24 h.';

export function lerResposta(texto: string): 'sim' | 'nao' | 'desfaz' | { numero: number } | null {
  const t = texto.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(sim|s|confirma|confirmo|pode|ok)$/.test(t)) return 'sim';
  if (/^(n[aã]o|n|cancela|cancelar)$/.test(t)) return 'nao';
  if (/^(desfaz|desfazer)$/.test(t)) return 'desfaz';
  if (/^[1-5]$/.test(t)) return { numero: Number(t) };
  return null;
}

export function textoLista(itens: { ref: string; data: string; valor: number; descricao: string; pessoa: string; categoria: string }[]): string {
  return ['🔎 Achei estes. Qual? Responde o número.', ...itens.map((x, i) => `${i + 1}) ${x.data} ${x.descricao} ${brl(x.valor)} (${x.pessoa}, ${x.categoria})`)].join('\n');
}

export function textoPropostaCategoria(d: { afetados: number; categoria: string; escopo: 'este' | 'pessoa' | 'texto'; nome: string; item: { data: string; descricao: string; valor: number } }): string {
  const alvo = d.escopo === 'este' ? `só este: ${d.item.data} ${d.item.descricao} ${brl(d.item.valor)}`
    : d.escopo === 'pessoa' ? `todos da pessoa/empresa: ${d.nome}` : `todos com o texto "${d.nome}"`;
  return `🟡 Mudar *${d.afetados}* lançamento(s) para *${d.categoria}* (${alvo})?\n👉 Responde *sim* ou *não*.`;
}

export function textoPropostaAvulsa(d: { nome: string; valor: number; mes: string; pessoa: string }): string {
  return `🟡 Pôr a conta avulsa *${d.nome} ${brl(d.valor)}* em ${mesLabel(d.mes)} (${d.pessoa})?\n👉 Responde *sim* ou *não*.`;
}

export function textoFeito(resumo: string, link: string, painelUrl: string): string {
  return `✅ Feito: ${resumo}.\n↩️ Errado? *bot desfaz*\n\n👉 ${painelUrl.replace(/\/+$/, '')}${link}`;
}

export function textoDesfeito(resumo: string): string {
  return `↩️ Desfeito: ${resumo}.`;
}
