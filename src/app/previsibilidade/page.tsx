import {
  getProjecaoBase, computeProjecao, computeRitmo, getCalibracaoPara, getCompromissosParcelados, getMesesPassados, Resp,
} from '@/lib/queries';
import { PageTitle } from '../components/ui';
import { brl, currentDateSP, mesLabel } from '@/lib/format';
import { addMonths, diasNoMes } from '@/lib/previsao';
import { saiDoVermelho } from '@/lib/decisoes';
import { debitoParaSairAte, niveisMeta, tabelaMeta, textoMetaAlvo } from '@/lib/meta';
import { detalheMesAtual, detalheMesFuturo, detalheMesPassado, indiceDoMes, linhasDaLista } from '@/lib/mesAMes';
import { ListaMeses } from '../components/ListaMeses';
import { DetalheMes } from '../components/DetalheMes';
import { MetaDebito } from '../components/MetaDebito';
import { PrevisibilidadeClient } from '../components/PrevisibilidadeClient';

export const dynamic = 'force-dynamic';

function resolveResp(v?: string): Resp {
  return v === 'Matheus' || v === 'Ariane' ? v : 'casal';
}

const HORIZONTE_MAX = 24;

export default async function Previsibilidade({ searchParams }: { searchParams: { resp?: string; mes?: string; todos?: string } }) {
  const resp = resolveResp(searchParams.resp);
  const hoje = currentDateSP();

  // getProjecaoBase já traz saldos e compromissos manuais — não consultar de novo
  const [base, parcelados, { calib, motivo }, passados] = await Promise.all([
    getProjecaoBase(resp),
    getCompromissosParcelados(resp),
    getCalibracaoPara(resp),
    getMesesPassados(resp, hoje),
  ]);
  const projecao = computeProjecao(base, HORIZONTE_MAX);
  const ritmo = computeRitmo(base, projecao[0]);
  const linhas = linhasDaLista(projecao, passados, calib, ritmo.diasRestantes, diasNoMes(projecao[0].mes));
  const sai = saiDoVermelho(projecao, calib);

  // meta de gasto no débito: o que mais decide "quando saio do vermelho"
  const debitoAtual = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
  const alvo = addMonths(hoje.slice(0, 7), 12);
  const meta = {
    debitoAtual, alvo, alvoLabel: mesLabel(alvo),
    linhas: tabelaMeta(base, hoje, niveisMeta(debitoAtual)),
    maxDebito: debitoParaSairAte(base, hoje, alvo),
  };

  // ?mes= abre o mês; inválido ou fora da lista (3 passados .. 24 à frente) mostra a lista
  const meses = linhas.map((l) => l.mes);
  const i = indiceDoMes(linhas, searchParams.mes);
  const aberto = i >= 0 ? linhas[i] : null;

  return (
    <div>
      <PageTitle title="Previsão" subtitle="Quanto dinheiro vai ter em conta no fim de cada mês, e de onde vem cada número." />

      <div className="card mb-4">
        <p className="text-sm">
          {sai.provavel ? <>Sai do vermelho em <b>{mesLabel(sai.provavel)}</b></> : <>Não sai do vermelho nos próximos {HORIZONTE_MAX} meses</>}
          {calib && sai.piorCaso !== sai.provavel && <span className="text-muted"> (pelo pior caso, {sai.piorCaso ? mesLabel(sai.piorCaso) : `não sai nos próximos ${HORIZONTE_MAX} meses`})</span>}
        </p>
        <p className="mt-1 text-xs text-muted">{textoMetaAlvo(meta.maxDebito, meta.debitoAtual, meta.alvoLabel, (v) => brl(v))}</p>
        {!calib && (
          <p className="mt-1 text-[11px] text-faint">
            {motivo === 'visao_individual' ? 'Faixa de incerteza só na visão do casal.' : 'Sem faixa de incerteza ainda: a fase atual tem menos de 6 meses de histórico.'}
          </p>
        )}
      </div>

      {aberto ? (
        <DetalheMes
          tipo={aberto.tipo} mes={aberto.mes} resp={resp}
          anterior={meses[i - 1] ?? null} seguinte={meses[i + 1] ?? null}
          futuro={aberto.tipo === 'futuro' ? detalheMesFuturo(base, projecao[i - passados.length], parcelados) : undefined}
          atual={aberto.tipo === 'atual' ? detalheMesAtual(base, projecao[0]) : undefined}
          passado={aberto.tipo === 'passado' ? detalheMesPassado(passados[i]) : undefined}
        />
      ) : (
        <ListaMeses linhas={linhas} resp={resp} mostrarTodos={searchParams.todos === '1'} />
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetaDebito meta={meta} />
        <PrevisibilidadeClient parcelados={parcelados} manuais={base.compromissosManuais} />
      </div>
    </div>
  );
}
