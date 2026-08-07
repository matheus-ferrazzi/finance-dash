'use client';

import { useState } from 'react';
import { ChevronDown, Info, CalendarClock } from 'lucide-react';
import { brl, dataBR, diasAte, traduzCategoria } from '@/lib/format';
import { respBadge, Progress, catIcon } from './ui';

export interface FaturaItem {
  id: string; data: string; valor: number; descricao: string; categoria: string;
}
export interface FaturaView {
  id: string; banco: string; responsavel: string; valor: number;
  limite: number; disponivel: number; vencimento: string | null; fechamento: string | null;
  cicloLabel: string; soma: number; items: FaturaItem[];
  proxSoma: number; proxLabel: string;
}

export function FaturaCard({ f }: { f: FaturaView }) {
  const [open, setOpen] = useState(false);
  const usado = f.limite > 0 ? f.limite - f.disponivel : 0;
  const d = diasAte(f.vencimento);

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{f.banco}</span>{respBadge(f.responsavel)}
        </div>
        <span className="text-xs text-muted">
          {f.vencimento ? `vence ${dataBR(f.vencimento)}` : 'sem venc.'}{d != null && d >= 0 ? ` · ${d}d` : ''}
        </span>
      </div>

      <div className="mt-3 text-2xl font-semibold tnum money">{brl(f.valor)}</div>
      <div className="text-xs text-muted">fatura atual</div>

      {f.proxSoma > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock size={13} className="text-faint" />
            <span>Próxima fatura (parcial)</span>
          </div>
          <span className="tnum money text-sm font-medium">{brl(f.proxSoma)}</span>
        </div>
      )}

      {f.limite > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted mb-1.5">
            <span>Limite usado</span><span className="tnum">{brl(usado)} / {brl(f.limite)}</span>
          </div>
          <Progress value={usado} teto={f.limite} />
          <div className="mt-1 text-xs text-faint">disponível {brl(f.disponivel)}</div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted hover:text-text hover:bg-surface-3 transition-colors"
      >
        <span>Ver compras do ciclo atual{f.items.length ? ` (${f.items.length})` : ''}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fadein mt-2">
          <div className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-[11px] text-warn/90 leading-relaxed">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Compras de crédito registradas no ciclo{f.cicloLabel ? ` (${f.cicloLabel})` : ''}. A soma
              (<b>{brl(f.soma)}</b>) pode diferir do valor da fatura por causa de parcelas e do prazo de sincronização do banco.
            </span>
          </div>

          <div className="mt-1 divide-y divide-border/60">
            {f.items.length === 0 && <p className="py-3 text-sm text-muted">Nenhuma compra de crédito registrada neste ciclo.</p>}
            {f.items.map((it) => {
              const { Icon, color } = catIcon(it.categoria);
              return (
                <div key={it.id} className="flex items-center gap-3 py-2.5">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.descricao || traduzCategoria(it.categoria)}</div>
                    <div className="text-xs text-faint">{dataBR(it.data)} · {traduzCategoria(it.categoria)}</div>
                  </div>
                  <span className="tnum text-sm shrink-0">{brl(it.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
