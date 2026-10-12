import { NextResponse } from 'next/server';
import { montarGasto } from '@/lib/bot';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getDinheiroPorCategoriaEntre } from '@/lib/dinheiro';
import { getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  // E3: o dinheiro vivo entra somado e separado (cada item diz quanto foi em dinheiro)
  const [cat, din] = await Promise.all([
    getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    getDinheiroPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
  ]);
  const g = montarGasto(cat, grupo, din);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, ...g, link: '/gastos' });
}
