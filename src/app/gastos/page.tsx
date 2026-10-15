import Link from 'next/link';
import { getGastosDinheiro } from '@/lib/dinheiro';
import { paraLancamentos } from '@/lib/dinheiroTela';
import { computeProjecao, computeRitmo, diasNoMes, getDespesas, getProjecaoBase, resolvePeriodo, Resp } from '@/lib/queries';
import { categoriaNoFiltro, GRUPOS_VALIDOS } from '@/lib/grupos';
import { linkPara } from '@/lib/links';
import { brl, currentDateSP, mesLabel } from '@/lib/format';
import { addMonths } from '@/lib/previsao';
import { ateODia, cabeNoMes, diaADia, gruposDoPeriodo, mediaPorGrupo, noCredito, type LancGasto } from '@/lib/gastosTela';
import { CardResposta } from '../components/CardResposta';
import { Elo } from '../components/Elo';
import { GruposGastos } from '../components/GruposGastos';
import { PeriodoGastos } from '../components/PeriodoGastos';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

// Onda 5: "Pra onde foi o dinheiro, e o dia a dia está dentro do que cabe?"
export default async function Gastos({ searchParams }: { searchParams: { resp?: string; mes?: string; p?: string; grupo?: string; tipo?: string; forma?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const per = resolvePeriodo(searchParams.p, searchParams.mes);
  const hoje = currentDateSP();
  const porMes = per.kind === 'mes';
  const corrente = porMes && per.mesAnchor === hoje.slice(0, 7);

  // mês em andamento: o ritmo da home (mesma conta); mês: os 3 meses antes para a média (seta dos grupos)
  const [doBanco, din, base, ...anteriores] = await Promise.all([
    getDespesas(resp, per),
    getGastosDinheiro(resp, per.start, per.endExcl),
    corrente ? getProjecaoBase(resp) : Promise.resolve(null),
    ...(porMes ? [1, 2, 3].map((k) => getDespesas(resp, resolvePeriodo(undefined, addMonths(per.mesAnchor, -k)))) : []),
  ]);
  // E3: gasto em dinheiro vivo entra na lista e nos totais (com 💵), nunca nas contas do banco
  const todas: LancGasto[] = [...doBanco, ...paraLancamentos(din)];
  // filtros da URL (links da home e do bot): ?grupo=Mercado, ?tipo=livre, ?forma=debito; valor desconhecido não filtra
  const soDebito = searchParams.forma === 'debito';
  const despesas = todas.filter((d) => categoriaNoFiltro(d.categoria, { grupo: searchParams.grupo, tipo: searchParams.tipo })
    && (!soDebito || d.forma === 'Débito'));
  const filtroAtivo = [
    searchParams.grupo && GRUPOS_VALIDOS.includes(searchParams.grupo) ? searchParams.grupo : null,
    searchParams.tipo === 'livre' ? 'Gasto livre (sem casa e dívidas)' : null,
    soDebito ? 'Só débito e PIX' : null,
  ].filter(Boolean).join(' · ') || null;

  // no mês em andamento a média é dos 3 meses anteriores ATÉ O MESMO DIA (meio mês × mês inteiro sempre daria "abaixo")
  const diaHoje = Number(hoje.slice(8, 10));
  const meses = (anteriores as LancGasto[][]).map((ls) => (corrente ? ateODia(ls, diaHoje) : ls));
  const grupos = gruposDoPeriodo(despesas, porMes ? mediaPorGrupo(meses) : null);
  const total = Math.round(despesas.reduce((s, d) => s + d.valor, 0) * 100) / 100;
  const totalDinheiro = despesas.reduce((s, d) => s + (d.dinheiroId ? d.valor : 0), 0);
  const credito = noCredito(despesas);
  const dias = Math.max(1, Math.round((Date.parse(per.endExcl) - Date.parse(per.start)) / 86400000));

  let topo: React.ReactNode;
  if (corrente && base) {
    const ritmo = computeRitmo(base, computeProjecao(base, 1)[0], hoje);
    const gasto = base.mesCorrente.variavelJaGasto;
    const cabe = cabeNoMes(gasto, ritmo.sobraParaODiaADia);
    const pct = cabe > 0 ? Math.min(100, Math.round((gasto / cabe) * 100)) : 100;
    const tom = gasto > cabe ? 'ruim' : gasto >= 0.8 * cabe ? 'atencao' : 'neutro';
    topo = (
      <CardResposta pergunta={`Dia a dia (débito e PIX) em ${mesLabel(per.mesAnchor)}`} valor={brl(gasto)} tom={tom}
        complemento={<>de <span className="money">{brl(cabe)}</span> que cabem</>}
        apoio={<>Ritmo <span className="money">{brl(ritmo.ritmoAtualDia)}</span>/dia · cabe <span className="money">{brl(ritmo.ritmoSeguroDia)}</span>/dia até o dia {diasNoMes(per.mesAnchor)}</>}>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
          <div className={`h-full rounded-full ${tom === 'ruim' ? 'bg-despesa' : tom === 'atencao' ? 'bg-warn' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
        </div>
      </CardResposta>
    );
  } else if (porMes) {
    const media = meses.length ? meses.reduce((s, ls) => s + diaADia(ls), 0) / meses.length : 0;
    topo = <CardResposta pergunta={`Dia a dia (débito e PIX) em ${mesLabel(per.mesAnchor)}`} valor={brl(diaADia(todas))}
      apoio={<>média dos 3 meses antes: <span className="money">{brl(media)}</span></>} />;
  } else {
    const gasto = diaADia(todas);
    topo = <CardResposta pergunta={`Dia a dia (débito e PIX) · ${per.label.toLowerCase()}`} valor={brl(gasto)}
      apoio={<><span className="money">{brl(gasto / dias)}</span>/dia</>} />;
  }

  // dinheiro vivo e o elo do crédito: no celular depois dos grupos, no desktop embaixo da resposta
  const rodape = (
    <>
      {totalDinheiro > 0 && <p className="mb-3 px-1 text-xs text-muted">Inclui <span className="money">{brl(totalDinheiro)}</span> em dinheiro vivo 💵</p>}
      {credito > 0 && (
        <Elo href={linkPara('faturas', { resp })} acao="ver faturas">
          💳 <span className="money">{brl(credito)}</span> foram no crédito
        </Elo>
      )}
    </>
  );

  return (
    <div>
      {filtroAtivo && (
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full bg-accent/15 px-3 py-1 text-xs text-accent">{filtroAtivo}</span>
          <Link href={linkPara('gastos', { resp, mes: searchParams.mes })} className="text-xs text-muted hover:text-text" aria-label="Limpar filtro">× limpar</Link>
        </div>
      )}

      {/* desktop: a resposta e os elos à esquerda, os grupos à direita; no celular, um embaixo do outro */}
      <div className="md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start md:gap-4">
        <div>
          {topo}
          <div className="hidden md:block">{rodape}</div>
        </div>
        <div>
          <GruposGastos grupos={grupos} total={total} titulo={`Tudo que saiu · ${per.label.toLowerCase()}`}
            hrefs={Object.fromEntries(grupos.map((g) => [g.nome, linkPara('gastos', { resp, mes: searchParams.mes, grupo: g.nome })]))}
            periodo={<PeriodoGastos />} />
          <div className="md:hidden">{rodape}</div>
        </div>
      </div>
    </div>
  );
}
