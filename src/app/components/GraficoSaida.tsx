import type { PontoSaida } from '@/lib/saida';

const W = 320, H = 130, PAD = 10, BASE = 16; // BASE: espaço dos rótulos de mês embaixo

/**
 * Onda 5 (Previsão): saldo em conta no fim de cada mês — passados reais, hoje e a projeção (vermelho/verde pelo
 * sinal do último ponto), a linha do zero e, se houver meta, a projeção "com a meta" tracejada em verde.
 * Sem valores no desenho (o olho de privacidade não borra SVG): os números estão na lista e na tabela.
 */
export function GraficoSaida({ pontos }: { pontos: PontoSaida[] }) {
  if (!pontos.length) return null;
  const vals = [0, ...pontos.map((p) => p.saldo), ...pontos.flatMap((p) => (p.meta === null ? [] : [p.meta]))];
  const min = Math.min(...vals), max = Math.max(...vals), amp = max - min || 1;
  const x = (i: number) => PAD + (pontos.length === 1 ? 0 : (i / (pontos.length - 1)) * (W - 2 * PAD));
  const y = (v: number) => PAD + (1 - (v - min) / amp) * (H - BASE - 2 * PAD);
  const linha = (ps: { i: number; v: number }[]) => ps.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const proj = pontos.map((p, i) => ({ i, v: p.saldo }));
  const meta = pontos.map((p, i) => ({ i, v: p.meta })).filter((p): p is { i: number; v: number } => p.v !== null);
  const iHoje = pontos.findIndex((p) => p.hoje);
  const fim = pontos[pontos.length - 1];
  const cor = fim.saldo >= 0 ? '#2ee6a0' : '#ff6b6b';
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img"
      aria-label={`Saldo no fim de cada mês, de ${pontos[0].mesLabel} a ${fim.mesLabel}`}>
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="#3a404a" strokeDasharray="4 4" />
      <text x={W - PAD} y={y(0) - 3} fill="#5c636e" fontSize="9" textAnchor="end">zero</text>
      <polyline points={linha(proj)} fill="none" stroke={cor} strokeWidth="2.5" strokeLinejoin="round" />
      {meta.length > 1 && (
        <>
          <polyline points={linha(meta)} fill="none" stroke="#2ee6a0" strokeWidth="2" strokeDasharray="5 4" />
          <text x={x(meta[meta.length - 1].i)} y={y(meta[meta.length - 1].v) - 5} fill="#2ee6a0" fontSize="9" textAnchor="end">com a meta</text>
        </>
      )}
      {iHoje >= 0 && (
        <>
          <circle cx={x(iHoje)} cy={y(pontos[iHoje].saldo)} r="3.5" fill="#e9ecf1" />
          <text x={x(iHoje) + 5} y={y(pontos[iHoje].saldo) - 5} fill="#8b93a1" fontSize="9">hoje</text>
        </>
      )}
      <text x={PAD} y={H - 3} fill="#5c636e" fontSize="9">{pontos[0].mesLabel}</text>
      {pontos.length > 1 && <text x={W - PAD} y={H - 3} fill="#5c636e" fontSize="9" textAnchor="end">{fim.mesLabel}</text>}
    </svg>
  );
}
