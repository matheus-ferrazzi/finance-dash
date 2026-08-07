'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

export function SearchBox({ initial }: { initial: string }) {
  const [val, setVal] = useState(initial);
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      const q = val.trim();
      if (q) params.set('q', q);
      else params.delete('q');
      const s = params.toString();
      start(() => router.replace(path + (s ? `?${s}` : '')));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val]);

  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
        placeholder="Buscar por descrição (ex: netflix, uber, mercado)…"
        className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-9 text-sm outline-none placeholder:text-faint focus:border-accent/50"
      />
      {val && (
        <button
          onClick={() => setVal('')}
          aria-label="Limpar"
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-text ${pending ? 'animate-pulse' : ''}`}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
