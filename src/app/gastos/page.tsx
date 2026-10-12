import Link from 'next/link';
import { getGastosDinheiro } from '@/lib/dinheiro';
import { paraLancamentos } from '@/lib/dinheiroTela';
import { getDespesas, getPorBanco, resolvePeriodo, Resp } from '@/lib/queries';
import { categoriaNoFiltro, GRUPOS_VALIDOS } from '@/lib/grupos';
import { linkPara } from '@/lib/links';
import { brl, traduzCategoria } from '@/lib/format';
import { PageTitle, SectionTitle, StatStrip } from '../components/ui';
import { CategoriaDonut } from '../components/charts';
import { CategoryAccordion, CatGroup } from '../components/CategoryAccordion';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Gastos({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string; grupo?: string; tipo?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);

  const [doBanco, bancos, din] = await Promise.all([getDespesas(resp, per), getPorBanco(resp, per), getGastosDinheiro(resp, per.start, per.endExcl)]);
  // E3: gasto em dinheiro vivo entra na lista e nos totais (com 💵), nunca nas contas do banco
  const todas: (typeof doBanco[number] & { dinheiroId?: number })[] = [...doBanco, ...(paraLancamentos(din) as any[])];
  // filtros da URL (links da home e do bot): ?grupo=Mercado, ?tipo=livre; valor desconhecido não filtra
  const despesas = todas.filter((d) => categoriaNoFiltro(d.categoria, { grupo: searchParams.grupo, tipo: searchParams.tipo }));
  const filtroAtivo = searchParams.grupo && GRUPOS_VALIDOS.includes(searchParams.grupo) ? searchParams.grupo
    : searchParams.tipo === 'livre' ? 'Gasto livre (sem casa e dívidas)' : null;

  const mapa = new Map<string, CatGroup>();
  for (const d of despesas) {
    const g = mapa.get(d.categoria) ?? { categoria: d.categoria, total: 0, n: 0, items: [] };
    g.total += d.valor; g.n += 1;
    g.items.push({ id: d.id, data: d.data, valor: d.valor, descricao: d.descricao, banco: d.banco, responsavel: d.responsavel, dinheiroId: d.dinheiroId });
    mapa.set(d.categoria, g);
  }
  const grupos = [...mapa.values()].sort((a, b) => b.total - a.total);
  const totalMes = grupos.reduce((s, g) => s + g.total, 0);
  const totalBanco = bancos.reduce((s, b) => s + b.total, 0);
  const totalDinheiro = despesas.reduce((s, d) => s + (d.dinheiroId ? d.valor : 0), 0);

  return (
    <div>
      <PageTitle title="Gastos" subtitle={`${per.label} · clique numa categoria para ver os lançamentos.`} />

      {filtroAtivo && (
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">{filtroAtivo}</span>
          <Link href={linkPara('gastos', { resp, mes: searchParams.mes })} className="text-xs text-muted hover:text-text" aria-label="Limpar filtro">× limpar</Link>
        </div>
      )}

      {totalDinheiro > 0 && <p className="mb-2 text-xs text-muted">Inclui <span className="money">{brl(totalDinheiro)}</span> em dinheiro vivo 💵</p>}

      {/* o que era o card "Resumo" — contagem e ticket médio são apoio, não manchete */}
      <StatStrip
        stats={[
          { label: 'Total gasto', value: brl(totalMes), tone: 'down' },
          { label: 'Lançamentos', value: String(despesas.length), hint: `em ${grupos.length} categorias` },
          { label: 'Ticket médio', value: brl(despesas.length ? totalMes / despesas.length : 0), tone: 'muted' },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <SectionTitle>Distribuição</SectionTitle>
          <CategoriaDonut data={grupos.map((g) => ({ categoria: traduzCategoria(g.categoria), total: g.total }))} />
        </div>

        <div className="card">
          <SectionTitle>Por banco</SectionTitle>
          <div className="space-y-2.5">
            {bancos.map((b) => (
              <div key={b.banco}>
                <div className="flex items-center justify-between text-sm">
                  <span>{b.banco}</span><span className="tnum money text-muted">{brl(b.total)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-accent/60" style={{ width: `${totalBanco ? (b.total / totalBanco) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {bancos.length === 0 && <p className="text-sm text-muted">—</p>}
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
