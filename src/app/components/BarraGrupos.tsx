import Link from 'next/link';

// Barra "Para onde vai" da home: cada pedaço é o link do seu grupo (F1: antes só os nomes eram links).
export const CORES_GRUPOS = ['bg-[#7c8cff]', 'bg-accent', 'bg-warn'];

export function BarraGrupos({ grupos }: { grupos: { nome: string; pct: number; href: string }[] }) {
  return (
    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-3">
      {grupos.map((g, i) => (
        <Link key={g.nome} href={g.href} aria-label={`${g.nome}, ${g.pct}%`} className={CORES_GRUPOS[i]} style={{ width: `${g.pct}%` }} />
      ))}
    </div>
  );
}
