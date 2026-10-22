import { NextResponse } from 'next/server';
import { montarGasto } from '@/lib/bot';
import { lerParams, linkDoPeriodo } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getDinheiroPorCategoriaEntre } from '@/lib/dinheiro';
import { getDividaEntre, getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  // E3: o dinheiro vivo entra somado e separado (cada item diz quanto foi em dinheiro)
  // 20/10 (L2): o gasto vem sem a dívida antiga; no total (sem grupo), ela vai à parte
  const [cat, din, divida] = await Promise.all([
    getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    getDinheiroPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    grupo === null ? getDividaEntre(periodo.inicio, periodo.fimExcl, pessoa) : Promise.resolve(0),
  ]);
  const g = montarGasto(cat, grupo, din);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, ...g, divida, link: linkDoPeriodo(periodo, pessoa, grupo, currentDateSP().slice(0, 7)) });
}
