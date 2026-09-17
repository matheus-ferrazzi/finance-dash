'use client';

import { useMemo, useState } from 'react';
import { Scissors } from 'lucide-react';
import { brl } from '@/lib/format';
import { SectionTitle } from './ui';

interface GrupoCortavel { nome: string; emoji: string; total: number; }

/**
 * Liga o passado com a previsão: pega quanto você gastou num grupo no último mês
 * fechado e mostra o que aconteceria com a sobra mensal se esse gasto caísse.
 */
export function SimuladorCorte({
  grupos, sobraMensal, saldoProjetado,
}: {
  grupos: GrupoCortavel[];
  /** sobra projetada num mês cheio, como está hoje */
  sobraMensal: number;
  /** quanto você deve ter em conta no fim do mês atual */
  saldoProjetado: number;
}) {
  const [alvo, setAlvo] = useState(grupos[0]?.nome ?? '');
  const [pct, setPct] = useState(30);

  const grupo = grupos.find((g) => g.nome === alvo);

  const r = useMemo(() => {
    if (!grupo) return null;
    const economia = grupo.total * (pct / 100);
    const novaSobra = sobraMensal + economia;
    // se você está no vermelho, quanto tempo pra voltar ao zero com essa sobra
    const mesesParaZerar = saldoProjetado < 0 && novaSobra > 0
      ? Math.ceil(Math.abs(saldoProjetado) / novaSobra)
      : null;
    return { economia, novaSobra, mesesParaZerar, novoValor: grupo.total - economia };
  }, [grupo, pct, sobraMensal, saldoProjetado]);

  if (!grupos.length) return null;

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Scissors size={15} className="text-faint" />
        <SectionTitle>E se eu cortar?</SectionTitle>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {grupos.map((g) => (
          <button
            key={g.nome}
            onClick={() => setAlvo(g.nome)}
            className={`rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              alvo === g.nome ? 'bg-surface-3 text-text' : 'bg-surface-2 text-muted hover:text-text'
            }`}
          >
            {g.emoji} {g.nome}
          </button>
        ))}
      </div>

      <label className="block">
        <div className="flex items-baseline justify-between text-xs text-muted mb-1.5">
          <span>Cortar</span>
          <span className="tnum text-text font-medium">{pct}%</span>
        </div>
        <input
          type="range" min={10} max={70} step={5} value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          aria-label={`Percentual de corte em ${alvo}`}
          className="w-full accent-accent"
        />
      </label>

      {r && grupo && (
        <div className="fadein mt-4">
          <div className="text-sm">
            {grupo.emoji} {grupo.nome}: <span className="tnum money text-muted">{brl(grupo.total)}</span>
            {' → '}
            <span className="tnum money text-accent font-medium">{brl(r.novoValor)}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="card-2 px-3 py-2.5">
              <div className="text-[11px] text-muted">Economia/mês</div>
              <div className="mt-1 tnum money text-sm font-medium text-accent">+{brl(r.economia)}</div>
            </div>
            <div className="card-2 px-3 py-2.5">
              <div className="text-[11px] text-muted">Sobra passa a ser</div>
              <div className={`mt-1 tnum money text-sm font-semibold ${r.novaSobra >= 0 ? 'text-accent' : 'text-despesa'}`}>
                {brl(r.novaSobra)}
              </div>
            </div>
          </div>

          <p className="mt-3 text-xs text-faint">
            {r.mesesParaZerar != null ? (
              <>Nesse ritmo você cobre o vermelho de <span className="tnum money">{brl(Math.abs(saldoProjetado))}</span> em{' '}
              <b className="text-muted">{r.mesesParaZerar} {r.mesesParaZerar === 1 ? 'mês' : 'meses'}</b>.</>
            ) : r.novaSobra <= 0 ? (
              'Mesmo com esse corte a conta não fecha — precisa mexer em mais de um lugar.'
            ) : (
              'Sobra positiva mantida.'
            )}
          </p>
        </div>
      )}
    </div>
  );
}
