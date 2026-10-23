import type { Metadata } from 'next';
import { Suspense } from 'react';
import localFont from 'next/font/local';
import './globals.css';
import { MobileNav, NavTopo, RespToggle } from './components/Nav';
import { PeriodPicker } from './components/PeriodPicker';
import { PrivacyToggle } from './components/PrivacyToggle';
import { SyncDot } from './components/SyncDot';
import { getSyncStatus } from '@/lib/queries';
import { lerVersao } from '@/lib/versao';
import { VersaoAviso } from './components/VersaoAviso';

// acabamento (15/10): fonte própria (antes a do sistema: Segoe no Windows, Roboto no Android), servida pelo próprio app
// 23/10: o arquivo fica no repo (fonts/, licença OFL ao lado) — baixar do Google Fonts no build derrubou um deploy
// quando a rede da VPS falhou. Fonte variável (pesos 400–700 num arquivo só), subconjunto latin (cobre os acentos)
const fonte = localFont({ src: './fonts/manrope-latin-wght-normal.woff2', weight: '400 700', variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'Finanças · Casal',
  description: 'Painel financeiro Matheus & Ariane',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let sync = { oldestH: 0, conns: [] as any[] };
  try { sync = await getSyncStatus(); } catch {}
  return (
    <html lang="pt-BR" className={fonte.variable}>
      <head>
        {/* instalável como app (15/10): o Chrome busca o manifesto sem cookie, e o painel fica atrás do Cloudflare
            Access — sem use-credentials o manifesto viria a tela de login e o "Instalar app" não apareceria */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#0a0b0d" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Finanças" />
      </head>
      <body className="min-h-screen bg-base text-text antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('hideMoney')==='1'){document.documentElement.setAttribute('data-hide-money','')}}catch(e){}`,
          }}
        />
        {/* 15/10: o mesmo visual no celular e no desktop; no desktop a navegação sobe para o cabeçalho e o conteúdo usa a largura */}
        <header className="sticky top-0 z-10 border-b border-border bg-base/85 backdrop-blur">
          {/* Onda 5: uma linha — [desktop: lugares] · mês · pessoa · bolinha de sincronização · olho */}
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-1.5 px-3 py-2.5 md:gap-3 md:px-6">
            <Suspense fallback={null}>
              <NavTopo />
            </Suspense>
            <Suspense fallback={<div className="h-10 w-28" />}>
              <PeriodPicker />
            </Suspense>
            <div className="ml-auto flex items-center gap-1.5">
              <SyncDot status={sync} />
              <Suspense fallback={<div className="h-9 w-40" />}>
                <RespToggle />
              </Suspense>
              <PrivacyToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto min-h-screen w-full max-w-6xl px-4 pb-24 pt-5 md:px-6 md:pb-10 md:pt-6">{children}</main>
        <Suspense>
          <MobileNav />
        </Suspense>
        <VersaoAviso carregada={lerVersao()} />
      </body>
    </html>
  );
}
