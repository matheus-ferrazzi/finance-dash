import { getFaturas, getCreditoDespesas, currentDateSP, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { PageTitle } from '../components/ui';
import { FaturaCard, FaturaView } from '../components/FaturaCard';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** ciclo de fatura que contém hoje, a partir do dia de fechamento */
function cicloAtual(fechamento: string | null, hojeMs: number) {
  const hoje = new Date(hojeMs);
  const y = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const closeDay = fechamento ? new Date(fechamento + 'T00:00:00Z').getUTCDate() : 1;
  const dThis = Date.UTC(y, m, closeDay);
  if (dThis <= hojeMs) return { start: dThis, end: Date.UTC(y, m + 1, closeDay) };
  return { start: Date.UTC(y, m - 1, closeDay), end: dThis };
}

export default async function Faturas({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [faturas, creditos] = await Promise.all([getFaturas(resp), getCreditoDespesas(resp)]);

  const [hy, hm, hd] = currentDateSP().split('-').map(Number);
  const hojeMs = Date.UTC(hy, hm - 1, hd);

  const views: FaturaView[] = faturas.map((f) => {
    const { start, end } = cicloAtual(f.fechamento, hojeMs);
    const items = creditos
      .filter((c) => c.banco === f.banco && c.responsavel === f.responsavel)
      .filter((c) => {
        const t = new Date(c.data + 'T00:00:00Z').getTime();
        return t >= start && t < end;
      })
      .map((c) => ({ id: c.id, data: c.data, valor: c.valor, descricao: c.descricao, categoria: c.categoria }));
    const soma = items.reduce((s, i) => s + i.valor, 0);
    return {
      id: f.id, banco: f.banco, responsavel: f.responsavel, valor: f.valor,
      limite: f.limite, disponivel: f.disponivel, vencimento: f.vencimento, fechamento: f.fechamento,
      cicloLabel: `${ddmm(start)} a ${ddmm(end - 86400000)}`, soma, items,
    };
  });

  const totalAberto = faturas.reduce((s, f) => s + f.valor, 0);

  return (
    <div>
      <PageTitle title="Faturas" subtitle="Cartões de crédito — toque em cada um pra ver as compras do ciclo." />

      <div className="card mb-4">
        <div className="text-xs text-muted">Total em faturas abertas</div>
        <div className="mt-1.5 text-2xl font-semibold tnum text-despesa">{brl(totalAberto)}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {views.map((v) => <FaturaCard key={v.id} f={v} />)}
      </div>
      {views.length === 0 && (
        <div className="card"><p className="text-sm text-muted">Nenhuma fatura cadastrada.</p></div>
      )}
    </div>
  );
}
