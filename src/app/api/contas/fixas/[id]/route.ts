import { NextRequest, NextResponse } from 'next/server';
import { encerrarConta } from '@/lib/queries';

// "Remover de vez": a conta para de aparecer depois de `ultimoMes`; os meses anteriores continuam no histórico.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  const ultimoMes = req.nextUrl.searchParams.get('ultimoMes') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ultimoMes)) return NextResponse.json({ erro: 'mês inválido' }, { status: 400 });

  await encerrarConta(id, ultimoMes);
  return NextResponse.json({ ok: true });
}
