import { getDespesas, getCasaSerie, CASA_CATS, resolvePeriodo, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { PageTitle, SectionTitle, StatStrip } from '../components/ui';
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

  // Média dos meses anteriores. Filtra pelo mês de verdade em vez de cortar o
  // último item: a série omite meses sem lançamento, então no começo do mês o
  // último item ainda é o mês passado e ele acabava descartado da média.
  const anteriores = serie.filter((x) => x.mes < per.mesAnchor);
  const media = anteriores.length ? anteriores.reduce((s, x) => s + x.despesa, 0) / anteriores.length : 0;

  // comparar um recorte de dias com uma média mensal não diz nada
  const comparavel = per.kind === 'mes';

  return (
    <div>
      <PageTitle title="Casa" subtitle={`${per.label} · gastos fixos do lar — moradia, energia, água, telefone e gás.`} />

      <StatStrip
        stats={[
          { label: comparavel ? 'Total no mês' : 'Total no período', value: brl(total), tone: 'warn' },
          { label: 'Média dos meses anteriores', value: brl(media), tone: 'muted' },
          comparavel
            ? {
                label: 'vs. média',
                value: media > 0 ? `${total <= media ? '−' : '+'}${brl(Math.abs(total - media))}` : '—',
                tone: (total <= media ? 'up' : 'down') as 'up' | 'down',
              }
            : { label: 'vs. média', value: '—', tone: 'muted' as const, hint: 'só compara com o filtro Mês' },
        ]}
      />

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
