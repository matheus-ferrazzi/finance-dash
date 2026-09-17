'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Receipt, Target, CreditCard, TrendingUp, Home, Repeat, Search,
  Telescope, Stethoscope, MoreHorizontal,
} from 'lucide-react';

/**
 * Barra principal: as 5 perguntas que se faz no dia a dia.
 * Previsibilidade subiu pra cá (é a mais usada) e Orçamento/Casa/Faturas/
 * Investimentos viraram secundárias — são consulta pontual, não rotina.
 */
const LINKS = [
  { href: '/', label: 'Visão geral', short: 'Visão', icon: LayoutDashboard },
  { href: '/previsibilidade', label: 'Previsibilidade', short: 'Previsão', icon: Telescope },
  { href: '/diagnostico', label: 'Diagnóstico', short: 'Diagnóst.', icon: Stethoscope },
  { href: '/gastos', label: 'Gastos', short: 'Gastos', icon: Receipt },
  { href: '/faturas', label: 'Faturas', short: 'Faturas', icon: CreditCard },
];

// secundárias — sidebar no desktop, ícones no header no mobile
const EXTRA = [
  { href: '/orcamento', label: 'Orçamento', short: 'Orçam.', icon: Target },
  { href: '/casa', label: 'Casa', short: 'Casa', icon: Home },
  { href: '/investimentos', label: 'Investimentos', short: 'Invest.', icon: TrendingUp },
  { href: '/assinaturas', label: 'Assinaturas', short: 'Assin.', icon: Repeat },
  { href: '/buscar', label: 'Buscar', short: 'Buscar', icon: Search },
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
      {[...LINKS, ...EXTRA].map(({ href, label, icon: Icon }) => {
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

/**
 * Um botão só pras páginas secundárias, em vez de uma fileira de ícones.
 * O header tinha 6 controles competindo por atenção; isso corta pra 4.
 */
export function MoreMenu() {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  const [aberto, setAberto] = useState(false);
  const aqui = EXTRA.some((e) => e.href === path);

  return (
    <div className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-label="Mais páginas"
        className={`grid h-9 w-9 place-items-center rounded-xl border border-border transition-colors ${
          aqui || aberto ? 'bg-surface-3 text-accent' : 'bg-surface text-muted hover:text-text'
        }`}
      >
        <MoreHorizontal size={17} />
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} aria-hidden />
          <div className="fadein absolute right-0 top-full mt-2 z-30 w-52 rounded-xl border border-border bg-surface-2 p-1 shadow-card">
            {EXTRA.map(({ href, label, icon: Icon }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href + (qs ? `?${qs}` : '')}
                  onClick={() => setAberto(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-surface-3 text-text' : 'text-muted hover:text-text hover:bg-surface-3/60'
                  }`}
                >
                  <Icon size={16} className={active ? 'text-accent' : 'text-faint'} />
                  {label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
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
