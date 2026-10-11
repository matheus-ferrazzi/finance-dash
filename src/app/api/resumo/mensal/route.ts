import { NextResponse } from 'next/server';
import { diasNoMes, getMesesPassados, getPrevisaoResumo, getTrilhaDados } from '@/lib/queries';
import { currentDateSP, mesLabel } from '@/lib/format';
import { addMonths } from '@/lib/previsao';
import { avaliarTrilha } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

/** Dados do fechamento mensal (D): o mês que fechou (sobra real × prevista, saldo no fim), a trilha e o mês novo. */
export async function GET() {
  const hoje = currentDateSP();
  const fechado = addMonths(hoje.slice(0, 7), -1);
  const anterior = addMonths(fechado, -1);
  // "mudou de fase": a trilha hoje × no fim do mês anterior ao que fechou (início do mês fechado)
  const [passados, agora, antes, p] = await Promise.all([
    getMesesPassados('casal', hoje, 6),
    getTrilhaDados(hoje),
    getTrilhaDados(`${anterior}-${String(diasNoMes(anterior)).padStart(2, '0')}`),
    getPrevisaoResumo('casal'),
  ]);
  const m = passados.find((x) => x.mes === fechado) ?? passados[passados.length - 1];
  const tAgora = avaliarTrilha(agora);
  const tAntes = avaliarTrilha(antes);
  return NextResponse.json({
    mes: m.mes, mesLabel: mesLabel(m.mes),
    sobraReal: m.real.saldo, sobraPrevista: m.previsto.saldo, saldoFim: m.saldoFim,
    trilha: {
      fase: tAgora.atual, titulo: tAgora.fases[tAgora.atual - 1].titulo,
      mudou: tAgora.atual !== tAntes.atual, faseAntes: tAntes.atual,
    },
    mesNovo: { mesLabel: p.mesLabel, fechaCom: p.fechaCom },
    historico: passados.map((x) => ({ mes: x.mes, mesLabel: mesLabel(x.mes), sobra: x.real.saldo })),
  });
}
