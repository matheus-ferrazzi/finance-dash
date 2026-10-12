import Link from 'next/link';
import { linkPara } from '@/lib/links';
import type { Trilha } from '@/lib/trilha';
import { TextoComValores } from './TextoComValores';

const COR = { cumprida: 'bg-accent', atual: 'bg-warn', depois: 'bg-surface-3' } as const;

/** Topo da home (F3): em que fase o casal está, quando sai dela e o próximo passo. */
export function FaixaTrilha({ trilha }: { trilha: Trilha }) {
  const f = trilha.fases[trilha.atual - 1];
  return (
    <Link href={linkPara('trilha')} className="card mb-3 block hover:bg-surface-2/40">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{`Trilha do casal · fase ${trilha.atual} de 4`}</span><span>›</span>
      </div>
      <div className="my-2 flex gap-1">
        {trilha.fases.map((x) => <span key={x.n} data-fase={x.status} className={`h-1.5 flex-1 rounded ${COR[x.status]}`} />)}
      </div>
      <div className="text-sm">
        <b>{f.titulo}</b>{f.quando && <span className="text-muted">{` — ${f.quando}`}</span>}
      </div>
      <div className="mt-0.5 text-[11px] text-muted"><TextoComValores texto={f.proximoPasso} /></div>
    </Link>
  );
}
