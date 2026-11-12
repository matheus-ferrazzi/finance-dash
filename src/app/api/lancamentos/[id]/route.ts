import { NextResponse } from 'next/server';
import { getLancamentoParaCorrigir } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const l = await getLancamentoParaCorrigir(params.id);
  if (!l) return NextResponse.json({ erro: 'Lançamento não encontrado.' }, { status: 404 });
  return NextResponse.json(l);
}
