import { Fragment } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { brl, mesLabel } from '@/lib/format';
import { linkPara } from '@/lib/links';
import type { LinhaAtual, LinhaDetalhe, LinhaPassado } from '@/lib/mesAMes';

type Props = {
  tipo: 'passado' | 'atual' | 'futuro'; mes: string; resp: 'casal' | 'Matheus' | 'Ariane';
  /** meses vizinhos dentro da lista (null = não há) */
  anterior: string | null; seguinte: string | null;
  futuro?: { linhas: LinhaDetalhe[]; sobra: number; saldoFim: number };
  atual?: { linhas: LinhaAtual[]; fechaCom: number };
  passado?: { linhas: LinhaPassado[]; saldoFim: number };
};

const cor = (v: number) => (v >= 0 ? 'text-accent' : 'text-despesa');

/** Um mês aberto (F2b): de onde vem cada número. Futuro com itens; atual já × falta; passado previsto × real. */
export function DetalheMes(p: Props) {
  // '' como mês atual: o link sempre leva o mês (sem ele, a tela mostra a lista)
  const link = (m: string) => linkPara('previsao', { resp: p.resp, mes: m }, '');
  const rotulo = { passado: 'fechado', atual: 'em andamento', futuro: 'previsão' }[p.tipo];
  const seta = 'grid h-11 w-11 place-items-center rounded-lg border border-border text-muted hover:text-text';
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        {p.anterior ? <Link href={link(p.anterior)} aria-label="Mês anterior" className={seta}><ChevronLeft size={18} /></Link> : <span className="w-11" />}
        <div className="text-center">
          <div className="font-semibold">{mesLabel(p.mes)}</div>
          <div className="text-[11px] text-muted">{rotulo}</div>
        </div>
        {p.seguinte ? <Link href={link(p.seguinte)} aria-label="Próximo mês" className={seta}><ChevronRight size={18} /></Link> : <span className="w-11" />}
      </div>

      {p.futuro && (
        <div className="card p-0 divide-y divide-border/60">
          {p.futuro.linhas.map((l) => (
            <details key={l.chave} className="group px-3.5 py-2.5">
              <summary className="flex min-h-[32px] cursor-pointer list-none items-center justify-between text-sm">
                <span>{l.titulo} <span className="text-faint group-open:hidden">›</span></span>
                <span className={`tnum money ${l.chave === 'entra' ? 'text-accent' : ''}`}>{l.chave === 'entra' ? '+' : '−'}{brl(l.total)}</span>
              </summary>
              <div className="mt-2 space-y-1">
                {l.itens.length === 0 && <div className="text-xs text-faint">{l.chave === 'entra' ? 'nenhuma receita prevista' : 'nada previsto'}</div>}
                {l.itens.map((i, k) => (
                  <div key={k} className="flex justify-between gap-3 text-xs text-muted">
                    <span className="min-w-0 truncate first-letter:uppercase">{i.nome}{i.nota ? <span className="text-faint"> · {i.nota}</span> : null}</span>
                    <span className="shrink-0 tnum money">{brl(i.valor)}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
          <div className="flex justify-between px-3.5 py-2.5 text-sm font-semibold"><span>Sobra do mês</span><span className={`tnum money ${cor(p.futuro.sobra)}`}>{brl(p.futuro.sobra)}</span></div>
          <div className="flex justify-between px-3.5 py-2.5 text-sm"><span>Saldo no fim</span><span className={`tnum money font-medium ${cor(p.futuro.saldoFim)}`}>{brl(p.futuro.saldoFim)}</span></div>
        </div>
      )}

      {p.atual && (
        <div className="card">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-2 text-sm">
            <span /><span className="text-right text-[11px] text-muted">Já aconteceu</span><span className="text-right text-[11px] text-muted">Ainda falta</span>
            {p.atual.linhas.map((l) => (
              <Fragment key={l.chave}>
                <span>{l.titulo}</span>
                <span className="text-right tnum money text-muted">{brl(l.jaAconteceu)}</span>
                <span className="text-right tnum money">{brl(l.aindaFalta)}</span>
              </Fragment>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm font-semibold">
            <span>Fecha com</span><span className={`tnum money ${cor(p.atual.fechaCom)}`}>{brl(p.atual.fechaCom)}</span>
          </div>
        </div>
      )}

      {p.passado && (
        <div className="card">
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-2 text-sm">
            <span /><span className="text-right text-[11px] text-muted">Previsto</span><span className="text-right text-[11px] text-muted">Real</span><span className="text-right text-[11px] text-muted">Diferença</span>
            {p.passado.linhas.map((l) => (
              <Fragment key={l.chave}>
                <span className={l.chave === 'saldo' ? 'font-semibold' : ''}>{l.titulo}</span>
                <span className="text-right tnum money text-muted">{brl(l.previsto)}</span>
                <span className="text-right tnum money">{brl(l.real)}</span>
                <span className="text-right tnum money text-faint">{brl(l.diferenca)}</span>
              </Fragment>
            ))}
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-2 text-sm">
            <span>Saldo no fim</span><span className={`tnum money font-medium ${cor(p.passado.saldoFim)}`}>{brl(p.passado.saldoFim)}</span>
          </div>
          <div className="mt-2 flex gap-4 text-xs">
            <Link className="text-accent" href={linkPara('gastos', { resp: p.resp, mes: p.mes }, '')}>ver gastos do mês</Link>
            <Link className="text-accent" href={linkPara('faturas', { resp: p.resp })}>ver faturas</Link>
          </div>
        </div>
      )}

      <Link href={linkPara('previsao', { resp: p.resp })} className="mt-3 block py-2 text-center text-xs text-accent">voltar à lista</Link>
    </div>
  );
}
