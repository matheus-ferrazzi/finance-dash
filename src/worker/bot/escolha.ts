// 27/10 (fase 1, tokens): só as ferramentas e os trechos do prompt que servem à pergunta. As 14 ferramentas e todas
// as regras iam em toda chamada; uma pergunta de gasto não precisa das propostas nem do glossário das mensagens.
// Por palavras, sem chamada extra ao modelo; o agente refaz com tudo quando o conjunto reduzido não deu ferramenta.
import { TOOLS } from './ferramentas';
import type { Pergunta } from './entrada';

export type Grupo = 'base' | 'propostas' | 'mensagens' | 'compra' | 'patrimonio';
export const TODOS_GRUPOS: ReadonlySet<Grupo> = new Set<Grupo>(['base', 'propostas', 'mensagens', 'compra', 'patrimonio']);

export const GRUPO_DA: Record<string, Grupo> = {
  situacao_mes: 'base', gasto_periodo: 'base', maiores_gastos: 'base', comparar: 'base', faturas: 'base', contas_do_mes: 'base',
  buscar_lancamentos: 'propostas', propor_categoria: 'propostas', propor_conta_avulsa: 'propostas', propor_gasto_dinheiro: 'propostas',
  mensagens_do_zeca: 'mensagens', simular_compra: 'compra', trilha: 'patrimonio', investimentos: 'patrimonio',
};

const PALAVRAS: [Grupo, RegExp][] = [
  ['propostas', /corrig|categoria|muda|errad|lanc|anot|registr|dinheiro|avuls|conta nova|quero o l\d|^l\d$/],
  ['mensagens', /mensage|diario|semanal|mensal|alerta|aviso|explica|o que (voce|vc) (mandou|disse)/],
  ['compra', /compr|cabe|parcel|posso gastar|da pra pagar/],
  ['patrimonio', /trilha|fase|reserva|invest|carteira|aplica|tesouro|cdb|divida/],
];
const limpo = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** `base` sempre; os outros pelas palavras da pergunta ou da última pergunta do contexto ("e pra mercado?"). */
export function escolherGrupos(p: Pergunta, contexto: { pergunta: string }[]): Set<Grupo> {
  const textos = [limpo(p.texto), limpo(contexto[contexto.length - 1]?.pergunta ?? '')];
  const g = new Set<Grupo>(['base']);
  if (p.citada) g.add('mensagens');
  for (const [grupo, re] of PALAVRAS) if (textos.some((t) => re.test(t))) g.add(grupo);
  return g;
}

export function ferramentasDe(grupos: ReadonlySet<Grupo>): typeof TOOLS {
  return TOOLS.filter((t) => grupos.has(GRUPO_DA[t.function.name]));
}
