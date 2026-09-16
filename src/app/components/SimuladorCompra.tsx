'use client';

import { Calculator, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { brl, parseValorBR } from '@/lib/format';
import { SectionTitle } from './ui';
import type { ProjecaoMes } from '@/lib/queries';

export interface Simulacao {
  valorParcela: number;
  parcelas: number;
  meses: { label: string; depois: number }[];
  mesesVermelho: number;
  ultimaParcela: string;
  /** saldo em conta mês a mês já descontando as parcelas — alinhado com `projecao` */
  saldoComCompra: number[];
}

/**
 * projecao[0] é o mês em andamento, então a parcela k (1..n) cai em projecao[k-1].
 * O saldo projetado de cada mês já embute receita e gastos, então basta descontar
 * as parcelas pagas até ali. Depois da última parcela o desconto permanece
 * (o dinheiro saiu de vez).
 */
export function simularCompra(
  valorStr: string, parcelasStr: string, saldoAtual: number, projecao: ProjecaoMes[],
): Simulacao | null {
  const v = parseValorBR(valorStr);
  const n = Math.max(1, Math.min(48, Math.floor(Number(parcelasStr) || 1)));
  if (!Number.isFinite(v) || v <= 0) return null;

  const valorParcela = v / n;
  const saldoComCompra = projecao.map((p, i) => p.saldoProjetado - valorParcela * Math.min(i + 1, n));

  const meses: { label: string; depois: number }[] = [{ label: 'agora', depois: saldoAtual - valorParcela }];
  const janela = Math.max(n, Math.min(6, projecao.length));
  for (let i = 0; i < janela && i < projecao.length; i++) {
    meses.push({ label: projecao[i].mesLabel, depois: saldoComCompra[i] });
  }

  return {
    valorParcela,
    parcelas: n,
    meses,
    mesesVermelho: meses.filter((m) => m.depois < 0).length,
    ultimaParcela: projecao[n - 1]?.mesLabel ?? '—',
    saldoComCompra,
  };
}

export function SimuladorCompra({
  valorStr, setValorStr, parcelasStr, setParcelasStr, resultado,
}: {
  valorStr: string;
  setValorStr: (v: string) => void;
  parcelasStr: string;
  setParcelasStr: (v: string) => void;
  resultado: Simulacao | null;
}) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Calculator size={15} className="text-faint" />
        <SectionTitle>Se eu comprar isso agora?</SectionTitle>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted">Valor da compra</span>
          <input
            inputMode="decimal"
            placeholder="Ex: 1200"
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Em quantas vezes</span>
          <input
            type="number" min={1} max={48}
            value={parcelasStr}
            onChange={(e) => setParcelasStr(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
        </label>
      </div>

      {resultado && (
        <div className="fadein mt-4">
          <div
            className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
              resultado.mesesVermelho > 0 ? 'bg-despesa/10 text-despesa' : 'bg-accent/10 text-accent'
            }`}
          >
            {resultado.mesesVermelho > 0
              ? <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
            <span>
              {resultado.mesesVermelho > 0
                ? `Fica no vermelho em ${resultado.mesesVermelho} mês(es) — o dinheiro em conta não cobre.`
                : 'Não fica no vermelho em nenhum mês da projeção.'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-muted">
              parcela <b className="tnum money text-text">{brl(resultado.valorParcela)}</b>
            </span>
            <span className="rounded-lg bg-surface-2 px-2.5 py-1 text-muted">
              compromete por <b className="text-text">{resultado.parcelas}x</b>
              {resultado.parcelas > 1 ? <> até <b className="text-text">{resultado.ultimaParcela}</b></> : null}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {resultado.meses.map((m, i) => (
              <span
                key={i}
                className={`rounded-md px-2 py-1 text-[11px] tnum money ${
                  m.depois < 0 ? 'bg-despesa/15 text-despesa' : 'bg-surface-3 text-muted'
                }`}
                title={`dinheiro em conta depois da compra: ${brl(m.depois)}`}
              >
                {m.label}: {brl(m.depois)}
              </span>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-faint">
            A linha tracejada no gráfico abaixo mostra como fica o dinheiro em conta com essa compra.
          </p>
        </div>
      )}

      {!resultado && (
        <p className="mt-3 text-xs text-faint">
          Parte do seu saldo real em conta e desconta as parcelas mês a mês em cima da projeção. Não considera juros do parcelamento.
        </p>
      )}
    </div>
  );
}
