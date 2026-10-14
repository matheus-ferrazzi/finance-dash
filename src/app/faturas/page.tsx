import { getFaturas, getCreditoDespesas, currentDateSP, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { cicloAtual, cicloPedido, diaDoMes, ordenarPorPedido, totalAPagar } from '@/lib/faturas';
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

export default async function Faturas({ searchParams }: { searchParams: { resp?: string; cartao?: string; ciclo?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [faturas, creditos] = await Promise.all([getFaturas(resp), getCreditoDespesas(resp)]);

  const hoje = currentDateSP();
  const [hy, hm, hd] = hoje.split('-').map(Number);
  const hojeMs = Date.UTC(hy, hm - 1, hd);

  const tempo = (d: string) => new Date(d + 'T00:00:00Z').getTime();
  // "ciclo em curso" do topo é sempre o de hoje, mesmo quando os cartões mostram uma fatura fechada (P3)
  let emCurso = 0;
  const views: FaturaView[] = faturas.map((f) => {
    const meus = creditos.filter((c) => c.banco === f.banco && c.responsavel === f.responsavel);
    const atual = cicloAtual(f.fechamento, hojeMs);
    emCurso += meus.filter((c) => tempo(c.data) >= atual.start && tempo(c.data) < atual.end).reduce((s, c) => s + c.valor, 0);
    // ?ciclo=fechada (link do "a pagar") ou AAAA-MM: as compras da fatura já fechada, não as do ciclo em curso
    const pedido = cicloPedido(searchParams.ciclo, f.fechamento, hoje);
    const { start, end, closeDay } = pedido ?? atual;
    const items = meus
      .filter((c) => tempo(c.data) >= start && tempo(c.data) < end)
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
      cicloFechado: !!pedido && end <= hojeMs,
    };
  });

  // ?cartao=Nubank:Matheus (link da home): só aquele cartão vem primeiro e aberto (F1: antes abria os dois Nubank)
  const ordenadas = ordenarPorPedido(views, searchParams.cartao);

  // N4: "a pagar" = o que falta das faturas FECHADAS (a vencer + em atraso); o saldo devedor do cartão
  // inclui as compras do ciclo novo e fica no "limite usado" de cada cartão
  const aPagar = totalAPagar(faturas.flatMap((f) => (f.ultima ? [f.ultima] : [])));
  const limiteTotal = faturas.reduce((s, f) => s + (f.limite ?? 0), 0);
  const dispTotal = faturas.reduce((s, f) => s + (f.disponivel ?? 0), 0);


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
        {ordenadas.map(({ v, aberto }) => <FaturaCard key={v.id} f={v} abertoInicial={aberto} />)}
      </div>
      {views.length === 0 && (
        <div className="card"><p className="text-sm text-muted">Nenhuma fatura cadastrada.</p></div>
      )}
    </div>
  );
}
