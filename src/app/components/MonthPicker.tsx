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
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

export function MonthPicker() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();

  const atual = mesAtualBR();
  const raw = sp.get('mes');
  const mes = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : atual;

  function go(novoMes: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (novoMes === atual) params.delete('mes');
    else params.set('mes', novoMes);
    const s = params.toString();
    router.push(path + (s ? `?${s}` : ''));
  }

  const isAtual = mes === atual;
  const proximo = shift(mes, 1);
  const podeAvancar = proximo <= atual;

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
      <button
        onClick={() => go(shift(mes, -1))}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-3"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={17} />
      </button>
      <span className="min-w-[7.5rem] text-center text-sm font-medium capitalize">{mesLongo(mes)}</span>
      <button
        onClick={() => podeAvancar && go(proximo)}
        disabled={!podeAvancar}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted enabled:hover:text-text enabled:hover:bg-surface-3 disabled:opacity-30"
        aria-label="Próximo mês"
      >
        <ChevronRight size={17} />
      </button>
      {!isAtual && (
        <button onClick={() => go(atual)} className="ml-1 rounded-lg px-2 py-1 text-xs text-accent hover:bg-accent/10">
          hoje
        </button>
      )}
    </div>
  );
}
