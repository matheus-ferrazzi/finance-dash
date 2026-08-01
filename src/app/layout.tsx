import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { NavLinks, RespToggle, MobileNav } from './components/Nav';
import { PeriodPicker } from './components/PeriodPicker';
import { Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Finanças · Casal',
  description: 'Painel financeiro Matheus & Ariane',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-base text-text antialiased">
        <div className="flex min-h-screen">
          {/* sidebar desktop */}
          <aside className="hidden md:flex w-60 shrink-0 flex-col gap-7 border-r border-border bg-surface/30 px-4 py-6">
            <div className="flex items-center gap-2.5 px-2">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
                <Wallet size={19} />
              </div>
              <div>
                <div className="text-sm font-semibold leading-tight">Finanças</div>
                <div className="text-xs text-muted">Matheus &amp; Ariane</div>
              </div>
            </div>
            <Suspense fallback={<div className="h-48" />}>
              <NavLinks />
            </Suspense>
          </aside>

          <main className="flex-1 min-w-0 pb-20 md:pb-0">
            <header className="sticky top-0 z-10 border-b border-border bg-base/85 backdrop-blur">
              <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
                <Suspense fallback={<div className="h-10 w-40" />}>
                  <PeriodPicker />
                </Suspense>
                <Suspense fallback={<div className="h-9 w-56" />}>
                  <RespToggle />
                </Suspense>
              </div>
            </header>
            <div className="mx-auto max-w-6xl px-4 py-5 md:px-6 md:py-7">{children}</div>
          </main>
        </div>
        <Suspense>
          <MobileNav />
        </Suspense>
      </body>
    </html>
  );
}
