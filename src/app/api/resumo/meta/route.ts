import { NextResponse } from 'next/server';
import { getMetaMes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** Meta de gastos (débito + crédito, 17/10/2026): estado do mês e os tetos do Orçamento, para a mensagem e os alertas do Zeca. */
export async function GET() {
  return NextResponse.json(await getMetaMes());
}
