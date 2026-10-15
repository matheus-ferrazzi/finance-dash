import Link from 'next/link';
import { getContasDoMes, getDespesas, getFaturas, getMovimentosDiarios, getProjecaoBase, getCalibracaoPara, diasNoMes, computeProjecao, computeRitmo, resolvePeriodo, getTrilhaDados, Resp } from '@/lib/queries';
import { brl, currentDateSP, currentMonthSP } from '@/lib/format';
import { agruparGastos } from '@/lib/grupos';
import { linkPara, mesValido } from '@/lib/links';
import { serieDoMes } from '@/lib/linhaDoMes';
import { cartaoDestaque, contasResumo, topGrupos } from '@/lib/home';
import { faixaMesCorrente } from '@/lib/faixa';
import { LinhaDoMes } from './components/LinhaDoMes';
import { BlocoHome } from './components/BlocoHome';
import { BarraGrupos, CORES_GRUPOS } from './components/BarraGrupos';
import { FaixaTrilha } from './components/FaixaTrilha';
import { avaliarTrilha } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}
const CORES = CORES_GRUPOS;

// Home: "como o mês vai fechar" sem rolar. Cada número leva à tela que aprofunda, já filtrada.
export default async function Home({ searchParams }: { searchParams: { resp?: string; mes?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const atual = currentMonthSP();
  const pedido = mesValido(searchParams.mes);
  const mes = pedido && pedido <= atual ? pedido : atual; // na home não existe mês seguinte
  const corrente = mes === atual;
  const hoje = currentDateSP();

  const basePromise = getProjecaoBase(resp);
  const [base, contas, despesas, faturas, movimentos, { calib }, trilhaDados] = await Promise.all([
    basePromise, getContasDoMes(resp, mes), getDespesas(resp, resolvePeriodo(undefined, mes)),
    getFaturas(resp), getMovimentosDiarios(resp, `${mes}-01`, hoje), corrente ? getCalibracaoPara(resp) : Promise.resolve({ calib: null }),
    // a trilha é do casal e é complemento: se falhar, a home abre sem ela
    // na visão do casal, a trilha reaproveita a base que a home já está buscando
    (resp === 'casal' ? basePromise.then((b) => getTrilhaDados(hoje, b)) : getTrilhaDados(hoje)).catch((e) => { console.error('trilha falhou', e); return null; }),
  ]);
  const mesProj = computeProjecao(base, 1)[0];
  const ritmo = corrente && mesProj ? computeRitmo(base, mesProj) : null;
  // F1: receitas que ainda entram no dia delas — as recorrentes (dia típico) e as já agendadas (dia marcado)
  const receitasDoMes = corrente ? [
    ...base.mesCorrente.receitasAReceber.map((r) => ({ dia: r.diaTipico, valor: r.valor })),
    ...(base.mesCorrente.receitasAgendadas ?? []),
  ] : [];
  const aindaEntra = receitasDoMes.reduce((s, r) => s + r.valor, 0);
  const serie = serieDoMes({
    mes, hoje, saldoHoje: base.saldoContasAtual, movimentos,
    receitas: receitasDoMes,
    aindaSai: corrente && ritmo ? base.saldoContasAtual + aindaEntra - ritmo.fechaCom : 0,
  });

  const porCat = new Map<string, number>();
  for (const d of despesas) porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + d.valor);
  const grupos = topGrupos(agruparGastos(porCat, 0));
  const cartao = cartaoDestaque(faturas);
  const cr = contasResumo(contas.itens);
  const f = { resp, mes };

  return (
    <div>
      {trilhaDados && <FaixaTrilha trilha={avaliarTrilha(trilhaDados)} />}
      <LinhaDoMes serie={serie} faixa={calib && ritmo ? faixaMesCorrente(serie.fechamento, ritmo.diasRestantes, diasNoMes(mes), calib) : null} titulo={corrente ? 'Fecha o mês em' : 'Fechou em'} href={linkPara('previsao', f, atual)} />
      <div className="grid grid-cols-2 gap-3">
        <BlocoHome titulo="Ritmo do dia" href={linkPara('gastos', { ...f, tipo: 'livre', forma: 'debito' }, atual)}
          valor={ritmo ? `${brl(ritmo.ritmoSeguroDia)}/dia` : '—'}
          detalhe={ritmo ? <>gastando <span className="money">{brl(ritmo.ritmoAtualDia)}</span>/dia</> : 'mês fechado'}
          tom={ritmo ? (ritmo.ritmoAtualDia > ritmo.ritmoSeguroDia ? 'atencao' : 'bom') : 'neutro'} />
        <BlocoHome titulo="Contas do mês" href={linkPara('contas', f, atual)}
          valor={cr ? `${cr.pagas}/${cr.total}` : '—'} valorEhDinheiro={false}
          detalhe={cr ? (cr.falta > 0 ? <>falta <span className="money">{brl(cr.falta)}</span></> : 'tudo pago') : 'nenhuma conta cadastrada'}
          tom={cr ? (cr.falta > 0 ? 'atencao' : 'bom') : 'neutro'} />
        {/* sem href no bloco: cada grupo é o seu link (a spec pede um destino por pedaço) */}
        <BlocoHome titulo="Para onde vai" valor={grupos[0] ? grupos[0].nome : '—'} valorEhDinheiro={false}
          detalhe={grupos.length ? undefined : 'sem gasto no mês'}>
          {grupos.length > 0 && (
            <>
              <BarraGrupos grupos={grupos.map((g) => ({ nome: g.nome, pct: g.pct, href: linkPara('gastos', { ...f, grupo: g.nome }, atual) }))} />
              <div className="mt-1 flex flex-col">
                {grupos.map((g, i) => (
                  <Link key={g.nome} href={linkPara('gastos', { ...f, grupo: g.nome }, atual)}
                    className="flex min-h-[28px] items-center gap-1.5 text-[11px] text-muted hover:text-text">
                    <span className={`h-2 w-2 rounded-full ${CORES[i]}`} />{g.nome} {g.pct}%
                  </Link>
                ))}
              </div>
            </>
          )}
        </BlocoHome>
        <BlocoHome titulo="Cartões" href={linkPara('faturas', { resp, cartao: cartao ? `${cartao.banco}:${cartao.responsavel}` : undefined, ciclo: cartao && cartao.aPagar > 0 ? 'fechada' : undefined }, atual)}
          valor={cartao ? brl(cartao.aPagar) : '—'}
          detalhe={cartao ? `a pagar · ${cartao.banco} ${cartao.usoPct}% do limite` : 'sem cartão'}
          tom={cartao && cartao.usoPct >= 80 ? 'ruim' : 'neutro'} />
      </div>
    </div>
  );
}
