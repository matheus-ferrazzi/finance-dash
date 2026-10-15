import { NextResponse } from 'next/server';
import { diasNoMes, getContasDoMes, getDadosAvisos, getFaturas, getGastoLivrePorDia, getPrevisaoResumo } from '@/lib/queries';
import { avisosDoDia } from '@/lib/avisos';
import { currentDateSP } from '@/lib/format';
import { acumular, contasDoDia, faturasDoDia } from '@/lib/resumos';

export const dynamic = 'force-dynamic';

/** Dados do resumo diário (D): ritmo, como o mês fecha, contas de hoje/amanhã e a série do gráfico. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const mes = hoje.slice(0, 7);
  const dia = Number(hoje.slice(8, 10));
  const [p, contas, porDia, faturas, dadosAvisos] = await Promise.all([
    getPrevisaoResumo('casal'), getContasDoMes('casal', mes), getGastoLivrePorDia('casal', hoje), getFaturas('casal', hoje),
    // Onda 2: aviso nunca derruba o diário
    getDadosAvisos(hoje).catch((e) => { console.error('avisos do diário falharam', e); return null; }),
  ]);
  const serie = acumular(porDia, dia);
  const ja = serie[serie.length - 1]?.acumulado ?? 0;
  return NextResponse.json({
    mesLabel: p.mesLabel, fechaCom: p.fechaCom, diasRestantes: p.diasRestantes,
    ritmoSeguroDia: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia,
    avisos: dadosAvisos ? avisosDoDia(dadosAvisos) : [],
    // N5: contas do caderno + faturas fechadas dos cartões dos dois, vencendo hoje/amanhã
    contas: [...contasDoDia(contas.itens, dia, diasNoMes(mes)), ...faturasDoDia(faturas, hoje, contas.itens)]
      .sort((a, b) => (a.quando === b.quando ? 0 : a.quando === 'hoje' ? -1 : 1)),
    // gráfico: gasto livre acumulado × o total livre do mês que não fecha no vermelho
    serie, cabeNoMes: Math.round((ja + Math.max(0, p.sobraParaODiaADia)) * 100) / 100, diasNoMes: diasNoMes(mes),
  });
}
