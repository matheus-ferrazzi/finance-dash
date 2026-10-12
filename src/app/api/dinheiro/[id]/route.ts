import { NextResponse } from 'next/server';
import { apagarDinheiro } from '@/lib/dinheiro';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  return (await apagarDinheiro(id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ erro: 'não existe' }, { status: 404 });
}
