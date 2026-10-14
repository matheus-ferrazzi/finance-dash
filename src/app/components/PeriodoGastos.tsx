'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const PRESETS = [
  { key: '7d', label: '7 dias' },
  { key: '15d', label: '15 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Mês' },
] as const;

/** Onda 5: os atalhos de período da Gastos (antes no cabeçalho de todas as telas, só ela usava). */
export function PeriodoGastos() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const p = sp.get('p');
  const kind = p === '7d' || p === '15d' || p === '30d' ? p : 'mes';
  function escolher(k: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    params.delete('p');
    if (k !== 'mes') { params.set('p', k); params.delete('mes'); }
    const s = params.toString();
    router.push(path + (s ? `?${s}` : ''));
  }
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
      {PRESETS.map((pr) => (
        <button key={pr.key} onClick={() => escolher(pr.key)} aria-pressed={kind === pr.key}
          className={`rounded-md px-1.5 py-1 text-[11px] transition-colors ${kind === pr.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'}`}>
          {pr.label}
        </button>
      ))}
    </div>
  );
}
