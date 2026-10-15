'use client';

import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { mesLabel } from '@/lib/format';
import { mesNoLimite, podeIrParaMesSeguinte, temSeletorDeMes } from '@/lib/links';

function shift(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function mesAtualBR(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

export function PeriodPicker() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();

  const atual = mesAtualBR();
  const rawMes = sp.get('mes');
  // o seletor mostra o mesmo mês que a tela usa (a home não passa do mês atual, por exemplo)
  const mes = mesNoLimite(rawMes, path, atual);

  function setParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    for (const [k, v] of Object.entries(updates)) {
      if (v == null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    router.push(path + (s ? `?${s}` : ''));
  }
  const goMonth = (novo: string) => setParams({ p: null, mes: novo === atual ? null : novo });
  const podeAvancar = shift(mes, 1) <= (podeIrParaMesSeguinte(path) ? shift(atual, 1) : atual);
  if (!temSeletorDeMes(path)) return null;

  // Onda 5: os atalhos 7/15/30 dias moram na própria tela Gastos; aqui é só o mês, curto (a coluna é sempre da largura do celular)
  return (
    <div className="flex items-center">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
        <button onClick={() => goMonth(shift(mes, -1))} className="grid h-7 w-6 place-items-center rounded-lg text-muted hover:text-text hover:bg-surface-3" aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </button>
        {mes !== atual ? (
          // fora do mês atual, o próprio mês é o atalho de volta
          <button onClick={() => goMonth(atual)} aria-label="Voltar para o mês atual"
            className="min-w-[3.2rem] text-center text-sm font-medium text-warn">{mesLabel(mes)}</button>
        ) : (
          <span className="min-w-[3.2rem] text-center text-sm font-medium">{mesLabel(mes)}</span>
        )}
        <button onClick={() => podeAvancar && goMonth(shift(mes, 1))} disabled={!podeAvancar} className="grid h-7 w-6 place-items-center rounded-lg text-muted enabled:hover:text-text enabled:hover:bg-surface-3 disabled:opacity-30" aria-label="Próximo mês">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
