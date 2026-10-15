import { brl, mesLabel } from '@/lib/format';
import { SectionTitle } from './ui';

export interface MetaProps {
  debitoAtual: number; alvo: string; alvoLabel: string;
  linhas: { debito: number; sai: string | null }[];
  maxDebito: number | null;
  /** N16: o débito do último mês fechado, para dizer se o corte já está acontecendo */
  ultimoMes?: { label: string; valor: number };
}

/** Meta de gasto no débito: em que mês sai do vermelho para cada nível de gasto mensal. */
export function MetaDebito({ meta }: { meta: MetaProps }) {
  return (
    <div className="card">
      <SectionTitle>Meta de gasto no débito</SectionTitle>
      {/* Onda 5: a meta em si está no topo da Previsão; aqui só o que o topo não diz — o último mês contra ela (N16) */}
      {meta.ultimoMes && meta.maxDebito !== null && (
        <p className="text-sm text-muted">
          Em {meta.ultimoMes.label} foram <span className="tnum money">{brl(Math.round(meta.ultimoMes.valor))}</span>
          {Math.round(meta.ultimoMes.valor) <= meta.maxDebito ? ': dentro da meta, é manter.' : ', acima da meta.'}
        </p>
      )}
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
