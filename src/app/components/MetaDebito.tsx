import { brl, mesLabel } from '@/lib/format';
import { textoMetaAlvo } from '@/lib/meta';
import { SectionTitle } from './ui';

export interface MetaProps {
  debitoAtual: number; alvo: string; alvoLabel: string;
  linhas: { debito: number; sai: string | null }[];
  maxDebito: number | null;
}

/** Meta de gasto no débito: em que mês sai do vermelho para cada nível de gasto mensal. */
export function MetaDebito({ meta }: { meta: MetaProps }) {
  return (
    <div className="card">
      <SectionTitle>Meta de gasto no débito</SectionTitle>
      <p className="text-sm text-muted">{textoMetaAlvo(meta.maxDebito, meta.debitoAtual, meta.alvoLabel, (v) => brl(v))}</p>
      <div className="mt-3 divide-y divide-border/60 text-sm">
        {meta.linhas.map((l, i) => (
          <div key={l.debito} className="flex justify-between gap-2 py-1.5">
            <span className="text-muted"><span className="tnum money">{brl(l.debito)}</span>/mês{i === 0 ? ' (hoje)' : ''}</span>
            <span className={l.sai ? 'text-accent' : 'text-despesa'}>{l.sai ? `sai em ${mesLabel(l.sai)}` : 'não sai'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
