import { NextRequest, NextResponse } from 'next/server';
import { createCompromisso } from '@/lib/queries';
import { validarCompromisso } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 });

  const v = validarCompromisso(body);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  const id = await createCompromisso(v.data);
  return NextResponse.json({ id });
}
