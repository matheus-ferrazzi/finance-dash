import { computeProjecao, getCalibracaoPara, getProjecaoBase, Resp } from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { SimuladorPagina } from '../components/SimuladorPagina';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

export default async function Simulador({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const [base, { calib }] = await Promise.all([getProjecaoBase(resp), getCalibracaoPara(resp)]);
  return (
    <div>
      <PageTitle title="Simulador de compra"
        subtitle="Se comprar isso agora, algum mês vai para o vermelho? Olha os próximos 24 meses." />
      <SimuladorPagina projecao={computeProjecao(base, 24)} saldoAtual={base.saldoContas.total} calib={calib} />
    </div>
  );
}
