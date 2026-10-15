'use client';

import Link from 'next/link';

/** Erro numa tela (banco fora, consulta que falhou): mensagem direta e tentar de novo, sem derrubar o resto do app. */
export default function Erro({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-8 max-w-md p-5 text-center">
      <p className="text-lg font-semibold">Não deu para carregar esta tela</p>
      <p className="mt-1 text-sm text-muted">Pode ser a conexão com o banco de dados. Tente de novo em alguns segundos.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={reset} className="min-h-[44px] rounded-xl bg-accent/15 px-4 text-sm font-medium text-accent">Tentar de novo</button>
        <Link href="/" className="inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm text-muted">Início</Link>
      </div>
    </div>
  );
}
