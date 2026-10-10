'use client';

import { useMemo, useState } from 'react';
import { mesLabel } from '@/lib/format';
import { compraCabe, textoVeredito } from '@/lib/decisoes';
import type { Calibracao } from '@/lib/faixa';
import type { ProjecaoMes } from '@/lib/previsao';
import { SimuladorCompra, simularCompra } from './SimuladorCompra';

/** Simulador de compra em tela própria (F2b): o mesmo cálculo e o veredito pelo pior caso. */
export function SimuladorPagina({ projecao, saldoAtual, calib }: { projecao: ProjecaoMes[]; saldoAtual: number; calib: Calibracao | null }) {
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const sim = useMemo(() => simularCompra(valor, parcelas, saldoAtual, projecao), [valor, parcelas, saldoAtual, projecao]);
  const veredito = sim ? textoVeredito(compraCabe(projecao, calib, sim.valorParcela, sim.parcelas), (m) => mesLabel(m)) : null;
  return (
    <SimuladorCompra valorStr={valor} setValorStr={setValor} parcelasStr={parcelas} setParcelasStr={setParcelas}
      resultado={sim} veredito={veredito} />
  );
}
