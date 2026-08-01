import { getInvestimentos, getAporteMensal, getPatrimonioHistorico, Resp } from '@/lib/queries';
import { brl, traduzInvest } from '@/lib/format';
import { PageTitle, SectionTitle, respBadge, KpiCard } from '../components/ui';
import { AportesChart, PatrimonioChart } from '../components/charts';
import { Wallet, PiggyBank, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Investimentos({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [inv, aportes, patrimonio] = await Promise.all([
    getInvestimentos(resp), getAporteMensal(resp, 12), getPatrimonioHistorico(resp),
  ]);

  const investido = inv.reduce((s, i) => s + i.investido, 0);
  const atual = inv.reduce((s, i) => s + i.atual, 0);
  const lucro = inv.reduce((s, i) => s + i.lucro, 0);
  const rentPct = investido > 0 ? Math.round((lucro / investido) * 1000) / 10 : 0;

  return (
    <div>
      <PageTitle title="Investimentos" subtitle="Posição atual da carteira — lucro = valor atual menos aportado." />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Valor atual" value={atual} icon={Wallet} />
        <KpiCard label="Aportado" value={investido} hint="custo" icon={PiggyBank} />
        <KpiCard label="Lucro/Prejuízo" value={lucro} tone={lucro >= 0 ? 'up' : 'down'} icon={TrendingUp} />
        <div className="card">
          <div className="text-xs text-muted">Rentabilidade</div>
          <div className={`mt-2 text-xl md:text-2xl font-semibold tnum ${rentPct >= 0 ? 'text-accent' : 'text-despesa'}`}>
            {rentPct >= 0 ? '+' : ''}{rentPct}%
          </div>
          <div className="mt-1 text-xs text-muted">sobre o aportado</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <SectionTitle>Evolução do patrimônio</SectionTitle>
          {patrimonio.length >= 2 ? (
            <PatrimonioChart data={patrimonio} />
          ) : (
            <div className="grid h-[220px] place-items-center text-center">
              <div>
                <div className="text-2xl font-semibold tnum text-accent">{brl(atual)}</div>
                <p className="mt-2 text-sm text-muted max-w-xs">
                  O histórico começa a acumular a partir de hoje.<br />Volte em alguns dias pra ver a curva.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="card">
          <SectionTitle>Aportes por mês (aplicações − resgates)</SectionTitle>
          <AportesChart data={aportes} />
        </div>
      </div>

      <div className="card">
        <SectionTitle>Carteira</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-faint border-b border-border">
                <th className="py-2 pr-3 font-medium">Ativo</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Banco</th>
                <th className="py-2 pr-3 font-medium">Quem</th>
                <th className="py-2 pr-3 font-medium text-right">Aportado</th>
                <th className="py-2 pr-3 font-medium text-right">Atual</th>
                <th className="py-2 pl-3 font-medium text-right">Lucro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inv.map((i) => (
                <tr key={i.id}>
                  <td className="py-2.5 pr-3 max-w-[200px] truncate">{i.nome}</td>
                  <td className="py-2.5 pr-3 text-muted">{traduzInvest(i.tipo)}{i.subtipo ? ` · ${traduzInvest(i.subtipo)}` : ''}</td>
                  <td className="py-2.5 pr-3 text-muted">{i.banco}</td>
                  <td className="py-2.5 pr-3">{respBadge(i.responsavel)}</td>
                  <td className="py-2.5 pr-3 text-right tnum text-muted">{brl(i.investido)}</td>
                  <td className="py-2.5 pr-3 text-right tnum font-medium">{brl(i.atual)}</td>
                  <td className={`py-2.5 pl-3 text-right tnum font-medium ${i.lucro >= 0 ? 'text-accent' : 'text-despesa'}`}>
                    {i.lucro >= 0 ? '+' : ''}{brl(i.lucro)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inv.length === 0 && <p className="text-sm text-muted mt-2">Nenhum investimento ativo.</p>}
        </div>
      </div>
    </div>
  );
}
