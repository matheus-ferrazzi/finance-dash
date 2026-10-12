import { NextResponse } from 'next/server';
import { executarAcao } from '@/lib/botAcoes';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id)) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  const r = await executarAcao(b.id);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ erro: r.erro }, { status: 400 });
}
