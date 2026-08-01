import { getOrcamento, getDespesas, resolvePeriodo, Resp } from '@/lib/queries';
import { brl, mesLongo } from '@/lib/format';
import { PageTitle, SectionTitle } from '../components/ui';
import { OrcamentoAccordion, OrcGroup } from '../components/OrcamentoAccordion';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Orcamento({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);
  const perMes = resolvePeriodo(undefined, per.mesAnchor);

  const [orc, despesas] = await Promise.all([getOrcamento(resp, per), getDespesas(resp, perMes)]);

  // monta os lançamentos que consumiram cada item do orçamento
  const grupos: OrcGroup[] = orc.map((o) => {
    const cats = new Set(o.categorias);
    const items = despesas
      .filter((d) => cats.has(d.categoria))
      .map((d) => ({ id: d.id, data: d.data, valor: d.valor, descricao: d.descricao, categoria: d.categoria, banco: d.banco, responsavel: d.responsavel }));
    return { item: o.item, emoji: o.emoji, teto: o.teto, gasto: o.gasto, items };
  });

  const tetoTotal = orc.reduce((s, o) => s + o.teto, 0);
  const gastoTotal = orc.reduce((s, o) => s + o.gasto, 0);
  const disp = tetoTotal - gastoTotal;

  return (
    <div>
      <PageTitle title="Orçamento" subtitle={`${mesLongo(per.mesAnchor)} · orçamento é mensal · toque num item pra ver o que consumiu o teto.`} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <div className="card">
          <div className="text-xs text-muted">Gasto orçado</div>
          <div className="mt-1.5 text-xl md:text-2xl font-semibold tnum">{brl(gastoTotal)}</div>
        </div>
        <div className="card">
          <div className="text-xs text-muted">Teto total</div>
          <div className="mt-1.5 text-xl md:text-2xl font-semibold tnum text-muted">{brl(tetoTotal)}</div>
        </div>
        <div className="card col-span-2 lg:col-span-1">
          <div className="text-xs text-muted">Disponível</div>
          <div className={`mt-1.5 text-xl md:text-2xl font-semibold tnum ${disp >= 0 ? 'text-accent' : 'text-despesa'}`}>{brl(disp)}</div>
        </div>
      </div>

      <SectionTitle>Por categoria — toque para expandir</SectionTitle>
      {grupos.length === 0 ? (
        <div className="card"><p className="text-sm text-muted">Nenhum item de orçamento ativo.</p></div>
      ) : (
        <OrcamentoAccordion grupos={grupos} />
      )}
    </div>
  );
}
