import { NextRequest, NextResponse } from 'next/server';
import { apagarPlano, salvarPlano } from '@/lib/queries';
import { validarPlano } from '@/lib/plano';

/** 13/11 (plano realista): grava os tetos por grupo e os degraus. `recomecar: true` refaz o início e as bases. */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const v = validarPlano(b);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  return NextResponse.json(await salvarPlano(v.data, { recomecar: b?.recomecar === true }));
}

export async function DELETE() {
  return NextResponse.json({ ok: await apagarPlano() });
}
