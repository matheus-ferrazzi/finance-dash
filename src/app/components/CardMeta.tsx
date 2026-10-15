import Link from 'next/link';
import { brl } from '@/lib/format';
import type { EstadoMeta } from '@/lib/metaMes';

/** 15/10: meta do débito × gasto do mês × quanto ainda pode — a meta da Previsão vira algo para acompanhar. */
export function CardMeta({ estado: e, href }: { estado: EstadoMeta; href: string }) {
  const estourou = e.situacao === 'estourou';
  const barra = estourou ? 'bg-despesa' : e.pct >= 80 ? 'bg-warn' : 'bg-accent';
  return (
    <Link href={href} className="card mb-3 block p-3.5 transition-colors hover:bg-surface-2/40">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-xs text-muted">🎯 Meta do débito no mês</span>
        <span className="text-sm">
          <b className="tnum money">{brl(e.gasto)}</b> <span className="text-muted">de <span className="money">{brl(e.meta)}</span> ({e.pct}%)</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${barra}`} style={{ width: `${Math.min(100, e.pct)}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-muted">
        {estourou
          ? <span className="text-despesa">Passaram da meta em <span className="money">{brl(e.gasto - e.meta)}</span></span>
          : <>Ainda pode <b className="money text-text">{brl(e.falta)}</b> (<span className="money">{brl(e.porDia)}</span>/dia)</>}
        {!estourou && e.acimaNoRitmo > 0 && (
          <span className="text-warn"> · no ritmo atual fecha em <span className="money">{brl(e.previstoFim)}</span> ⚠️</span>
        )}
      </div>
    </Link>
  );
}
