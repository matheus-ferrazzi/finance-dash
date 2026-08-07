import { Suspense } from 'react';
import { getBusca, Resp } from '@/lib/queries';
import { brl, dataBR, traduzCategoria } from '@/lib/format';
import { PageTitle, respBadge, catIcon } from '../components/ui';
import { SearchBox } from '../components/SearchBox';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Buscar({ searchParams }: { searchParams: { resp?: string; q?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const q = (searchParams.q ?? '').trim();
  const res = q.length >= 2 ? await getBusca(resp, q) : [];

  const totDesp = res.filter((l) => l.classe === 'despesa').reduce((s, l) => s + l.valor, 0);
  const totRec = res.filter((l) => l.classe === 'receita').reduce((s, l) => s + l.valor, 0);

  return (
    <div>
      <PageTitle title="Buscar lançamentos" subtitle="Procure qualquer transação pela descrição." />

      <div className="mb-4">
        <Suspense fallback={<div className="h-11 rounded-xl border border-border bg-surface" />}>
          <SearchBox initial={q} />
        </Suspense>
      </div>

      {q.length < 2 ? (
        <div className="card"><p className="text-sm text-muted">Digite ao menos 2 letras pra buscar.</p></div>
      ) : res.length === 0 ? (
        <div className="card"><p className="text-sm text-muted">Nada encontrado para “{q}”.</p></div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-muted">{res.length} resultado(s)</span>
            {totDesp > 0 && <span className="rounded-lg bg-despesa/10 px-2.5 py-1 text-despesa">saídas <b className="tnum money">{brl(totDesp)}</b></span>}
            {totRec > 0 && <span className="rounded-lg bg-accent/10 px-2.5 py-1 text-accent">entradas <b className="tnum money">{brl(totRec)}</b></span>}
          </div>

          <div className="card divide-y divide-border/60">
            {res.map((l) => {
              const { Icon, color } = catIcon(l.categoria);
              return (
                <div key={l.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{l.descricao || traduzCategoria(l.categoria)}</div>
                    <div className="text-xs text-faint">{dataBR(l.data)} · {traduzCategoria(l.categoria)} · {l.banco}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {respBadge(l.responsavel)}
                    <span className={`tnum money font-medium ${l.classe === 'receita' ? 'text-accent' : 'text-despesa'}`}>
                      {l.classe === 'receita' ? '+' : '−'}{brl(l.valor)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
