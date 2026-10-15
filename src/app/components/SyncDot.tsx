import Link from 'next/link';
import { corDaSincronizacao, textoHoras } from '@/lib/format';

/** Onda 5: no celular, a sincronização é uma bolinha (verde/âmbar/vermelha); o toque abre o Diagnóstico. */
export function SyncDot({ status }: { status: { oldestH: number; conns: unknown[] } }) {
  if (!status.conns.length) return null;
  const cor = { bom: 'bg-accent', atencao: 'bg-warn', ruim: 'bg-despesa' }[corDaSincronizacao(status.oldestH)];
  const texto = textoHoras(status.oldestH);
  return (
    <Link href="/diagnostico" aria-label={`Sincronização: ${texto}. Abrir diagnóstico.`} title={texto}
      className="grid h-9 w-5 shrink-0 place-items-center">
      <span className={`h-2.5 w-2.5 rounded-full ${cor}`} />
    </Link>
  );
}
