import { NextResponse } from 'next/server';
import { apagarRegra } from '@/lib/queries';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Regra inválida.' }, { status: 400 });
  const r = await apagarRegra(id);
  if (!r) return NextResponse.json({ erro: 'Regra não encontrada.' }, { status: 404 });
  return NextResponse.json(r);
}
