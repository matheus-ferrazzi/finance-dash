import type { Lancamento } from './tipos';

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
  if (remover.length > limiteFracao * idsCandidatos.length) return { remover: [], abortado: 'acima_do_limite' };
  return { remover, abortado: null };
}
