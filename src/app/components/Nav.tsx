'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { qsNavegacao } from '@/lib/links';
import {
  LayoutDashboard, Receipt, Target, CreditCard, TrendingUp, Home, Repeat, Search,
  Telescope, Stethoscope, MoreHorizontal, ClipboardCheck, Calculator, Flag, Tags, Wallet, ChevronDown,
} from 'lucide-react';

/**
 * Barra principal (F1): os 4 lugares de uso diário. O resto fica em "Mais", uma folha que sobe da barra
 * No computador, os mesmos lugares numa barra no topo (NavTopo, 15/10).
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
  { key: 'casal', label: 'Casal' },
  { key: 'Matheus', label: 'Matheus' },
  { key: 'Ariane', label: 'Ariane' },
];

/** Desktop (15/10): o mesmo visual do celular, com os lugares numa barra no topo; o resto em "Mais ▾". */
export function NavTopo() {
  const path = usePathname();
  const sp = useSearchParams();
  const qs = qsNavegacao(sp.toString());
  const [mais, setMais] = useState(false);
  const noMais = EXTRA.some((e) => e.href === path);
  const comQs = (href: string) => href + (qs ? `?${qs}` : '');
  const item = (ativo: boolean) => `flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors ${ativo ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2/50 hover:text-text'}`;
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
      <Link href={comQs('/')} aria-label="Finanças: início" className="mr-2 grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
        <Wallet size={18} />
      </Link>
      {LINKS.map(({ href, short, icon: Icon }) => (
        <Link key={href} href={comQs(href)} aria-current={path === href ? 'page' : undefined} className={item(path === href)}>
          <Icon size={16} className={path === href ? 'text-accent' : ''} />{short}
        </Link>
      ))}
      <div className="relative">
        <button onClick={() => setMais(!mais)} aria-expanded={mais} className={item(mais || noMais)}>
          <MoreHorizontal size={16} className={noMais ? 'text-accent' : ''} />Mais<ChevronDown size={14} className={mais ? 'rotate-180' : ''} />
        </button>
        {mais && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMais(false)} aria-hidden />
            <div className="fadein absolute left-0 top-full z-40 mt-2 w-56 rounded-xl border border-border bg-surface-2 p-1.5 shadow-card">
              {EXTRA.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={comQs(href)} onClick={() => setMais(false)} aria-current={path === href ? 'page' : undefined}
                  className={`flex min-h-[40px] items-center gap-2.5 rounded-lg px-2.5 text-sm ${path === href ? 'bg-surface-3 text-text' : 'text-muted hover:bg-surface-3/60 hover:text-text'}`}>
                  <Icon size={16} className={path === href ? 'text-accent' : 'text-faint'} />{label}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </nav>
  );
}

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
          <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMais(false)} aria-hidden />
          <div className="md:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-border bg-surface-2 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
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
          className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg text-xs transition-colors ${
            resp === r.key ? 'bg-surface-3 text-text' : 'text-muted hover:text-text'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
