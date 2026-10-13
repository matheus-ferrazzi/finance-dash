import { getFaturas, getCreditoDespesas, currentDateSP, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { totalAPagar } from '@/lib/faturas';
import { PageTitle, StatStrip } from '../components/ui';
import { FaturaCard, FaturaView } from '../components/FaturaCard';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

function ddmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Data do dia `dia` no mês (ano, mes), sem estourar pro mês seguinte.
 * Cartão que fecha dia 30 não tem "30 de fevereiro": Date.UTC(2027,1,30)
 * viraria 2 de março e jogava o ciclo inteiro pro mês errado.
 */
function diaDoMes(ano: number, mes: number, dia: number): number {
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Date.UTC(ano, mes, Math.min(dia, ultimoDia));
}

/** ciclo de fatura que contém hoje, a partir do dia de fechamento */
function cicloAtual(fechamento: string | null, hojeMs: number) {
  const hoje = new Date(hojeMs);
  const y = hoje.getUTCFullYear(), m = hoje.getUTCMonth();
  const closeDay = fechamento ? new Date(fechamento + 'T00:00:00Z').getUTCDate() : 1;
  const dThis = diaDoMes(y, m, closeDay);
  if (dThis <= hojeMs) return { start: dThis, end: diaDoMes(y, m + 1, closeDay), closeDay };
  return { start: diaDoMes(y, m - 1, closeDay), end: dThis, closeDay };
}

export default async function Faturas({ searchParams }: { searchParams: { resp?: string; cartao?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [faturas, creditos] = await Promise.all([getFaturas(resp), getCreditoDespesas(resp)]);

  const [hy, hm, hd] = currentDateSP().split('-').map(Number);
  const hojeMs = Date.UTC(hy, hm - 1, hd);

  const views: FaturaView[] = faturas.map((f) => {
    const { start, end, closeDay } = cicloAtual(f.fechamento, hojeMs);
    const meus = creditos.filter((c) => c.banco === f.banco && c.responsavel === f.responsavel);
    const items = meus
      .filter((c) => {
        const t = new Date(c.data + 'T00:00:00Z').getTime();
        return t >= start && t < end;
      })
      .map((c) => ({ id: c.id, data: c.data, valor: c.valor, descricao: c.descricao, categoria: c.categoria }));
    const soma = items.reduce((s, i) => s + i.valor, 0);
    // próximo ciclo [end, end+1mês) — soma das parcelas futuras já lançadas
    const ne = new Date(end);
    const nextEnd = diaDoMes(ne.getUTCFullYear(), ne.getUTCMonth() + 1, closeDay);
    const proxSoma = meus
      .filter((c) => { const t = new Date(c.data + 'T00:00:00Z').getTime(); return t >= end && t < nextEnd; })
      .reduce((s, c) => s + c.valor, 0);
    return {
      id: f.id, banco: f.banco, responsavel: f.responsavel, ultima: f.ultima,
      limite: f.limite, disponivel: f.disponivel, fechamento: f.fechamento,
      cicloLabel: `${ddmm(start)} a ${ddmm(end - 86400000)}`, soma, items,
      proxSoma, proxLabel: `${ddmm(end)} a ${ddmm(nextEnd - 86400000)}`,
    };
  });

  // ?cartao=Nubank (link da home): o cartão vem primeiro e aberto; cartão que a pessoa não tem é ignorado
  const pedido = searchParams.cartao;
  const ordenadas = pedido && views.some((v) => v.banco === pedido)
    ? [...views.filter((v) => v.banco === pedido), ...views.filter((v) => v.banco !== pedido)]
    : views;

  // N4: "a pagar" = o que falta das faturas FECHADAS (a vencer + em atraso); o saldo devedor do cartão
  // inclui as compras do ciclo novo e fica no "limite usado" de cada cartão
  const aPagar = totalAPagar(faturas.flatMap((f) => (f.ultima ? [f.ultima] : [])));
  const limiteTotal = faturas.reduce((s, f) => s + (f.limite ?? 0), 0);
  const dispTotal = faturas.reduce((s, f) => s + (f.disponivel ?? 0), 0);
  const emCurso = views.reduce((s, v) => s + v.soma, 0);

  return (
    <div>
      <PageTitle title="Faturas" subtitle="Cartões de crédito — toque em cada um pra ver as compras do ciclo." />

      <StatStrip
        stats={[
          { label: 'Faturas a pagar', value: brl(aPagar), tone: aPagar > 0 ? 'down' : 'muted', hint: 'fechadas e não pagas' },
          { label: 'Ciclo em curso', value: brl(emCurso), tone: 'warn', hint: 'vira fatura depois' },
          { label: 'Limite disponível', value: brl(dispTotal), tone: 'muted', hint: `de ${brl(limiteTotal)}` },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ordenadas.map((v) => <FaturaCard key={v.id} f={v} abertoInicial={v.banco === pedido} />)}
      </div>
      {views.length === 0 && (
        <div className="card"><p className="text-sm text-muted">Nenhuma fatura cadastrada.</p></div>
      )}
    </div>
  );
}
