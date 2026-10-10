import { NextRequest, NextResponse } from 'next/server';
import { repetirTodoMes } from '@/lib/queries';

// "Repetir todo mês": transforma uma avulsa já confirmada pelo banco em conta fixa.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const marcaId = Number(body?.marcaId);
  if (!Number.isInteger(marcaId) || marcaId <= 0) return NextResponse.json({ erro: 'avulsa inválida' }, { status: 400 });

  try {
    const id = await repetirTodoMes(marcaId);
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 400 });
  }
}
