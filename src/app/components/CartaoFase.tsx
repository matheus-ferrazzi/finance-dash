import Link from 'next/link';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { DadosTrilha, Fase, Trilha } from '@/lib/trilha';

type Props = { fase: Fase; trilha: Trilha } & Pick<DadosTrilha, 'dividas' | 'atrasos' | 'gastoTravado' | 'aplicacaoMensal'>;
const ROTULO = { cumprida: '✓ cumprida', atual: 'agora', depois: 'depois' } as const;

/** Uma fase da trilha (F3) com o detalhe que a sustenta. */
export function CartaoFase({ fase, trilha, dividas, atrasos, gastoTravado, aplicacaoMensal }: Props) {
  const r = trilha.reserva;
  const fracao = r.meta > 0 ? Math.min(1, r.aplicado / r.meta) : 1;
  return (
    <div className={`card mb-3 ${fase.status === 'atual' ? 'border-warn/60' : ''}`}>
      <div className="flex items-center justify-between">
        <b className="text-sm">{`${fase.n} · ${fase.titulo}`}</b>
        <span className={`text-[11px] ${fase.status === 'cumprida' ? 'text-accent' : fase.status === 'atual' ? 'text-warn' : 'text-muted'}`}>{ROTULO[fase.status]}</span>
      </div>
      {fase.quando && <div className="mt-1 text-xs text-muted">{`Quando: ${fase.quando}`}</div>}

      {fase.n === 1 && (
        <div className="mt-2 space-y-1 text-xs">
          {dividas.length === 0 && <div className="text-muted">Nenhuma dívida em aberto.</div>}
          {dividas.map((d) => (
            <div key={`${d.nome}|${d.banco}`} className="flex flex-wrap justify-between gap-x-3">
              <span className="min-w-0 first-letter:uppercase">{d.nome} <span className="text-faint">· {d.banco}</span></span>
              <span className="shrink-0 text-muted">
                <span className="tnum money">{brl(d.valorParcela)}</span>
                {d.restantes === null ? ' · sem data de fim' : ` · faltam ${d.restantes} · até ${mesLabel(d.fim!)}`}
              </span>
            </div>
          ))}
          {atrasos.map((a) => (
            <div key={`${a.mes}|${a.motivo}`} className="text-despesa">{`${a.motivo === 'juros' ? 'juros de atraso' : 'conta negativa'} em ${mesLabel(a.mes)}`}</div>
          ))}
        </div>
      )}

      {fase.n === 2 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {trilha.sobra.meses.length === 0 && <span className="text-muted">Ainda não há meses fechados.</span>}
          {trilha.sobra.meses.map((m) => (
            <Link key={m.mes} href={linkPara('previsao', { mes: m.mes }, '')} className={`inline-flex min-h-[40px] items-center ${m.sobra >= 0 ? 'text-accent' : 'text-despesa'}`}>
              {`${mesLabel(m.mes)} ${m.sobra >= 0 ? '✓' : '✗'} `}<span className="tnum money">{brl(m.sobra)}</span>
            </Link>
          ))}
        </div>
      )}

      {fase.n === 3 && (
        <div className="mt-2 text-xs">
          <div className="flex justify-between">
            <span className="tnum money">{brl(r.aplicado)}</span>
            <span className="text-muted">meta <span className="tnum money">{brl(r.meta)}</span></span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fracao * 100)} className="mt-1 h-1.5 overflow-hidden rounded bg-surface-3">
            <i className="block h-full bg-accent" style={{ width: `${fracao * 100}%` }} />
          </div>
          <div className="mt-1 text-faint">
            6 × gasto travado: fixos <span className="tnum money">{brl(gastoTravado.fixos)}</span> + casa <span className="tnum money">{brl(gastoTravado.casa)}</span> + contas travadas <span className="tnum money">{brl(gastoTravado.debitoTravado)}</span>
          </div>
          {aplicacaoMensal.length > 0 && (
            <div className="mt-1 text-faint">
              aplicado por mês: {aplicacaoMensal.map((m, i) => <span key={m.mes}>{`${i ? ' · ' : ''}${mesLabel(m.mes)} `}<span className="tnum money">{brl(m.valor)}</span></span>)}
            </div>
          )}
        </div>
      )}

      {fase.n === 4 && (
        <div className="mt-2 text-xs text-muted">
          {`${Math.round(trilha.patrimonio.pct * 100)}% da renda aplicada (meta ${Math.round(trilha.patrimonio.meta * 100)}%) · total aplicado `}<span className="tnum money">{brl(r.aplicado)}</span>
        </div>
      )}

      <div className="mt-2 text-xs">{fase.proximoPasso}</div>
    </div>
  );
}
