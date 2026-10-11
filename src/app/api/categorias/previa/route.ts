import { NextRequest, NextResponse } from 'next/server';
import { previaRegra } from '@/lib/queries';
import { validarRegra } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const v = validarRegra(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  const r = await previaRegra(v.data);
  if ('erro' in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
