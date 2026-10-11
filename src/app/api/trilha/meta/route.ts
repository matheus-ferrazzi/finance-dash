import { NextRequest, NextResponse } from 'next/server';
import { salvarMeta } from '@/lib/queries';
import { validarMeta } from '@/lib/trilha';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const v = validarMeta(b?.chave, b?.valor);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  await salvarMeta(v.chave, v.valor);
  return NextResponse.json({ ok: true });
}
