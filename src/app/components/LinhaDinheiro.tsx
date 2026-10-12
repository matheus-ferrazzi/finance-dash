'use client';

// E3: gasto em dinheiro vivo na lista de Gastos. Não é lançamento do banco: em vez de "Mudar categoria", apagar.
import { brl, dataBR } from '@/lib/format';
import { respBadge } from './ui';

export interface ItemDinheiro { id: string; data: string; valor: number; descricao: string; banco: string; responsavel: string; dinheiroId: number }

export function LinhaDinheiro({ it }: { it: ItemDinheiro }) {
  const apagar = async () => {
    if (!window.confirm('Apagar este gasto em dinheiro?')) return;
    const r = await fetch(`/api/dinheiro/${it.dinheiroId}`, { method: 'DELETE' });
    if (r.ok || r.status === 404) window.location.reload();
  };
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm">{it.descricao || '—'}</span>
        <span className="block text-xs text-faint">{dataBR(it.data)} · {it.banco}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {respBadge(it.responsavel)}
        <span className="tnum money text-sm">{brl(it.valor)}</span>
        <button type="button" onClick={apagar} className="text-xs text-faint hover:text-down" aria-label="Apagar gasto em dinheiro">apagar</button>
      </span>
    </div>
  );
}
