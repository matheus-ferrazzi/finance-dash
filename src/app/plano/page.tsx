import { getContaDoPlano, getReferenciaDoPlano } from '@/lib/queries';
import { brl, currentDateSP, mesLabel } from '@/lib/format';
import { GRUPOS_COM_TETO, metaDoGrupo } from '@/lib/plano';
import { addMonths } from '@/lib/previsao';
import { CardResposta } from '../components/CardResposta';
import { Elo } from '../components/Elo';
import { PlanoForm } from '../components/PlanoForm';

export const dynamic = 'force-dynamic';

const M = ({ v }: { v: number }) => <span className="tnum money">{brl(v)}</span>;

/**
 * 13/11/2026 (plano realista): o plano do casal — os tetos do dia a dia por grupo (débito + crédito), em degraus, e a
 * conta que diz em que mês deixa de faltar dinheiro só com o que entra todo mês. Sempre do casal.
 */
export default async function PlanoPagina() {
  const hoje = currentDateSP();
  const [c, ref] = await Promise.all([getContaDoPlano(hoje), getReferenciaDoPlano(hoje)]);
  const refLinha = (
    <div className="mt-2 space-y-1 text-xs text-muted">
      <div className="text-faint">{`Referência: ${ref.meses.map(mesLabel).join(', ')} (débito e crédito juntos)`}</div>
      {GRUPOS_COM_TETO.map((g) => (
        <div key={g} className="flex justify-between gap-2">
          <span>{g}</span>
          <span>média <M v={ref.media[g] ?? 0} /> · menor mês <M v={ref.menor[g] ?? 0} /></span>
        </div>
      ))}
    </div>
  );

  if (!c) {
    return (
      <div>
        <CardResposta pergunta="O plano" valor="ainda não montado" dinheiro={false} tom="atencao"
          apoio="O plano são os tetos do dia a dia por grupo, alcançados em degraus. Com ele, a meta do mês e os avisos do Zeca passam a medir o total, no débito e no crédito." />
        <div className="card mb-3">
          <b className="text-sm">Escolher os tetos</b>
          {refLinha}
          <div className="mt-3"><PlanoForm tetos={{}} degraus={3} temPlano={false} /></div>
        </div>
      </div>
    );
  }

  const { plano, conta, entrada } = c;
  const primeiro = conta.meses[0];
  const degraus = Array.from({ length: Math.max(1, plano.degraus) }, (_, i) => addMonths(plano.inicio, i));
  const fecha = conta.paraDeFaltar;
  return (
    <div className="md:grid md:grid-cols-2 md:items-start md:gap-4">
      <div>
        <CardResposta pergunta="Quando deixa de faltar dinheiro?" dinheiro={false} tom={fecha ? 'bom' : 'ruim'}
          valor={fecha ? (fecha === primeiro.mes ? `já em ${mesLabel(fecha)}` : mesLabel(fecha)) : 'não fecha com estes tetos'}
          apoio={<>
            Só com o que entra todo mês (<M v={entrada.piso} />).
            {!fecha && conta.faltaNoMelhorMes !== null && <> No mês mais folgado ainda faltam <M v={conta.faltaNoMelhorMes} />.</>}
            {entrada.extras > 0 && (
              <span className="mt-1 block">
                Com os extras de sempre (<M v={entrada.extras} /> por mês, pela mediana):{' '}
                {conta.paraDeFaltarComExtras ? (conta.paraDeFaltarComExtras === primeiro.mes ? 'sobra desde o primeiro mês.' : `deixa de faltar em ${mesLabel(conta.paraDeFaltarComExtras)}.`) : 'ainda não fecha.'}
              </span>
            )}
          </>} />

        <div className="card mb-3">
          <b className="text-sm">{`A conta de ${mesLabel(primeiro.mes)}`}</b>
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between"><span>Entra (piso)</span><M v={entrada.piso} /></div>
            <div className="flex justify-between text-muted"><span>Casa</span><M v={-entrada.casa} /></div>
            <div className="flex justify-between text-muted"><span>Consórcio, seguro e imposto</span><M v={-entrada.travados} /></div>
            <div className="flex justify-between text-muted"><span>Parcelas das dívidas em dia</span><M v={-primeiro.parcelas} /></div>
            <div className="flex justify-between text-muted"><span>Dia a dia do plano</span><M v={-primeiro.diaADia} /></div>
            <div className={`flex justify-between border-t border-border pt-1 font-medium ${primeiro.sobra >= 0 ? 'text-accent' : 'text-despesa'}`}>
              <span>Sobra do mês</span><M v={primeiro.sobra} />
            </div>
          </div>
        </div>

        <details className="card mb-3">
          <summary className="cursor-pointer text-sm font-medium">Mês a mês</summary>
          <div className="mt-2 space-y-1 text-xs">
            {conta.meses.slice(0, 24).map((m) => (
              <div key={m.mes} className="flex justify-between gap-2">
                <span className="text-muted">{mesLabel(m.mes)}</span>
                <span>
                  <span className={m.sobra >= 0 ? 'text-accent' : 'text-despesa'}><M v={m.sobra} /></span>
                  {entrada.extras > 0 && <span className="text-faint"> · com extras <M v={m.sobraComExtras} /></span>}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>

      <div>
        <div className="card mb-3">
          <b className="text-sm">Tetos do dia a dia</b>
          <div className="mt-1 text-xs text-faint">{`Começa em ${mesLabel(plano.inicio)}${plano.degraus > 1 ? `, em ${plano.degraus} degraus` : ''}. Débito e crédito juntos.`}</div>
          <div className="mt-2 space-y-2 text-xs">
            {GRUPOS_COM_TETO.map((g) => (
              <div key={g}>
                <div className="flex justify-between"><span>{g}</span><span>teto <M v={plano.tetos[g].teto} /></span></div>
                <div className="text-muted">
                  {plano.tetos[g].base <= plano.tetos[g].teto
                    ? <>já gasta menos que o teto (média de <M v={plano.tetos[g].base} />)</>
                    : <>da média de <M v={plano.tetos[g].base} />: {degraus.map((m, i) => <span key={m}>{`${i ? ' · ' : ''}${mesLabel(m)} `}<M v={metaDoGrupo(plano.tetos[g], plano, m)!} /></span>)}</>}
                </div>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1 text-muted">
              <span>Saúde, pet, transporte e resto (pela média)</span><M v={entrada.semTeto} />
            </div>
          </div>
        </div>

        <div className="card mb-3">
          <b className="text-sm">Ajustar</b>
          {refLinha}
          <div className="mt-3">
            <PlanoForm tetos={Object.fromEntries(GRUPOS_COM_TETO.map((g) => [g, plano.tetos[g].teto]))} degraus={plano.degraus} temPlano />
          </div>
        </div>
        <Elo href="/trilha" acao="ver a trilha">O plano é o que move a fase 1: parar de criar dívida.</Elo>
      </div>
    </div>
  );
}
