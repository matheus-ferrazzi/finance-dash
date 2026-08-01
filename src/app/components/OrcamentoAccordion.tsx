'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { brl, dataBR, traduzCategoria } from '@/lib/format';
import { respBadge } from './ui';

export interface OrcGroup {
  item: string;
  emoji: string;
  teto: number;
  gasto: number;
  items: { id: string; data: string; valor: number; descricao: string; categoria: string; banco: string; responsavel: string }[];
}

export function OrcamentoAccordion({ grupos }: { grupos: OrcGroup[] }) {
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {grupos.map((g) => {
        const open = aberto === g.item;
        const p = g.teto > 0 ? Math.min((g.gasto / g.teto) * 100, 100) : 0;
        const pctReal = g.teto > 0 ? Math.round((g.gasto / g.teto) * 100) : 0;
        const over = g.gasto > g.teto;
        const near = !over && p >= 80;
        const barColor = over ? 'bg-despesa' : near ? 'bg-warn' : 'bg-accent';
        const restante = g.teto - g.gasto;
        return (
          <div key={g.item} className="card-2 overflow-hidden">
            <button
              onClick={() => setAberto(open ? null : g.item)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-3/40 transition-colors"
            >
              <span className="text-lg leading-none">{g.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{g.item}</span>
                  <span className="tnum text-sm">
                    <span className={over ? 'text-despesa font-semibold' : ''}>{brl(g.gasto)}</span>
                    <span className="text-faint"> / {brl(g.teto)}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${p}%` }} />
                  </div>
                  <span className={`shrink-0 text-[11px] tnum ${over ? 'text-despesa' : near ? 'text-warn' : 'text-faint'}`}>{pctReal}%</span>
                </div>
                <div className="mt-1 text-[11px] text-faint">
                  {over ? `estourou ${brl(-restante)}` : `resta ${brl(restante)}`} · {g.items.length} lanç.
                </div>
              </div>
              <ChevronDown size={16} className={`shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
              <div className="fadein border-t border-border divide-y divide-border/60">
                {g.items.length === 0 && <div className="px-4 py-3 text-sm text-muted">Nada consumido ainda neste mês.</div>}
                {g.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{it.descricao || traduzCategoria(it.categoria)}</div>
                      <div className="text-xs text-faint">{dataBR(it.data)} · {traduzCategoria(it.categoria)} · {it.banco}</div>
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
