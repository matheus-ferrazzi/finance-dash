import { getFaturas, getCreditoDespesas, currentDateSP, Resp } from '@/lib/queries';
import { brl } from '@/lib/format';
import { cicloAtual, cicloPedido, diaDoMes, ordenarPorPedido, proximosVencimentos, totalAPagar } from '@/lib/faturas';
import { CardResposta } from '../components/CardResposta';
import { LinhaVencimentos } from '../components/LinhaVencimentos';
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
  const somaAtual: number[] = [];
  const views: FaturaView[] = faturas.map((f) => {
    const meus = creditos.filter((c) => c.banco === f.banco && c.responsavel === f.responsavel);
    const atual = cicloAtual(f.fechamento, hojeMs);
    const noCiclo = meus.filter((c) => tempo(c.data) >= atual.start && tempo(c.data) < atual.end).reduce((s, c) => s + c.valor, 0);
    somaAtual.push(noCiclo);
    emCurso += noCiclo;
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
  // Onda 5: o que vai sair dos cartões, por data — fechadas não pagas e o ciclo em curso de cada um
  const vencs = proximosVencimentos(views.map((v, k) => ({
    banco: v.banco, responsavel: v.responsavel, fechamento: v.fechamento, ultima: v.ultima, somaCiclo: somaAtual[k],
  })), hoje);
  const aCobrar = vencs.filter((v) => v.situacao !== 'parcial');
  const proxima = aCobrar[0];
  const dd = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
  const secao = 'mb-1.5 mt-4 px-1 text-xs font-medium text-muted';

  return (
    <div>
      {aPagar > 0 && proxima ? (
        <CardResposta pergunta="Próximo pagamento" valor={brl(aPagar)} tom={proxima.situacao === 'atrasada' ? 'ruim' : 'atencao'}
          apoio={`${proxima.banco} (${proxima.responsavel}) ${proxima.situacao === 'atrasada' ? 'venceu' : 'vence'} ${dd(proxima.vence)}`
            + (aCobrar.length > 1 ? ` · + ${aCobrar.length - 1} fatura(s)` : '')} />
      ) : (
        <CardResposta pergunta="Próximo pagamento" valor="R$ 0 agora" dinheiro={false} complemento={<span className="text-accent">tudo pago</span>}
          apoio={<>As faturas que fecham agora já somam <span className="money">{brl(emCurso)}</span> (parcial — ainda pode entrar compra)</>} />
      )}

      <div className={secao}>Próximos vencimentos</div>
      <LinhaVencimentos itens={vencs} resp={resp} />

      <div className={secao}>Cartões</div>
      <div className="grid grid-cols-1 gap-3">
        {ordenadas.map(({ v, aberto }) => <FaturaCard key={v.id} f={v} abertoInicial={aberto} compacto />)}
      </div>
      {views.length === 0 && (
        <div className="card"><p className="text-sm text-muted">Nenhum cartão.</p></div>
      )}
    </div>
  );
}
