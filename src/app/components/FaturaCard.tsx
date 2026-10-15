'use client';

import { useState } from 'react';
import { ChevronDown, Info, CalendarClock } from 'lucide-react';
import { brl, dataBR, diasAte, traduzCategoria } from '@/lib/format';
import { respBadge, Progress, catIcon } from './ui';
import { ROTULO_SITUACAO, type UltimaFatura } from '@/lib/faturas';

// data de hoje em São Paulo (o card é client component: não pode importar queries/db)
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export interface FaturaItem {
  id: string; data: string; valor: number; descricao: string; categoria: string;
}
export interface FaturaView {
  id: string; banco: string; responsavel: string;
  /** a última fatura fechada (histórico), com situação — N4 */
  ultima: UltimaFatura | null;
  limite: number; disponivel: number; fechamento: string | null;
  cicloLabel: string; soma: number; items: FaturaItem[];
  proxSoma: number; proxLabel: string;
  /** P3: a lista é da fatura que já fechou (link com ciclo), não do ciclo em curso */
  cicloFechado?: boolean;
}

const TOM_SITUACAO: Record<UltimaFatura['situacao'], string> = {
  paga: 'text-up', a_vencer: 'text-warn', parcelada: 'text-muted', atrasada: 'text-down',
};

/** compacto (Onda 5, tela Faturas): sem vencimento, valor e próxima fatura — a linha do tempo já mostra; fica o limite e as compras */
export function FaturaCard({ f, abertoInicial = false, compacto = false }: { f: FaturaView; abertoInicial?: boolean; compacto?: boolean }) {
  const [open, setOpen] = useState(abertoInicial);
  const usado = f.limite > 0 ? f.limite - f.disponivel : 0;
  const u = f.ultima;
  const d = u ? diasAte(u.vencimento) : null;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{f.banco}</span>{respBadge(f.responsavel)}
        </div>
        {compacto ? (
          f.limite > 0 && <span className={`text-xs tnum ${usado / f.limite >= 0.8 ? 'text-warn' : 'text-muted'}`}>{Math.round((usado / f.limite) * 100)}% do limite</span>
        ) : <span className="text-xs text-muted">
          {u ? `${u.vencimento >= hojeISO() ? 'vence' : 'venceu'} ${dataBR(u.vencimento)}` : 'sem fatura fechada'}{d != null && d >= 0 ? ` · ${d}d` : ''}
        </span>}
      </div>

      {!compacto && <>
      <div className="mt-3 text-2xl font-semibold tnum money">{u ? brl(u.total) : '—'}</div>
      <div className="text-xs text-muted">
        última fatura{u && <> · <span className={TOM_SITUACAO[u.situacao]}>{ROTULO_SITUACAO[u.situacao]}</span></>}
        {u && u.falta > 0 && <> · falta <span className="tnum">{brl(u.falta)}</span></>}
      </div>

      {f.proxSoma > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock size={13} className="text-faint" />
            <span>Próxima fatura (parcial)</span>
          </div>
          <span className="tnum money text-sm font-medium">{brl(f.proxSoma)}</span>
        </div>
      )}
      </>}

      {f.limite > 0 && (
        <div className={compacto ? "mt-3" : "mt-4"}>
          <div className="flex justify-between text-xs text-muted mb-1.5">
            <span>Limite usado</span><span className="tnum">{brl(usado)} / {brl(f.limite)}</span>
          </div>
          <Progress value={usado} teto={f.limite} />
          <div className="mt-1 text-xs text-faint">disponível {brl(f.disponivel)}</div>
        </div>
      )}

      <button
        onClick={() => setOpen(!open)}
        className="mt-4 flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-muted hover:text-text hover:bg-surface-3 transition-colors"
      >
        <span>Ver compras {f.cicloFechado ? 'da fatura fechada' : 'do ciclo atual'}{f.items.length ? ` (${f.items.length})` : ''}</span>
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="fadein mt-2">
          <div className="flex items-start gap-1.5 rounded-lg bg-warn/10 px-2.5 py-2 text-[11px] text-warn/90 leading-relaxed">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Compras de crédito registradas no ciclo{f.cicloLabel ? ` (${f.cicloLabel})` : ''}. A soma
              (<b>{brl(f.soma)}</b>) pode diferir do valor da fatura por causa de parcelas e do prazo de sincronização do banco.
            </span>
          </div>

          <div className="mt-1 divide-y divide-border/60">
            {f.items.length === 0 && <p className="py-3 text-sm text-muted">Nenhuma compra de crédito registrada neste ciclo.</p>}
            {f.items.map((it) => {
              const { Icon, color } = catIcon(it.categoria);
              return (
                <div key={it.id} className="flex items-center gap-3 py-2.5">
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-3 ${color}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{it.descricao || traduzCategoria(it.categoria)}</div>
                    <div className="text-xs text-faint">{dataBR(it.data)} · {traduzCategoria(it.categoria)}</div>
                  </div>
                  <span className="tnum text-sm shrink-0">{brl(it.valor)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
