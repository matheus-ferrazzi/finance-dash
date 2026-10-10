import { NextResponse } from 'next/server';
import { lerVersao } from '@/lib/versao';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ versao: lerVersao() }, { headers: { 'Cache-Control': 'no-store' } });
}
