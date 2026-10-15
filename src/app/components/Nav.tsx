'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { qsNavegacao } from '@/lib/links';
import {
  LayoutDashboard, Receipt, Target, CreditCard, TrendingUp, Home, Repeat, Search,
  Telescope, Stethoscope, MoreHorizontal, ClipboardCheck, Calculator, Flag, Tags,
} from 'lucide-react';

/**
 * Barra principal (F1): os 4 lugares de uso diário. O resto fica em "Mais", uma folha que sobe da barra
 * (desde 15/10 igual no computador: sem barra lateral).
 */
const LINKS = [
  { href: '/', label: 'Início', short: 'Início', icon: LayoutDashboard },
  { href: '/contas', label: 'Contas do mês', short: 'Contas', icon: ClipboardCheck },
  { href: '/gastos', label: 'Gastos', short: 'Gastos', icon: Receipt },
  { href: '/previsibilidade', label: 'Previsão', short: 'Previsão', icon: Telescope },
];

const EXTRA = [
  { href: '/trilha', label: 'Trilha', short: 'Trilha', icon: Flag },
  { href: '/faturas', label: 'Faturas', short: 'Faturas', icon: CreditCard },
  { href: '/simulador', label: 'Simulador', short: 'Simular', icon: Calculator },
  { href: '/diagnostico', label: 'Diagnóstico', short: 'Diagnóst.', icon: Stethoscope },
  { href: '/assinaturas', label: 'Assinaturas', short: 'Assin.', icon: Repeat },
  { href: '/investimentos', label: 'Investimentos', short: 'Invest.', icon: TrendingUp },
  { href: '/orcamento', label: 'Orçamento', short: 'Orçam.', icon: Target },
  { href: '/casa', label: 'Casa', short: 'Casa', icon: Home },
  { href: '/buscar', label: 'Buscar', short: 'Buscar', icon: Search },
  { href: '/regras', label: 'Regras de categoria', short: 'Regras', icon: Tags },
];

const RESPS = [
  { key: 'casal', label: 'Casal', dot: 'bg-accent' },
  { key: 'Matheus', label: 'Matheus', dot: 'bg-matheus' },
  { key: 'Ariane', label: 'Ariane', dot: 'bg-ariane' },
];

export function MobileNav() {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = qsNavegacao(sp.toString());
  const [mais, setMais] = useState(false);
  const noMais = EXTRA.some((e) => e.href === path);
  const item = 'flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]';
  return (
    <>
      {mais && (
        <>
          <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setMais(false)} aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-2xl border-t border-border bg-surface-2 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <div className="grid grid-cols-4 gap-2">
              {EXTRA.map(({ href, short, icon: Icon }) => (
                <Link key={href} href={href + (qs ? `?${qs}` : '')} onClick={() => setMais(false)}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] ${path === href ? 'bg-surface-3 text-accent' : 'text-muted'}`}>
                  <Icon size={20} />{short}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      <nav className="fixed bottom-0 inset-x-0 z-20 mx-auto flex max-w-lg border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {LINKS.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href + (qs ? `?${qs}` : '')} className={`${item} ${path === href ? 'text-accent' : 'text-muted'}`}>
            <Icon size={20} />{short}
          </Link>
        ))}
        <button onClick={() => setMais(!mais)} className={`${item} ${mais || noMais ? 'text-accent' : 'text-muted'}`} aria-expanded={mais}>
          <MoreHorizontal size={20} />Mais
        </button>
      </nav>
    </>
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
          className={`flex items-center gap-1.5 px-1.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm transition-colors ${
            resp === r.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
          }`}
        >
          {/* Onda 5: no celular sem a bolinha de cor, para o cabeçalho caber numa linha */}
          <span className={`hidden h-2 w-2 rounded-full sm:inline-block ${r.dot}`} />
          {r.label}
        </button>
      ))}
    </div>
  );
}
