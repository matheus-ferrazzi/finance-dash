import { NextResponse } from 'next/server';
import { diasNoMes, getContasDoMes, getPrevisaoResumo } from '@/lib/queries';
import { currentDateSP } from '@/lib/format';
import { contasDoDia } from '@/lib/resumos';

export const dynamic = 'force-dynamic';

/** Dados do resumo diário (D): ritmo, como o mês fecha e as contas que vencem hoje ou amanhã. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const mes = hoje.slice(0, 7);
  const [p, contas] = await Promise.all([getPrevisaoResumo('casal'), getContasDoMes('casal', mes)]);
  return NextResponse.json({
    mesLabel: p.mesLabel, fechaCom: p.fechaCom, diasRestantes: p.diasRestantes,
    ritmoSeguroDia: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia,
    contas: contasDoDia(contas.itens, Number(hoje.slice(8, 10)), diasNoMes(mes)),
  });
}
