import { NextResponse } from 'next/server';
import { lerSimulacao } from '@/lib/botRotas';
import { compraCabe } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';
import { computeProjecao, getCalibracaoPara, getProjecaoBase } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = lerSimulacao(new URL(req.url).searchParams);
  if (!s.ok) return NextResponse.json({ erro: s.erro }, { status: 400 });
  const { valorTotal, parcelas } = s;
  const [base, { calib }] = await Promise.all([getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const parcela = Math.round((valorTotal / parcelas) * 100) / 100;
  const proj = computeProjecao(base, 24);
  const c = compraCabe(proj, calib, parcela, parcelas);
  // E1-M8: pelo número provável também (sem faixa); quando os dois discordam, o texto diz os dois
  const provavel = compraCabe(proj, null, parcela, parcelas);
  return NextResponse.json({
    valorTotal, parcelas, parcela, cabe: c.cabe, mesQueFura: c.mesQueFura ? mesLabel(c.mesQueFura) : null, aprofunda: c.aprofunda,
    cabeProvavel: provavel.cabe, link: '/simulador',
  });
}
