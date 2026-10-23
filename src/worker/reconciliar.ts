import { diaSP } from './linha';
import type { Lancamento, PluggyTransacao } from './tipos';

/** Os campos que o Finance 2.0 grava. A comparação do modo sombra é sobre eles. */
export const CAMPOS_PARIDADE = [
  'data_lancamento', 'valor', 'tipo_movimento', 'classe', 'descricao', 'categoria',
  'forma_pagamento', 'banco', 'responsavel', 'status_pluggy',
] as const;
export type CampoParidade = (typeof CAMPOS_PARIDADE)[number];
export type LinhaBanco = { id_transacao: string } & Record<CampoParidade, string | number | null>;

export interface Diferencas {
  novos: number;
  alterados: number;
  iguais: number;
  porCampo: Partial<Record<CampoParidade, number>>;
}

function igual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Math.abs(Number(a) - Number(b)) < 0.005;
  return (a ?? null) === (b ?? null);
}

export function contarDiferencas(banco: ReadonlyMap<string, LinhaBanco>, novas: readonly Lancamento[]): Diferencas {
  const d: Diferencas = { novos: 0, alterados: 0, iguais: 0, porCampo: {} };
  for (const n of novas) {
    const b = banco.get(n.id_transacao);
    if (!b) {
      d.novos++;
      continue;
    }
    const mudou = CAMPOS_PARIDADE.filter((c) => !igual(b[c], n[c]));
    if (mudou.length === 0) {
      d.iguais++;
      continue;
    }
    d.alterados++;
    for (const c of mudou) d.porCampo[c] = (d.porCampo[c] ?? 0) + 1;
  }
  return d;
}

export interface PlanoReconciliacao {
  remover: string[];
  abortado: null | 'pluggy_vazio' | 'acima_do_limite';
}

/**
 * O que está no banco (na janela) e a Pluggy não devolveu mais: foi cancelado ou recriado com id novo.
 * Travas: Pluggy vazia com linhas no banco, ou remoção grande demais, não removem nada.
 */
export function planejarReconciliacao(
  idsPluggy: ReadonlySet<string>,
  idsCandidatos: readonly string[],
  limiteFracao = 0.2,
): PlanoReconciliacao {
  if (idsCandidatos.length === 0) return { remover: [], abortado: null };
  if (idsPluggy.size === 0) return { remover: [], abortado: 'pluggy_vazio' };
  const remover = idsCandidatos.filter((id) => !idsPluggy.has(id));
  // W3 (23/10): a fração só vale com volume — até 3 linhas sempre passa (em conta pequena, 1 cancelamento já era > 20%
  // e a linha cancelada nunca mais saía)
  if (remover.length > Math.max(3, limiteFracao * idsCandidatos.length)) return { remover: [], abortado: 'acima_do_limite' };
  return { remover, abortado: null };
}

const SO_DATA = /T0[03]:00:00(\.00\d)?Z$/;
const PAGAMENTO = /^pagamento recebido/i;

/**
 * Auditoria 18/10: o Nubank manda cada pagamento de fatura duas vezes, com ids diferentes — uma cópia com a hora do
 * pagamento e outra só com a data (03:00Z), as duas ainda devolvidas pela Pluggy (12 de 12 meses em abr–out/26, uma
 * saída só no débito). Fica a cópia com hora; a seca sai, uma para cada cópia com hora do mesmo valor, texto e dia.
 * Sem gêmeo com hora a seca fica (dois pagamentos iguais no mesmo dia continuam dois). Só pagamento: compra igual
 * no mesmo dia é compra repetida de verdade (duas refeições iguais com 6 minutos de diferença).
 */
export function semGemeosDePagamento(txs: readonly PluggyTransacao[]): PluggyTransacao[] {
  const chave = (t: PluggyTransacao) => `${t.amount}|${(t.description ?? '').trim().toLowerCase()}|${diaSP(t.date)}`;
  const comHora = new Map<string, number>();
  for (const t of txs) if (PAGAMENTO.test(t.description ?? '') && !SO_DATA.test(t.date)) comHora.set(chave(t), (comHora.get(chave(t)) ?? 0) + 1);
  const tirar = new Set<string>();
  for (const t of txs) {
    if (!PAGAMENTO.test(t.description ?? '') || !SO_DATA.test(t.date)) continue;
    const n = comHora.get(chave(t)) ?? 0;
    if (n > 0) { tirar.add(t.id); comHora.set(chave(t), n - 1); }
  }
  return txs.filter((t) => !tirar.has(t.id));
}
