// O que cada quadrado da home mostra. "—" na tela quando a função devolve null/vazio.
import type { GrupoGasto } from './grupos';
import type { Fatura } from './queries';
import type { ItemConta } from './contas';
import { totalAPagar } from './faturas';

export function topGrupos(grupos: GrupoGasto[], n = 3): { nome: string; total: number; pct: number }[] {
  const soma = grupos.reduce((s, g) => s + g.total, 0);
  return [...grupos].sort((a, b) => b.total - a.total).slice(0, n)
    .map((g) => ({ nome: g.nome, total: g.total, pct: soma > 0 ? Math.round((g.total / soma) * 100) : 0 }));
}

/** Cartão com mais limite usado + quanto ainda sai das contas pelas faturas fechadas (N4: não o limite usado). */
export function cartaoDestaque(faturas: Fatura[]): { banco: string; responsavel: string; usoPct: number; aPagar: number } | null {
  if (faturas.length === 0) return null;
  const uso = (f: Fatura) => (f.limite > 0 ? Math.round(((f.limite - f.disponivel) / f.limite) * 100) : 0);
  const top = [...faturas].sort((a, b) => uso(b) - uso(a))[0];
  return { banco: top.banco, responsavel: top.responsavel, usoPct: uso(top), aPagar: totalAPagar(faturas.flatMap((f) => (f.ultima ? [f.ultima] : []))) };
}

/**
 * Textos do bloco Cartões (15/10): o valor é o que há a pagar das faturas fechadas; o limite usado é outra linha.
 * Antes saía "a pagar · Nubank 92% do limite" em vermelho com R$ 0,00 — parecia fatura em aberto.
 */
export function textosCartoes(c: { banco: string; responsavel: string; usoPct: number; aPagar: number } | null): {
  detalhe: string; tom: 'bom' | 'atencao' | 'neutro'; limite: { texto: string; tom: 'atencao' | 'neutro' } | null;
} {
  if (!c) return { detalhe: 'sem cartão', tom: 'neutro', limite: null };
  return {
    detalhe: c.aPagar > 0 ? 'a pagar (faturas fechadas)' : 'nada a pagar agora',
    tom: c.aPagar > 0 ? 'atencao' : 'bom',
    limite: { texto: `limite do ${c.banco} (${c.responsavel}): ${c.usoPct}% usado`, tom: c.usoPct >= 80 ? 'atencao' : 'neutro' },
  };
}

export function contasResumo(itens: ItemConta[]): { pagas: number; total: number; falta: number } | null {
  if (itens.length === 0) return null;
  const falta = itens.filter((i) => i.status !== 'pago').reduce((s, i) => s + i.previsto, 0);
  return { pagas: itens.filter((i) => i.status === 'pago').length, total: itens.length, falta: Math.round(falta * 100) / 100 };
}
