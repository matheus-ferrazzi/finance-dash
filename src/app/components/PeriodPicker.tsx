'use client';

import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mesLongo } from '@/lib/format';

function shift(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function mesAtualBR(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

const PRESETS = [
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Mês' },
] as const;

export function PeriodPicker() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();

  const atual = mesAtualBR();
  const p = sp.get('p');
  const kind = p === '7d' || p === '15d' || p === '30d' ? p : 'mes';
  const rawMes = sp.get('mes');
  const mes = rawMes && /^\d{4}-\d{2}$/.test(rawMes) ? rawMes : atual;

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    router.push(path + (s ? `?${s}` : ''));
  }
  const selectKind = (k: string) => (k === 'mes' ? setParams({ p: null }) : setParams({ p: k, mes: null }));
  const goMonth = (novo: string) => setParams({ p: null, mes: novo === atual ? null : novo });
  const podeAvancar = shift(mes, 1) <= atual;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="inline-flex rounded-xl border border-border bg-surface p-1">
        {PRESETS.map((pr) => (
          <button
            key={pr.key}
            onClick={() => selectKind(pr.key)}
            className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs sm:text-sm transition-colors ${
              kind === pr.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
            }`}
          >
            {pr.label}
          </button>
        ))}
      </div>

      {kind === 'mes' && (
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
          <button onClick={() => goMonth(shift(mes, -1))} className="grid h-7 w-7 place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-3" aria-label="Mês anterior">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[6.5rem] text-center text-sm font-medium capitalize">{mesLongo(mes)}</span>
          <button onClick={() => podeAvancar && goMonth(shift(mes, 1))} disabled={!podeAvancar} className="grid h-7 w-7 place-items-center rounded-lg text-muted enabled:hover:text-text enabled:hover:bg-surface-3 disabled:opacity-30" aria-label="Próximo mês">
            <ChevronRight size={16} />
          </button>
          {mes !== atual && (
            <button onClick={() => goMonth(atual)} className="ml-0.5 rounded-lg px-1.5 py-1 text-xs text-accent hover:bg-accent/10">hoje</button>
          )}
        </div>
      )}
    </div>
  );
}
