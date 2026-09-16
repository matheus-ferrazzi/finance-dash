import {
  getProjecaoBase, computeProjecao, getCompromissosParcelados, getCompromissosManuais,
  getSaldoContas, Resp,
} from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { PrevisibilidadeClient } from '../components/PrevisibilidadeClient';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

const HORIZONTE_MAX = 24;

export default async function Previsibilidade({ searchParams }: { searchParams: { resp?: string } }) {
  const resp = resolveResp(searchParams.resp);

  const [base, parcelados, manuais, saldos] = await Promise.all([
    getProjecaoBase(resp),
    getCompromissosParcelados(resp),
    getCompromissosManuais(resp),
    getSaldoContas(resp),
  ]);
  const projecao = computeProjecao(base, HORIZONTE_MAX);

  return (
    <div>
      <PageTitle
        title="Previsibilidade"
        subtitle="Quanto está comprometido, até quando, e quanto dinheiro você deve ter daqui a alguns meses."
      />
      <PrevisibilidadeClient
        resp={resp}
        patrimonioAtual={base.patrimonioAtual}
        saldoContas={saldos}
        receitasAReceber={base.mesCorrente.receitasAReceber}
        projecao={projecao}
        parcelados={parcelados}
        manuais={manuais}
      />
    </div>
  );
}
