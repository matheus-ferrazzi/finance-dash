import { NextResponse } from 'next/server';
import { getLancamentoParaCorrigir } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const l = await getLancamentoParaCorrigir(params.id);
  if (!l) return NextResponse.json({ erro: 'Lançamento não encontrado.' }, { status: 404 });
  return NextResponse.json(l);
}
