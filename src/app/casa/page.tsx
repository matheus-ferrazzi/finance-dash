import { getDespesas, getCasaSerie, CASA_CATS, resolvePeriodo, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { PageTitle, SectionTitle } from '../components/ui';
import { CasaChart } from '../components/charts';
import { CategoryAccordion, CatGroup } from '../components/CategoryAccordion';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Casa({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);

  const casa = new Set(CASA_CATS);
  const [despesas, serie] = await Promise.all([getDespesas(resp, per), getCasaSerie(resp, per, 6)]);

  const doLar = despesas.filter((d) => casa.has(d.categoria));
  const total = doLar.reduce((s, d) => s + d.valor, 0);

  // agrupa por categoria
  const mapa = new Map<string, CatGroup>();
  for (const d of doLar) {
    const g = mapa.get(d.categoria) ?? { categoria: d.categoria, total: 0, n: 0, items: [] };
    g.total += d.valor; g.n += 1;
    g.items.push({ id: d.id, data: d.data, valor: d.valor, descricao: d.descricao, banco: d.banco, responsavel: d.responsavel });
    mapa.set(d.categoria, g);
  }
  const grupos = [...mapa.values()].sort((a, b) => b.total - a.total);

  // média dos meses anteriores (exclui o mês atual da série)
  const anteriores = serie.slice(0, -1);
  const media = anteriores.length ? anteriores.reduce((s, x) => s + x.despesa, 0) / anteriores.length : 0;

  return (
    <div>
      <PageTitle title="Casa" subtitle={`${per.label} · gastos fixos do lar — moradia, energia, água, internet, telefone.`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="card">
          <div className="text-xs text-muted">Total da casa no mês</div>
          <div className="mt-1.5 text-xl md:text-2xl font-semibold tnum text-warn">{brl(total)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Média (meses anteriores)</div>
          <div className="mt-1.5 text-xl md:text-2xl font-semibold tnum text-muted">{brl(media)}</div>
        </div>
        <div className="card col-span-2 lg:col-span-1">
          <div className="text-xs text-muted">vs. média</div>
          <div className={`mt-1.5 text-xl md:text-2xl font-semibold tnum ${total <= media ? 'text-accent' : 'text-despesa'}`}>
            {media > 0 ? `${total <= media ? '−' : '+'}${brl(Math.abs(total - media))}` : '—'}
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <SectionTitle>Evolução (6 meses)</SectionTitle>
        <CasaChart data={serie} />
      </div>

      <SectionTitle>Por conta — toque para expandir</SectionTitle>
      {grupos.length === 0 ? (
        <div className="card"><p className="text-sm text-muted">Nenhum gasto da casa neste mês.</p></div>
      ) : (
        <CategoryAccordion grupos={grupos} />
      )}
    </div>
  );
}
