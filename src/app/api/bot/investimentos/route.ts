import { NextResponse } from 'next/server';
import { resumoCarteira } from '@/lib/investimentos';
import { getInvestimentos } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** S6 (auditoria 13/10): carteira do casal para o bot — o Bot 04 do Telegram não tinha substituto. */
export async function GET() {
  return NextResponse.json({ ...resumoCarteira(await getInvestimentos('casal')), link: '/investimentos' });
}
