import { getDespesas, getPorBanco, resolvePeriodo, Resp } from '@/lib/queries';
import { brl, traduzCategoria } from '@/lib/format';
import { PageTitle, SectionTitle } from '../components/ui';
import { CategoriaDonut } from '../components/charts';
import { CategoryAccordion, CatGroup } from '../components/CategoryAccordion';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Gastos({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);

  const [despesas, bancos] = await Promise.all([getDespesas(resp, per), getPorBanco(resp, per)]);

  const mapa = new Map<string, CatGroup>();
  for (const d of despesas) {
    const g = mapa.get(d.categoria) ?? { categoria: d.categoria, total: 0, n: 0, items: [] };
    g.total += d.valor; g.n += 1;
    g.items.push({ id: d.id, data: d.data, valor: d.valor, descricao: d.descricao, banco: d.banco, responsavel: d.responsavel });
    mapa.set(d.categoria, g);
  }
  const grupos = [...mapa.values()].sort((a, b) => b.total - a.total);
  const totalMes = grupos.reduce((s, g) => s + g.total, 0);
  const totalBanco = bancos.reduce((s, b) => s + b.total, 0);

  return (
    <div>
      <PageTitle title="Gastos" subtitle={`${per.label} · clique numa categoria para ver os lançamentos.`} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <SectionTitle>Distribuição</SectionTitle>
          <CategoriaDonut data={grupos.map((g) => ({ categoria: traduzCategoria(g.categoria), total: g.total }))} />
          <div className="mt-2 text-center">
            <div className="text-xs text-muted">Total gasto</div>
            <div className="text-xl font-semibold tnum text-despesa">{brl(totalMes)}</div>
          </div>
        </div>

        <div className="card">
          <SectionTitle>Por banco</SectionTitle>
          <div className="space-y-2.5">
            {bancos.map((b) => (
              <div key={b.banco}>
                <div className="flex items-center justify-between text-sm">
                  <span>{b.banco}</span><span className="tnum text-muted">{brl(b.total)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent/60" style={{ width: `${totalBanco ? (b.total / totalBanco) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {bancos.length === 0 && <p className="text-sm text-muted">—</p>}
          </div>
        </div>

        <div className="card">
          <SectionTitle>Resumo</SectionTitle>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">Categorias</span><span className="tnum">{grupos.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Lançamentos</span><span className="tnum">{despesas.length}</span></div>
            <div className="flex justify-between"><span className="text-muted">Maior categoria</span><span>{grupos[0] ? traduzCategoria(grupos[0].categoria) : '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted">Ticket médio</span><span className="tnum">{brl(despesas.length ? totalMes / despesas.length : 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <SectionTitle>Categorias — toque para expandir</SectionTitle>
        <CategoryAccordion grupos={grupos} />
      </div>
    </div>
  );
}
