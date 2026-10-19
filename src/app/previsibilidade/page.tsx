import {
  getProjecaoBase, computeProjecao, computeRitmo, fotografarPrevisto, getCalibracaoPara, getCompromissosParcelados, getMesesPassados, Resp,
} from '@/lib/queries';
import { linkPara } from '@/lib/links';
import { serieSaida } from '@/lib/saida';
import { CardResposta } from '../components/CardResposta';
import { Elo } from '../components/Elo';
import { GraficoSaida } from '../components/GraficoSaida';
import { brl, currentDateSP, mesLabel } from '@/lib/format';
import { addMonths, avisosDeCadastro, diasNoMes } from '@/lib/previsao';
import { mancheteSaida, saiDoVermelho } from '@/lib/decisoes';
import { debitoParaSairAte, niveisMeta, projecaoComDebito, tabelaMeta } from '@/lib/meta';
import { detalheMesAtual, detalheMesFuturo, detalheMesPassado, indiceDoMes, linhasDaLista, notaVisaoIndividual, semPassadosSeFalhar } from '@/lib/mesAMes';
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

  // N15: primeira abertura no mês tira a foto do previsto do mês (se o resumo do dia 1 ainda não tirou)
  await fotografarPrevisto(resp, hoje.slice(0, 7)).catch((e) => console.error('foto do previsto falhou', e));
  // getProjecaoBase já traz saldos e compromissos manuais — não consultar de novo
  const [base, parcelados, { calib, motivo }, passados] = await Promise.all([
    getProjecaoBase(resp),
    getCompromissosParcelados(resp),
    getCalibracaoPara(resp),
    semPassadosSeFalhar(getMesesPassados(resp, hoje)),
  ]);
  const projecao = computeProjecao(base, HORIZONTE_MAX);
  const ritmo = computeRitmo(base, projecao[0]);
  const linhas = linhasDaLista(projecao, passados, calib, ritmo.diasRestantes, diasNoMes(projecao[0].mes));
  const sai = saiDoVermelho(projecao, calib);
  const manchete = mancheteSaida(sai, !!calib, passados.map((m) => ({ previsto: m.previsto.saldo, real: m.real.saldo })), HORIZONTE_MAX);

  // meta de gasto no débito: o que mais decide "quando saio do vermelho"
  const debitoAtual = base.despesaVariavelMediaMensal + (base.despesaFixaDebitoMedia ?? 0);
  const alvo = addMonths(hoje.slice(0, 7), 12);
  const ultimo = passados[passados.length - 1];
  const meta = {
    debitoAtual, alvo, alvoLabel: mesLabel(alvo),
    linhas: tabelaMeta(base, hoje, niveisMeta(debitoAtual)),
    maxDebito: debitoParaSairAte(base, hoje, alvo),
    ultimoMes: ultimo ? { label: mesLabel(ultimo.mes), valor: ultimo.real.debito } : undefined,
  };

  // ?mes= abre o mês; inválido ou fora da lista (3 passados .. 24 à frente) mostra a lista
  const meses = linhas.map((l) => l.mes);
  const i = indiceDoMes(linhas, searchParams.mes);
  const aberto = i >= 0 ? linhas[i] : null;

  // Onda 5: a linha "com a meta" — só no casal e só quando a meta pede menos que a média de hoje
  const comMeta = resp === 'casal' && meta.maxDebito !== null && meta.maxDebito < meta.debitoAtual
    ? projecaoComDebito(base, meta.maxDebito, hoje) : null;
  const pontos = serieSaida(passados.map((m) => ({ mes: m.mes, saldoFim: m.saldoFim })), projecao, comMeta);
  const textoMeta = meta.maxDebito === null
    ? <>Nem zerando o débito sai do vermelho até {meta.alvoLabel}.</>
    : meta.maxDebito >= meta.debitoAtual
      ? <>No ritmo de hoje (<span className="money">{brl(Math.round(meta.debitoAtual))}</span>/mês no débito) já sai até {meta.alvoLabel}.</>
      : <>Com até <b className="money text-accent">{brl(meta.maxDebito)}/mês</b> no débito (hoje <span className="money">{brl(Math.round(meta.debitoAtual))}</span>), sai em {meta.alvoLabel}.</>;

  return (
    <div>
      {/* desktop: o gráfico à esquerda; a meta, o mês a mês e o simulador à direita (no celular, a mesma ordem de cima para baixo) */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
        <div>
          {/* Onda 5: "Quando a gente sai do vermelho, e o que mudar pra isso?" */}
          <CardResposta pergunta="Saindo do vermelho" dinheiro={false} tom={manchete.tom} valor={manchete.valor}
            apoio={<>
              {textoMeta}
              {calib && sai.piorCaso !== sai.provavel && <> Pelo pior caso, {sai.piorCaso ? mesLabel(sai.piorCaso) : `não sai em ${HORIZONTE_MAX} meses`}.</>}
              {notaVisaoIndividual(resp) && <span className="mt-1 block text-[11px] text-faint">{notaVisaoIndividual(resp)}</span>}
              {!calib && manchete.erro && (
                <span className="mt-1 block text-[11px] text-muted">
                  {manchete.erro.lado === 'misto'
                    ? <>Nos últimos {manchete.erro.n} meses fechados, a previsão do mês errou em média <span className="money">{brl(manchete.erro.medio)}</span>, para os dois lados.</>
                    : <>Nos últimos {manchete.erro.n} meses fechados, sobrou em média <span className="money">{brl(manchete.erro.medio)}</span> {manchete.erro.lado === 'pessimista' ? 'a mais' : 'a menos'} que o previsto{manchete.erro.lado === 'pessimista' ? ' (fatura parcelada também faz sobrar no mês e volta depois)' : ''}.</>}
                </span>
              )}
              {!calib && (
                <span className="mt-1 block text-[11px] text-faint">
                  {motivo === 'visao_individual' ? 'Faixa de incerteza só na visão do casal.' : 'Sem faixa de incerteza: ela precisa de 6 meses da fase atual e de acertar entre 70% e 90% deles no teste contra o passado.'}
                </span>
              )}
            </>}>
            <GraficoSaida pontos={pontos} />
          </CardResposta>
        </div>
        <div>
          <div className="mb-3"><MetaDebito meta={meta} /></div>

          {aberto ? (
            <DetalheMes
              tipo={aberto.tipo} mes={aberto.mes} resp={resp}
              anterior={meses[i - 1] ?? null} seguinte={meses[i + 1] ?? null}
              futuro={aberto.tipo === 'futuro' ? detalheMesFuturo(base, projecao[i - passados.length], parcelados) : undefined}
              atual={aberto.tipo === 'atual' ? detalheMesAtual(base, projecao[0]) : undefined}
              passado={aberto.tipo === 'passado' ? detalheMesPassado(passados[i]) : undefined}
            />
          ) : (
            <details open={searchParams.todos === '1'} className="mb-3">
              <summary className="card flex min-h-[44px] cursor-pointer items-center p-3.5 text-sm text-accent">Mês a mês ({linhas.length} meses) ›</summary>
              <div className="mt-2"><ListaMeses linhas={linhas} resp={resp} mostrarTodos={searchParams.todos === '1'} /></div>
            </details>
          )}

          <Elo href={linkPara('simulador', { resp })} acao="simular">E se a gente se mudar, ou comprar algo grande?</Elo>
        </div>
      </div>

      <div className="mt-4">
        <PrevisibilidadeClient parcelados={parcelados} manuais={base.compromissosCadastrados}
          avisos={avisosDeCadastro(base.compromissosCadastrados, base.mesCorrente.casaNoMesCasalPorCategoria ?? base.mesCorrente.casaNoMesPorCategoria, hoje.slice(0, 7))} />
      </div>
    </div>
  );
}
