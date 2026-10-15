'use client';

import { useEffect, useState } from 'react';
import { versaoMudou } from '@/lib/versaoMudou';

/** Faixa "versão nova": confere ao voltar para a aba e a cada 30 min; nunca recarrega sozinho. */
export function VersaoAviso({ carregada }: { carregada: string }) {
  const [nova, setNova] = useState(false);
  useEffect(() => {
    const conferir = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' });
        const { versao } = await r.json();
        if (versaoMudou(carregada, versao)) setNova(true);
      } catch { /* sem rede: tenta de novo na próxima */ }
    };
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    const t = setInterval(conferir, 30 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', aoVoltar); clearInterval(t); };
  }, [carregada]);
  if (!nova) return null;
  return (
    <button onClick={() => location.reload()}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+60px)] z-30 rounded-xl md:bottom-4 md:left-auto md:right-4 md:w-auto bg-accent px-4 py-3 text-sm font-medium text-white shadow-card">
      Versão nova do painel — toque para atualizar
    </button>
  );
}
