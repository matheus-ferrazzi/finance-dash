import { NextResponse } from 'next/server';
import { computeProjecao, getCalibracaoPara, getPrevisaoResumo, getProjecaoBase } from '@/lib/queries';
import { saiDoVermelho } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [p, base, { calib }] = await Promise.all([getPrevisaoResumo('casal'), getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const sai = saiDoVermelho(computeProjecao(base, 24), calib).provavel;
  return NextResponse.json({
    mesLabel: p.mesLabel, dapraGastarHoje: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia, diasRestantes: p.diasRestantes,
    fechaCom: p.fechaCom, saiDoVermelho: sai ? mesLabel(sai) : null, calibrada: !!calib, link: '/',
  });
}
