import Link from 'next/link';
import { Gauge } from 'lucide-react';
import { brl } from '@/lib/format';
import type { Ritmo } from '@/lib/queries';

/**
 * "Quanto cabe gastar hoje" — a única pergunta que o app responde e que muda
 * a decisão de hoje. O Diagnóstico conta a história depois que o mês fechou;
 * esta faixa avisa enquanto ainda dá pra mudar o final.
 *
 * Fica acima de tudo porque é o número que justifica abrir o app.
 */
export function RitmoHoje({ ritmo, mesLabel, href }: { ritmo: Ritmo; mesLabel: string; href: string }) {
  const { ritmoSeguroDia, ritmoAtualDia, diasRestantes, fechaCom } = ritmo;

  // fim de mês: não sobra dia pra distribuir, então a faixa não diz nada útil
  if (diasRestantes <= 0) return null;

  const acima = ritmoAtualDia > ritmoSeguroDia;
  const excedente = ritmoSeguroDia > 0 ? Math.round(((ritmoAtualDia - ritmoSeguroDia) / ritmoSeguroDia) * 100) : 0;
  const preenchido = ritmoSeguroDia > 0 ? Math.min((ritmoAtualDia / ritmoSeguroDia) * 100, 100) : 100;

  return (
    <Link href={href} className="mb-4 block">
      <div
        className={`card border transition-colors hover:bg-surface-2/40 ${
          acima ? 'border-despesa/30' : 'border-accent/30'
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <Gauge size={15} className={acima ? 'text-despesa' : 'text-accent'} />
            <span className="text-xs text-muted">Dá pra gastar hoje</span>
          </div>
          <span className="text-[11px] text-faint">
            {diasRestantes} {diasRestantes === 1 ? 'dia restante' : 'dias restantes'} em {mesLabel}
          </span>
        </div>

        <div className={`mt-1 text-2xl font-semibold tnum money ${acima ? 'text-despesa' : 'text-accent'}`}>
          {brl(ritmoSeguroDia)}
        </div>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full ${acima ? 'bg-despesa' : 'bg-accent'}`}
            style={{ width: `${preenchido}%` }}
          />
        </div>

        <p className="mt-2 text-xs text-muted">
          Você vem gastando <b className="tnum money text-text">{brl(ritmoAtualDia)}</b> por dia
          {acima ? (
            <>
              {' '}— <b className="text-despesa">{excedente}% acima</b>. Nesse ritmo o mês fecha em{' '}
              <b className="tnum money text-despesa">{brl(fechaCom)}</b>.
            </>
          ) : (
            <> — dentro do que cabe. Mantendo assim, o mês fecha em{' '}
              <b className="tnum money text-accent">{brl(fechaCom)}</b>.
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
