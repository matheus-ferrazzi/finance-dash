import Link from 'next/link';
import { brl } from '@/lib/format';
import type { Vencimento } from '@/lib/faturas';
import { linkPara } from '@/lib/links';
import { respBadge } from './ui';

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Onda 5 (Faturas): o que vai sair dos cartões, por data; o toque abre as compras daquela fatura. */
export function LinhaVencimentos({ itens, resp }: { itens: Vencimento[]; resp: 'casal' | 'Matheus' | 'Ariane' }) {
  if (!itens.length) return <div className="card mb-3 p-3.5 text-sm text-muted">Nenhuma fatura por vir.</div>;
  return (
    <div className="card mb-3 divide-y divide-border/60 px-3.5 py-1">
      {itens.map((v) => (
        <Link key={`${v.banco}-${v.responsavel}-${v.ciclo}`}
          href={linkPara('faturas', { resp, cartao: `${v.banco}:${v.responsavel}`, ciclo: v.ciclo })}
          className="flex min-h-[48px] items-center justify-between gap-2 py-2">
          <span className="min-w-0">
            <span className="text-sm">{v.vence ? ddmm(v.vence) : '—'} · {v.banco}</span>{resp === 'casal' && <> {respBadge(v.responsavel)}</>}
            <span className={`block text-[11px] ${v.situacao === 'atrasada' ? 'text-despesa' : 'text-faint'}`}>
              {v.situacao === 'atrasada' ? 'em atraso' : v.situacao === 'fechada' ? 'fechada · a vencer' : `fecha ${ddmm(v.fecha!)} · parcial`}
            </span>
          </span>
          <span className={`shrink-0 text-sm tnum money ${v.situacao === 'atrasada' ? 'text-despesa' : ''}`}>{brl(v.valor)}</span>
        </Link>
      ))}
    </div>
  );
}
