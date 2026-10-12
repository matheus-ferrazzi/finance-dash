import { NextResponse } from 'next/server';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getMaioresGastos } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  const itens = (await getMaioresGastos(pessoa, periodo.inicio, periodo.fimExcl, grupo)).map(({ categoria: _c, ...x }) => x);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, itens, link: '/buscar' });
}
