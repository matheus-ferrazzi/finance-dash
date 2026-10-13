import { NextResponse } from 'next/server';
import { montarComparar } from '@/lib/bot';
import { alinharPeriodos, lerParams, linkDoPeriodo } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getDinheiroPorCategoriaEntre } from '@/lib/dinheiro';
import { getGastoPorCategoriaEntre } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const hoje = currentDateSP();
  const r = lerParams(new URL(req.url).searchParams, hoje, ['periodo', 'periodo_b', 'pessoa']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { pessoa } = r.v as Required<typeof r.v>;
  const { a: periodo, b: periodo_b } = alinharPeriodos(r.v.periodo!, r.v.periodo_b!, hoje);
  const [a, b, dinA, dinB] = await Promise.all([
    getGastoPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    getGastoPorCategoriaEntre(periodo_b.inicio, periodo_b.fimExcl, pessoa),
    getDinheiroPorCategoriaEntre(periodo.inicio, periodo.fimExcl, pessoa),
    getDinheiroPorCategoriaEntre(periodo_b.inicio, periodo_b.fimExcl, pessoa),
  ]);
  return NextResponse.json({ a: periodo.label, b: periodo_b.label, pessoa, ...montarComparar(a, b, dinA, dinB), link: linkDoPeriodo(periodo, pessoa, null, currentDateSP().slice(0, 7)) });
}
