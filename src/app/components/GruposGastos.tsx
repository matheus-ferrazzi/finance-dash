'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { brl, traduzCategoria } from '@/lib/format';
import type { GrupoTela } from '@/lib/gastosTela';
import { BarraGrupos, CORES_GRUPOS } from './BarraGrupos';
import { CategoryAccordion } from './CategoryAccordion';

/** Onda 5 (Gastos): "Tudo que saiu" — barra empilhada da home, grupos com seta vs média; o grupo abre as categorias. */
export function GruposGastos({ grupos, total, titulo, hrefGrupo, periodo }: {
  grupos: GrupoTela[]; total: number; titulo: string; hrefGrupo: (nome: string) => string; periodo: React.ReactNode;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const visiveis = todos ? grupos : grupos.slice(0, 4);
  return (
    <div className="card mb-3 p-3.5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">{titulo} · <span className="tnum money">{brl(total)}</span></span>
        {periodo}
      </div>
      <BarraGrupos grupos={grupos.slice(0, CORES_GRUPOS.length).map((g) => ({ nome: g.nome, pct: pct(g.total), href: hrefGrupo(g.nome) }))} />
      {grupos.length === 0 && <p className="mt-2 text-sm text-muted">Sem gastos no período.</p>}
      <div className="mt-2 divide-y divide-border/60">
        {visiveis.map((g) => (
          <div key={g.nome}>
            <button onClick={() => setAberto(aberto === g.nome ? null : g.nome)} aria-expanded={aberto === g.nome}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 py-2 text-left">
              <span className="min-w-0">
                <span className="text-sm">{g.emoji} {g.nome}</span>
                <span className="block truncate text-[11px] text-faint">{g.cats.map(traduzCategoria).join(', ')}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-sm">
                <span className="tnum money">{brl(g.total)}</span>
                {g.seta && <span className="text-xs" title="comparado com a média dos 3 meses antes">{g.seta}</span>}
                <ChevronDown size={14} className={`text-faint transition-transform ${aberto === g.nome ? 'rotate-180' : ''}`} />
              </span>
            </button>
            {aberto === g.nome && <div className="pb-2"><CategoryAccordion grupos={g.categorias} /></div>}
          </div>
        ))}
      </div>
      {!todos && grupos.length > 4 && (
        <button onClick={() => setTodos(true)} className="mt-1 flex min-h-[40px] w-full items-center justify-between text-sm text-muted">
          <span>+ {grupos.length - 4} grupos</span>
          <span className="tnum money">{brl(grupos.slice(4).reduce((s, g) => s + g.total, 0))}</span>
        </button>
      )}
    </div>
  );
}
