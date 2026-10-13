import { NextResponse } from 'next/server';
import { diasNoMes, fotografarPrevisto, getMesesPassados, getPrevisaoResumo, getTrilhaDados } from '@/lib/queries';
import { currentDateSP, mesLabel } from '@/lib/format';
import { addMonths } from '@/lib/previsao';
import { historicoDe } from '@/lib/resumos';
import { avaliarTrilha } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

/** Dados do fechamento mensal (D): o mês que fechou (sobra real × prevista, saldo no fim), a trilha e o mês novo. */
export async function GET() {
  const hoje = currentDateSP();
  const fechado = addMonths(hoje.slice(0, 7), -1);
  const anterior = addMonths(fechado, -1);
  // "mudou de fase": a trilha hoje × no fim do mês anterior ao que fechou (início do mês fechado)
  const [passados, agora, antes, p] = await Promise.all([
    // 6 meses para o gráfico; se algum mês antigo falhar, volta aos 3 de antes (a mensagem não se perde)
    getMesesPassados('casal', hoje, 6).catch(() => getMesesPassados('casal', hoje)),
    getTrilhaDados(hoje),
    getTrilhaDados(`${anterior}-${String(diasNoMes(anterior)).padStart(2, '0')}`),
    getPrevisaoResumo('casal'),
  ]);
  // N15: dia 1 — foto da previsão do mês que começa (o "previsto" dele no fechamento do mês que vem)
  await Promise.all((['casal', 'Matheus', 'Ariane'] as const).map((r) => fotografarPrevisto(r, hoje.slice(0, 7))))
    .catch((e) => console.error('foto do previsto falhou', e));
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
    // S6: carteira de hoje e aplicação líquida do mês que fechou (resgate negativo) — o Bot 04 trazia
    investimentos: { total: agora.aplicado, aplicadoNoMes: agora.aplicacaoMensal.find((a) => a.mes === m.mes)?.valor ?? 0 },
    mesNovo: { mesLabel: p.mesLabel, fechaCom: p.fechaCom },
    historico: historicoDe(passados),
  });
}
