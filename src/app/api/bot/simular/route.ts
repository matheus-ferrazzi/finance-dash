import { NextResponse } from 'next/server';
import { compraCabe } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';
import { computeProjecao, getCalibracaoPara, getProjecaoBase } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const valorTotal = Number(sp.get('valor_total')), parcelas = Number(sp.get('parcelas') ?? '1');
  if (!(valorTotal > 0) || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 48) {
    return NextResponse.json({ erro: 'use valor_total > 0 e parcelas inteiro de 1 a 48' }, { status: 400 });
  }
  const [base, { calib }] = await Promise.all([getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const parcela = Math.round((valorTotal / parcelas) * 100) / 100;
  const c = compraCabe(computeProjecao(base, 24), calib, parcela, parcelas);
  return NextResponse.json({
    valorTotal, parcelas, parcela, cabe: c.cabe, mesQueFura: c.mesQueFura ? mesLabel(c.mesQueFura) : null, aprofunda: c.aprofunda, link: '/simulador',
  });
}
