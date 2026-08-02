'use client';

import { RefreshCw, Info } from 'lucide-react';

interface Conn { banco: string; responsavel: string; horas: number; }
interface Status { oldestH: number; conns: Conn[] }

function fmtH(h: number): string {
  if (h < 1) return `há ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `há ${Math.round(h)}h`;
  return `há ${Math.round(h / 24)} dias`;
}
function toneCls(h: number): string {
  return h < 24 ? 'text-accent' : h < 48 ? 'text-warn' : 'text-despesa';
}

export function SyncBadge({ status }: { status: Status }) {
  if (!status.conns.length) return null;
  const h = status.oldestH;
  const border = h < 24 ? 'border-accent/30' : h < 48 ? 'border-warn/30' : 'border-despesa/30';

  return (
    <div className="relative group">
      <div className={`inline-flex items-center gap-1.5 rounded-xl border ${border} bg-surface px-2.5 py-1.5 text-xs ${toneCls(h)}`}>
        <RefreshCw size={13} />
        <span className="hidden sm:inline">sincronizado</span> {fmtH(h)}
        <Info size={12} className="opacity-50" />
      </div>

      <div className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-opacity absolute right-0 top-full mt-2 z-30 w-72 rounded-xl border border-border bg-surface-2 p-3 text-xs shadow-card">
        <p className="text-muted mb-2 leading-relaxed">
          Os dados vêm da sincronização do banco pela Pluggy (~1x por dia) — <b className="text-text">não é tempo real</b>. Pode haver até ~1 dia de atraso (ou mais, se algum banco demorar a sincronizar).
        </p>
        <div className="space-y-1 border-t border-border pt-2">
          {status.conns.map((c) => (
            <div key={c.banco + c.responsavel} className="flex items-center justify-between">
              <span className="text-muted">{c.banco} · {c.responsavel}</span>
              <span className={toneCls(c.horas)}>{fmtH(c.horas)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
