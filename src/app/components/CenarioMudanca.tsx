import { Truck } from 'lucide-react';
import { brl, mesLabel } from '@/lib/format';
import type { Mudanca } from '@/lib/previsao';
import type { resumoMudanca } from '@/lib/previsao';
import { SectionTitle } from './ui';

const CAMPO = 'mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50';

/**
 * P1 (auditoria 13/10): "e se mudarmos de cidade?" — formulário GET (o cenário fica no link e não grava nada)
 * e, com cenário, o saldo em conta no fim de cada mês sem e com a mudança.
 */
export function CenarioMudanca({ mudanca, aluguelAtual, resumo, mesMinimo, individual }: {
  mudanca: Mudanca | null;
  aluguelAtual: number | null;
  resumo: ReturnType<typeof resumoMudanca> | null;
  mesMinimo: string;
  individual: boolean;
}) {
  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Truck size={15} className="text-faint" />
        <SectionTitle>E se a gente se mudar?</SectionTitle>
      </div>
      {individual ? (
        <p className="text-sm text-muted">O cenário de mudança é da visão do casal: o aluguel é dos dois.</p>
      ) : (
        <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
          <label className="block">
            <span className="text-xs text-muted">Mês da mudança</span>
            <input type="month" name="mudanca" required min={mesMinimo} defaultValue={mudanca?.mes ?? ''} className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Moradia nova por mês</span>
            <input name="aluguel" inputMode="decimal" required placeholder={aluguelAtual ? `hoje ${brl(aluguelAtual)}` : 'Ex: 1800'}
              defaultValue={mudanca ? String(mudanca.aluguel).replace('.', ',') : ''} className={CAMPO} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Custo da mudança (uma vez)</span>
            <input name="custo" inputMode="decimal" placeholder="Ex: 4000"
              defaultValue={mudanca?.custo ? String(mudanca.custo).replace('.', ',') : ''} className={CAMPO} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="min-h-[40px] flex-1 rounded-lg bg-accent px-3 text-sm font-medium text-white">Simular</button>
            {mudanca && <a href="/simulador" className="grid min-h-[40px] place-items-center rounded-lg border border-border px-3 text-sm text-muted">Limpar</a>}
          </div>
        </form>
      )}

      {mudanca && resumo && (
        <div className="fadein mt-4">
          <p className="text-sm">
            {resumo.primeiroVermelho
              ? <>Com a mudança, <b className="text-down">{mesLabel(resumo.primeiroVermelho)}</b> fecha no vermelho.</>
              : <>Com a mudança, nenhum mês dos próximos 24 fecha no vermelho.</>}
            {resumo.mesFim && <> Em {mesLabel(resumo.mesFim)}, a conta teria <span className="tnum money">{brl(Math.abs(resumo.diferencaFim))}</span> {resumo.diferencaFim < 0 ? 'a menos' : 'a mais'} do que sem mudar.</>}
          </p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="py-1 text-left font-normal">Fim de</th>
                <th className="py-1 text-right font-normal">Sem mudar</th>
                <th className="py-1 text-right font-normal">Mudando</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {resumo.linhas.map((l) => (
                <tr key={l.mes} className={l.mes === mudanca.mes ? 'font-medium' : ''}>
                  <td className="py-1.5">{l.mesLabel}{l.mes === mudanca.mes ? ' · mudança' : ''}</td>
                  <td className={`py-1.5 text-right tnum money ${l.sem < 0 ? 'text-down' : ''}`}>{brl(l.sem)}</td>
                  <td className={`py-1.5 text-right tnum money ${l.com < 0 ? 'text-down' : ''}`}>{brl(l.com)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-faint">Saldo em conta previsto no fim de cada mês. O simulador de compra abaixo já considera a mudança.</p>
        </div>
      )}
    </div>
  );
}
