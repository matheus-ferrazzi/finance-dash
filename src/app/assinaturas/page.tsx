import { getAssinaturas, Resp } from '@/lib/queries';
import { brl, traduzCategoria } from '@/lib/format';
import { PageTitle, catIcon } from '../components/ui';
import { Repeat } from 'lucide-react';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

function titulo(s: string): string {
  return s.split(' ').map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

export default async function Assinaturas({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const lista = await getAssinaturas(resp);
  const totalMes = lista.reduce((s, a) => s + a.valorMedio, 0);

  return (
    <div>
      <PageTitle
        title="Assinaturas & recorrentes"
        subtitle="Cobranças que se repetem em 3+ meses — assinaturas, mensalidades e contas fixas."
      />

      <div className="card mb-4">
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <Repeat size={13} className="text-faint" /> Estimativa mensal em recorrentes
        </div>
        <div className="mt-1.5 text-2xl font-semibold tnum money text-despesa">{brl(totalMes)}</div>
        <div className="mt-0.5 text-xs text-faint">{lista.length} cobrança(s) recorrente(s) · valor médio por mês</div>
      </div>

      {lista.length === 0 ? (
        <div className="card"><p className="text-sm text-muted">Nenhuma cobrança recorrente identificada ainda (precisa aparecer em 3+ meses).</p></div>
      ) : (
        <div className="card divide-y divide-border/60">
          {lista.map((a, k) => {
            const { Icon, color } = catIcon(a.categoria);
            return (
              <div key={k} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{titulo(a.nome)}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                    <span>{traduzCategoria(a.categoria)}</span>
                    <span>·</span>
                    <span>{a.banco}</span>
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">{a.meses}m</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum money text-sm font-medium">{brl(a.valorMedio)}</div>
                  <div className="text-[10px] text-faint">/mês</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 px-1 text-xs text-faint">
        Heurística: agrupa lançamentos por descrição (ignorando números/parcelas) que aparecem em pelo menos 3 meses.
        Pode incluir contas fixas como aluguel e energia.
      </p>
    </div>
  );
}
