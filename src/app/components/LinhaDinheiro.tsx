'use client';

// E3: gasto em dinheiro vivo na lista de Gastos. Não é lançamento do banco: em vez de "Mudar categoria", apagar.
import { useState } from 'react';
import { brl, dataBR } from '@/lib/format';
import { respBadge } from './ui';

export interface ItemDinheiro { id: string; data: string; valor: number; descricao: string; banco: string; responsavel: string; dinheiroId: number }

/** E3-M3: o que fazer com a resposta do DELETE (antes, erro sumia em silêncio). status 0 = sem conexão. */
export function resultadoApagar(status: number): { recarregar: true } | { recarregar: false; erro: string } {
  if (status === 0) return { recarregar: false, erro: 'Sem conexão. Tente de novo.' };
  // 404: já tinha sido apagado (outra tela, o bot) — a lista recarregada mostra o estado certo
  if ((status >= 200 && status < 300) || status === 404) return { recarregar: true };
  return { recarregar: false, erro: 'Não consegui apagar. Tente de novo.' };
}

export function LinhaDinheiro({ it }: { it: ItemDinheiro }) {
  const [erro, setErro] = useState<string | null>(null);
  const apagar = async () => {
    if (!window.confirm('Apagar este gasto em dinheiro?')) return;
    const status = await fetch(`/api/dinheiro/${it.dinheiroId}`, { method: 'DELETE' }).then((r) => r.status, () => 0);
    const r = resultadoApagar(status);
    if (r.recarregar) window.location.reload();
    else setErro(r.erro);
  };
  return (
    <div className="px-3.5 py-2.5">
      <div className="flex min-h-[44px] items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm">{it.descricao || '—'}</span>
          <span className="block text-xs text-faint">{dataBR(it.data)} · {it.banco}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {respBadge(it.responsavel)}
          <span className="tnum money text-sm">{brl(it.valor)}</span>
          <button type="button" onClick={apagar} className="min-h-[44px] min-w-[44px] px-2 text-xs text-faint hover:text-down" aria-label="Apagar gasto em dinheiro">apagar</button>
        </span>
      </div>
      {erro && <p role="alert" className="text-xs text-down">{erro}</p>}
    </div>
  );
}
