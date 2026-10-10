import { NextRequest, NextResponse } from 'next/server';
import { apagarMarca } from '@/lib/queries';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  await apagarMarca(id);
  return NextResponse.json({ ok: true });
}
