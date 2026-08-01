'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { LayoutDashboard, Receipt, Target, CreditCard, TrendingUp, Home } from 'lucide-react';

const LINKS = [
  { href: '/', label: 'Visão geral', short: 'Visão', icon: LayoutDashboard },
  { href: '/gastos', label: 'Gastos', short: 'Gastos', icon: Receipt },
  { href: '/orcamento', label: 'Orçamento', short: 'Orçam.', icon: Target },
  { href: '/casa', label: 'Casa', short: 'Casa', icon: Home },
  { href: '/faturas', label: 'Faturas', short: 'Faturas', icon: CreditCard },
  { href: '/investimentos', label: 'Investimentos', short: 'Invest.', icon: TrendingUp },
];

const RESPS = [
  { key: 'casal', label: 'Casal', dot: 'bg-accent' },
  { key: 'Matheus', label: 'Matheus', dot: 'bg-matheus' },
  { key: 'Ariane', label: 'Ariane', dot: 'bg-ariane' },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  return (
    <nav className="flex flex-col gap-1">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href + (qs ? `?${qs}` : '')}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
              active ? 'bg-surface-2 text-text font-medium' : 'text-muted hover:text-text hover:bg-surface-2/50'
            }`}
          >
            <Icon size={18} className={active ? 'text-accent' : 'text-faint'} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {LINKS.map(({ href, short, icon: Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href + (qs ? `?${qs}` : '')}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <Icon size={19} />
            {short}
          </Link>
        );
      })}
    </nav>
  );
}

export function RespToggle() {
  const path = usePathname();
  const sp = useSearchParams();
  const router = useRouter();
  const resp = sp.get('resp') ?? 'casal';

  function set(key: string) {
    const params = new URLSearchParams(Array.from(sp.entries()));
    if (key === 'casal') params.delete('resp');
    else params.set('resp', key);
    const s = params.toString();
    router.push(path + (s ? `?${s}` : ''));
  }

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {RESPS.map((r) => (
        <button
          key={r.key}
          onClick={() => set(r.key)}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors ${
            resp === r.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${r.dot}`} />
          {r.label}
        </button>
      ))}
    </div>
  );
}
