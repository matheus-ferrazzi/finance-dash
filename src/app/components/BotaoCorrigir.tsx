'use client';

import { useState, type ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { FolhaCategoria } from './FolhaCategoria';

/** Envolve uma linha de lançamento: tocar abre a folha "Mudar categoria" (F4). */
export function BotaoCorrigir({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-label="Mudar categoria"
        className={`flex w-full min-h-[44px] items-center gap-2 text-left hover:bg-surface-3/40 ${className}`}>
        <span className="min-w-0 flex-1">{children}</span>
        <Pencil size={13} className="shrink-0 text-faint" />
      </button>
      {aberto && <FolhaCategoria id={id} onFechar={() => setAberto(false)} />}
    </>
  );
}
