import { NextResponse } from 'next/server';
import { currentDateSP, mesLabel } from '@/lib/format';
import { getContasDoMes } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mes = currentDateSP().slice(0, 7);
  const c = await getContasDoMes('casal', mes);
  const pagas = c.itens.filter((i) => i.status === 'pago').map((i) => ({ nome: i.nome, valor: i.pago ?? i.previsto }));
  const falta = c.itens.filter((i) => i.status === 'falta').map((i) => ({ nome: i.nome, valor: i.previsto, vence: i.vence ?? null }));
  const aConfirmar = c.itens.filter((i) => i.status === 'a_confirmar').map((i) => ({ nome: i.nome, valor: i.previsto }));
  return NextResponse.json({ mesLabel: mesLabel(mes), pagas, falta, aConfirmar, totalFalta: c.falta, link: '/contas' });
}
