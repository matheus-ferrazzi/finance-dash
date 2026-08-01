import { getFaturas, Resp } from '@/lib/queries';
import { brl, dataBR, diasAte } from '@/lib/format';
import { PageTitle, SectionTitle, Progress, respBadge } from '../components/ui';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Faturas({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const faturas = await getFaturas(resp);
  const totalAberto = faturas.reduce((s, f) => s + f.valor, 0);

  return (
    <div>
      <PageTitle title="Faturas" subtitle="Cartões de crédito — fatura atual, vencimento e limite." />

      <div className="card mb-4">
        <div className="text-xs text-muted">Total em faturas abertas</div>
        <div className="mt-1.5 text-2xl font-semibold tnum text-despesa">{brl(totalAberto)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {faturas.map((f) => {
          const usado = f.limite > 0 ? f.limite - f.disponivel : 0;
          const d = diasAte(f.vencimento);
          return (
            <div key={f.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.banco}</span>{respBadge(f.responsavel)}
                </div>
                <span className="text-xs text-muted">
                  {f.vencimento ? `vence ${dataBR(f.vencimento)}` : 'sem venc.'}{d != null && d >= 0 ? ` · ${d}d` : ''}
                </span>
              </div>
              <div className="mt-3 text-2xl font-semibold tnum">{brl(f.valor)}</div>
              <div className="text-xs text-muted">fatura atual</div>
              {f.limite > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted mb-1.5">
                    <span>Limite usado</span><span className="tnum">{brl(usado)} / {brl(f.limite)}</span>
                  </div>
                  <Progress value={usado} teto={f.limite} />
                  <div className="mt-1 text-xs text-faint">disponível {brl(f.disponivel)}</div>
                </div>
              )}
              {f.fechamento && <div className="mt-3 text-xs text-faint">fecha em {dataBR(f.fechamento)}</div>}
            </div>
          );
        })}
      </div>
      {faturas.length === 0 && <div className="card"><p className="text-sm text-muted">Nenhuma fatura cadastrada.</p></div>}
    </div>
  );
}
