import { NextResponse } from 'next/server';
import { computeProjecao, contaDaPrevisao, getCalibracaoPara, getPrevisaoResumo, getProjecaoBase } from '@/lib/queries';
import { saiDoVermelho } from '@/lib/decisoes';
import { mesLabel } from '@/lib/format';
import { explicacaoDaConta } from '@/lib/previsao';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [p, base, { calib }] = await Promise.all([getPrevisaoResumo('casal'), getProjecaoBase('casal'), getCalibracaoPara('casal')]);
  const sai = saiDoVermelho(computeProjecao(base, 24), calib).provavel;
  return NextResponse.json({
    mesLabel: p.mesLabel, dapraGastarHoje: p.ritmoSeguroDia, ritmoAtualDia: p.ritmoAtualDia, diasRestantes: p.diasRestantes,
    fechaCom: p.fechaCom, saiDoVermelho: sai ? mesLabel(sai) : null, calibrada: !!calib, link: '/',
    // 27/10: a conta de cada número em frases prontas, para o Zeca mostrar de onde ele vem
    explicacao: explicacaoDaConta(contaDaPrevisao(p)),
  });
}
