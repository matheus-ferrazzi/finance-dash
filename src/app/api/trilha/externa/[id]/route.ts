import { NextRequest, NextResponse } from 'next/server';
import { apagarDividaExterna, quitarDividaExterna } from '@/lib/queries';

const idDe = (s: string) => (/^[0-9]{1,9}$/.test(s) ? Number(s) : null);

/** Marca como quitada (ou reabre): { quitada: true | false }. */
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const id = idDe((await props.params).id);
  const b = await req.json().catch(() => null);
  if (id === null || typeof b?.quitada !== 'boolean') return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 });
  if (!(await quitarDividaExterna(id, b.quitada))) return NextResponse.json({ erro: 'Dívida não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const id = idDe((await props.params).id);
  if (id === null) return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 });
  if (!(await apagarDividaExterna(id))) return NextResponse.json({ erro: 'Dívida não encontrada.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
