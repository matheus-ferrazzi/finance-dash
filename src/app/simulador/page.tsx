import { computeProjecao, getCalibracaoPara, getProjecaoBase, Resp } from '@/lib/queries';
import { addMonths, cenarioMudanca, compromissoAtivoNoMes, lerMudanca, resumoMudanca } from '@/lib/previsao';
import { currentMonthSP } from '@/lib/format';
import { PageTitle } from '../components/ui';
import { SimuladorPagina } from '../components/SimuladorPagina';
import { CenarioMudanca } from '../components/CenarioMudanca';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Simulador({ searchParams }: {
  searchParams: { resp?: string; mudanca?: string; aluguel?: string; custo?: string };
}) {
  const resp = resolveResp(searchParams.resp);
  const [base, { calib }] = await Promise.all([getProjecaoBase(resp), getCalibracaoPara(resp)]);
  const atual = currentMonthSP();
  const semMudar = computeProjecao(base, 24);
  // P1: cenário de mudança só na visão do casal, a partir do mês que vem (o mês em andamento já tem aluguel pago)
  const lida = resp === 'casal' ? lerMudanca(searchParams) : null;
  const mudanca = lida && lida.mes > atual ? lida : null;
  const mudando = mudanca ? computeProjecao(cenarioMudanca(base, mudanca), 24) : null;
  const aluguelAtual = base.compromissosManuais.find((c) => c.categoria === 'Housing' && compromissoAtivoNoMes(c, atual))?.valor ?? null;
  return (
    <div>
      <PageTitle title="Simulador"
        subtitle="Se comprar isso agora, ou se a gente se mudar, algum mês vai para o vermelho? Olha os próximos 24 meses." />
      <CenarioMudanca mudanca={mudanca} aluguelAtual={aluguelAtual} individual={resp !== 'casal'}
        resumo={mudando && mudanca ? resumoMudanca(semMudar, mudando, mudanca.mes) : null} mesMinimo={addMonths(atual, 1)} />
      <SimuladorPagina projecao={mudando ?? semMudar} saldoAtual={base.saldoContas.total} calib={calib} />
    </div>
  );
}
