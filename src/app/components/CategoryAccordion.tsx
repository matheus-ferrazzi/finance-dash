'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { brl, dataBR, traduzCategoria } from '@/lib/format';
import { catIcon, respBadge } from './ui';

export interface CatGroup {
  categoria: string;
  total: number;
  n: number;
  items: { id: string; data: string; valor: number; descricao: string; banco: string; responsavel: string }[];
}

export function CategoryAccordion({ grupos }: { grupos: CatGroup[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const maxTotal = Math.max(...grupos.map((g) => g.total), 1);

  if (grupos.length === 0) return <p className="text-sm text-muted">Sem despesas neste mês.</p>;

  return (
    <div className="space-y-1.5">
      {grupos.map((g) => {
        const { Icon, color } = catIcon(g.categoria);
        const open = aberto === g.categoria;
        return (
          <div key={g.categoria} className="card-2 overflow-hidden">
            <button
              onClick={() => setAberto(open ? null : g.categoria)}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface-3/40 transition-colors"
            >
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{traduzCategoria(g.categoria)}</span>
                  <span className="tnum text-sm font-semibold text-despesa">{brl(g.total)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-despesa/70" style={{ width: `${(g.total / maxTotal) * 100}%` }} />
                  </div>
                  <span className="shrink-0 text-[11px] text-faint">{g.n} lanç.</span>
                </div>
              </div>
              <ChevronDown size={16} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="fadein border-t border-border divide-y divide-border/60">
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{it.descricao || '—'}</div>
                      <div className="text-xs text-faint">{dataBR(it.data)} · {it.banco}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {respBadge(it.responsavel)}
                      <span className="tnum text-sm">{brl(it.valor)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
