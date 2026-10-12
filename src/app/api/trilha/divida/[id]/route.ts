import { NextResponse } from 'next/server';
import { apagarMarcacao } from '@/lib/queries';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'Marcação inválida.' }, { status: 400 });
  if (!(await apagarMarcacao(id))) return NextResponse.json({ erro: 'Marcação não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
