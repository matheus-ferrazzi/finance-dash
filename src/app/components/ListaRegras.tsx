'use client';

import { traduzCategoria } from '@/lib/format';
import type { RegraListada } from '@/lib/queries';

const TIPO = { lancamento: 'Só um lançamento', doc: 'Pessoa/empresa', texto: 'Texto' } as const;

/** Tela Regras (F4): o que foi corrigido pelo painel; apagar devolve os lançamentos. */
export function ListaRegras({ regras }: { regras: RegraListada[] }) {
  async function apagar(r: RegraListada) {
    if (!confirm(`Apagar? Os lançamentos voltam para a categoria do banco (ou de outra regra que ainda valha).`)) return;
    await fetch(`/api/categorias/${r.id}`, { method: 'DELETE' });
    // apagar é raro: recarregar a página é simples e não exige o router montado
    window.location.reload();
  }
  if (regras.length === 0) {
    return <div className="card text-sm text-muted">Nenhuma regra criada pelo painel ainda. Toque num lançamento em Gastos ou Buscar para corrigir.</div>;
  }
  return (
    <div className="card divide-y divide-border/60 p-0">
      {regras.map((r) => (
        <div key={r.id} className="flex min-h-[56px] items-center justify-between gap-3 px-3.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm">{r.nome}</div>
            <div className="text-[11px] text-muted">{`${TIPO[r.tipo]} → ${traduzCategoria(r.categoria)} · ${r.afetados} lançamentos · ${r.criadoEm}`}</div>
          </div>
          <button type="button" onClick={() => apagar(r)} className="min-h-[44px] shrink-0 px-2 text-xs text-despesa">Apagar</button>
        </div>
      ))}
    </div>
  );
}
