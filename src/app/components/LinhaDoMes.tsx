import Link from 'next/link';
import { brl } from '@/lib/format';
import type { SerieMes } from '@/lib/linhaDoMes';

const W = 320, H = 110, PAD = 8;

/** Saldo do mês: passado cheio, futuro tracejado, linha do zero, fechamento em destaque. */
export function LinhaDoMes({ serie, titulo, href }: { serie: SerieMes; titulo: string; href: string }) {
  const ps = serie.pontos;
  const dias = ps.length ? ps.at(-1)!.dia : 1;
  const vals = [...ps.map((p) => p.saldo), 0];
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const x = (dia: number) => PAD + ((dia - 1) / Math.max(1, dias - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / amp) * (H - 2 * PAD);
  const linha = (pts: typeof ps) => pts.map((p) => `${x(p.dia).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' ');
  const passado = ps.filter((p) => !p.futuro);
  const futuro = ps.filter((p) => p.futuro);
  const hoje = passado.at(-1);
  const cor = serie.fechamento >= 0 ? 'text-accent' : 'text-despesa';

  return (
    <Link href={href} className="card mb-3 block p-3.5 transition-colors hover:bg-surface-2/40">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{titulo}</span>
        <span className={`text-xl font-semibold tnum money ${cor}`}>{brl(serie.fechamento)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={`${titulo} ${brl(serie.fechamento)}`}>
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="3 3" />
        <polyline points={linha(passado)} fill="none" className="stroke-accent" strokeWidth={2.5} />
        {futuro.length > 0 && hoje && (
          <polyline points={linha([hoje, ...futuro])} fill="none" className="stroke-muted" strokeWidth={2} strokeDasharray="5 4" />
        )}
        {hoje && !serie.passado && <circle cx={x(hoje.dia)} cy={y(hoje.saldo)} r={4} className="fill-accent" />}
        {ps.length > 0 && <circle cx={x(ps.at(-1)!.dia)} cy={y(serie.fechamento)} r={4} className={serie.fechamento >= 0 ? 'fill-accent' : 'fill-despesa'} />}
      </svg>
      {hoje && !serie.passado && (
        <div className="mt-1 flex justify-between text-[11px] text-muted">
          <span>hoje <span className="money">{brl(hoje.saldo)}</span></span><span>dia {dias}</span>
        </div>
      )}
    </Link>
  );
}
