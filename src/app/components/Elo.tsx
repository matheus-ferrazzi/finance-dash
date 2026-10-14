import Link from 'next/link';

/** Onda 5: a faixa que leva para a tela relacionada (crédito → faturas, contas → previsão…). */
export function Elo({ href, acao, children }: { href: string; acao: string; children: React.ReactNode }) {
  return (
    <Link href={href}
      className="mb-3 flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-dashed border-line bg-surface px-3.5 py-2.5 text-xs text-muted transition-colors hover:text-text">
      <span>{children}</span>
      <span className="shrink-0 text-accent">{acao} ›</span>
    </Link>
  );
}
