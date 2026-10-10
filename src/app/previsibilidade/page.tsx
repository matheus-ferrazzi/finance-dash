import {
  getProjecaoBase, computeProjecao, getCalibracaoPara, getCompromissosParcelados, Resp,
} from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { mesValido } from '@/lib/links';
import { currentDateSP, mesLabel } from '@/lib/format';
import { addMonths } from '@/lib/previsao';
import { debitoParaSairAte, niveisMeta, tabelaMeta } from '@/lib/meta';
import { PrevisibilidadeClient } from '../components/PrevisibilidadeClient';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

const HORIZONTE_MAX = 24;

export default async function Previsibilidade({ searchParams }: { searchParams: { resp?: string; mes?: string } }) {
  const resp = resolveResp(searchParams.resp);

  // getProjecaoBase já traz saldos e compromissos manuais — não consultar de novo
  const [base, parcelados, { calib, motivo }] = await Promise.all([
    getProjecaoBase(resp),
    getCompromissosParcelados(resp),
    getCalibracaoPara(resp),
  ]);
  const projecao = computeProjecao(base, HORIZONTE_MAX);

  // meta de gasto no débito: o que mais decide "quando saio do vermelho"
  const hoje = currentDateSP();
  const debitoAtual = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
  const alvo = addMonths(hoje.slice(0, 7), 12);
  const meta = {
    debitoAtual, alvo, alvoLabel: mesLabel(alvo),
    linhas: tabelaMeta(base, hoje, niveisMeta(debitoAtual)),
    maxDebito: debitoParaSairAte(base, hoje, alvo),
  };

  return (
    <div>
      <PageTitle
        title="Previsibilidade"
        subtitle="Quanto está comprometido, até quando, e quanto dinheiro você deve ter daqui a alguns meses."
      />
      <PrevisibilidadeClient
        patrimonioAtual={base.patrimonioAtual}
        saldoContas={base.saldoContas}
        receitasAReceber={base.mesCorrente.receitasAReceber}
        projecao={projecao}
        parcelados={parcelados}
        manuais={base.compromissosManuais}
        mesFoco={mesValido(searchParams.mes)}
        calib={calib}
        motivoSemFaixa={motivo}
        meta={meta}
      />
    </div>
  );
}
