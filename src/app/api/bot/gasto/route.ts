import { NextResponse } from 'next/server';
import { montarGasto } from '@/lib/bot';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  const g = montarGasto(await getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa), grupo);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, ...g, link: '/gastos' });
}
