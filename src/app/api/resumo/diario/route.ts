import { NextResponse } from 'next/server';
import { diasNoMes, getContasDoMes, getGastoLivrePorDia, getPrevisaoResumo } from '@/lib/queries';
import { currentDateSP } from '@/lib/format';
import { acumular, contasDoDia } from '@/lib/resumos';

export const dynamic = 'force-dynamic';

/** Dados do resumo diário (D): ritmo, como o mês fecha, contas de hoje/amanhã e a série do gráfico. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const mes = hoje.slice(0, 7);
  const dia = Number(hoje.slice(8, 10));
  const [p, contas, porDia] = await Promise.all([getPrevisaoResumo('casal'), getContasDoMes('casal', mes), getGastoLivrePorDia('casal', hoje)]);
  const serie = acumular(porDia, dia);
  const ja = serie[serie.length - 1]?.acumulado ?? 0;
  return NextResponse.json({
    mesLabel: p.mesLabel, fechaCom: p.fechaCom, diasRestantes: p.diasRestantes,
    ritmoSeguroDia: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia,
    contas: contasDoDia(contas.itens, dia, diasNoMes(mes)),
    // gráfico: gasto livre acumulado × o total livre do mês que não fecha no vermelho
    serie, cabeNoMes: Math.round((ja + Math.max(0, p.sobraParaODiaADia)) * 100) / 100, diasNoMes: diasNoMes(mes),
  });
}
