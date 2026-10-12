import { NextResponse } from 'next/server';
import { desfazerAcao } from '@/lib/botAcoes';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!Number.isInteger(b?.id) || (b?.pessoa !== 'Matheus' && b?.pessoa !== 'Ariane')) return NextResponse.json({ erro: 'id ou pessoa inválidos' }, { status: 400 });
  const r = await desfazerAcao(b.id, b.pessoa);
  return r.ok ? NextResponse.json(r) : NextResponse.json({ erro: r.erro }, { status: 400 });
}
