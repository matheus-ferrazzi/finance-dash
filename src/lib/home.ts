// O que cada quadrado da home mostra. "—" na tela quando a função devolve null/vazio.
import type { GrupoGasto } from './grupos';
import type { Fatura } from './queries';
import type { ItemConta } from './contas';

export function topGrupos(grupos: GrupoGasto[], n = 3): { nome: string; total: number; pct: number }[] {
  const soma = grupos.reduce((s, g) => s + g.total, 0);
  return [...grupos].sort((a, b) => b.total - a.total).slice(0, n)
    .map((g) => ({ nome: g.nome, total: g.total, pct: soma > 0 ? Math.round((g.total / soma) * 100) : 0 }));
}

export function cartaoDestaque(faturas: Fatura[]): { banco: string; usoPct: number; totalAberto: number } | null {
  if (faturas.length === 0) return null;
  const uso = (f: Fatura) => (f.limite > 0 ? Math.round(((f.limite - f.disponivel) / f.limite) * 100) : 0);
  const top = [...faturas].sort((a, b) => uso(b) - uso(a))[0];
  return { banco: top.banco, usoPct: uso(top), totalAberto: faturas.reduce((s, f) => s + f.valor, 0) };
}

export function contasResumo(itens: ItemConta[]): { pagas: number; total: number; falta: number } | null {
  if (itens.length === 0) return null;
  const falta = itens.filter((i) => i.status !== 'pago').reduce((s, i) => s + i.previsto, 0);
  return { pagas: itens.filter((i) => i.status === 'pago').length, total: itens.length, falta: Math.round(falta * 100) / 100 };
}
