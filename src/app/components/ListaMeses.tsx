import Link from 'next/link';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { LinhaLista } from '@/lib/mesAMes';

type Resp = 'casal' | 'Matheus' | 'Ariane';
const VISIVEIS = 12;

/**
 * Saldo em conta no fim de cada mês (F2b): passado ✓ com real × previsto, o mês atual destacado e o
 * futuro descendo. Cada linha abre o detalhe do mês.
 */
export function ListaMeses({ linhas, resp, mostrarTodos }: { linhas: LinhaLista[]; resp: Resp; mostrarTodos: boolean }) {
  const futuros = linhas.filter((l) => l.tipo === 'futuro');
  const visiveis = [...linhas.filter((l) => l.tipo !== 'futuro'), ...(mostrarTodos ? futuros : futuros.slice(0, VISIVEIS))];
  const cor = (v: number) => (v >= 0 ? 'text-accent' : 'text-despesa');
  const todos = linkPara('previsao', { resp }) + (resp === 'casal' ? '?' : '&') + 'todos=1';
  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex justify-between px-3.5 pt-3 pb-1 text-[11px] text-muted">
        <span>Mês</span><span>Saldo em conta no fim</span>
      </div>
      <div className="divide-y divide-border/60">
        {visiveis.map((l) => (
          // '' como mês atual: o link sempre leva o mês, então o mês atual também abre o detalhe
          <Link key={l.mes} href={linkPara('previsao', { resp, mes: l.mes }, '')}
            className={`flex min-h-[44px] items-center justify-between gap-3 px-3.5 py-2 text-sm hover:bg-surface-2/40 ${l.tipo === 'atual' ? 'bg-surface-2/60' : ''}`}>
            <span className="min-w-0">
              <span className={l.tipo === 'passado' ? 'text-muted' : 'text-text'}>
                {mesLabel(l.mes)}{l.tipo === 'passado' ? ' ✓' : l.tipo === 'atual' ? ' • em andamento' : ''}
              </span>
              <span className="block text-[11px] text-faint">
                {l.tipo === 'passado' && l.previsto !== null
                  ? <>sobrou <span className="tnum money">{brl(l.sobra)}</span> · previsto <span className="tnum money">{brl(l.previsto)}</span></>
                  : l.tipo === 'atual'
                    // a projeção do mês em andamento só tem o que ainda falta acontecer
                    ? <>daqui até o fim do mês <span className="tnum money">{brl(l.sobra)}</span></>
                    : <>sobra do mês <span className="tnum money">{brl(l.sobra)}</span></>}
                {l.piorCaso !== null && l.piorCaso !== l.saldoFim && <> · pior caso <span className="tnum money">{brl(l.piorCaso)}</span></>}
              </span>
            </span>
            <span className={`shrink-0 tnum money font-medium ${cor(l.saldoFim)}`}>{brl(l.saldoFim)}</span>
          </Link>
        ))}
      </div>
      {!mostrarTodos && futuros.length > VISIVEIS && (
        <Link href={todos} className="block border-t border-border/60 px-3.5 py-2.5 text-center text-xs text-accent">ver até 24 meses</Link>
      )}
    </div>
  );
}
