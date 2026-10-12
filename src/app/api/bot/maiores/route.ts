import { NextResponse } from 'next/server';
import { lerParams } from '@/lib/botRotas';
import { currentDateSP } from '@/lib/format';
import { getGastosDinheiro } from '@/lib/dinheiro';
import { grupoDaCategoria } from '@/lib/grupos';
import { getMaioresGastos } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const r = lerParams(new URL(req.url).searchParams, currentDateSP(), ['periodo', 'pessoa', 'grupo']);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 400 });
  const { periodo, pessoa, grupo } = r.v as Required<typeof r.v>;
  const [banco, din] = await Promise.all([
    getMaioresGastos(pessoa, periodo.inicio, periodo.fimExcl, grupo),
    getGastosDinheiro(pessoa, periodo.inicio, periodo.fimExcl),
  ]);
  // E3: gastos em dinheiro vivo entram na lista com 💵
  const itens = [
    ...banco.map(({ categoria: _c, ...x }) => x),
    ...din.filter((g) => grupo === null || (grupoDaCategoria(g.categoria)?.nome ?? 'Resto') === grupo)
      .map((g) => ({ data: `${g.data.slice(8, 10)}/${g.data.slice(5, 7)}`, valor: g.valor, descricao: `💵 ${g.descricao}`, pessoa: g.pessoa })),
  ].sort((x, y) => y.valor - x.valor).slice(0, 10);
  return NextResponse.json({ periodo: periodo.label, pessoa, grupo, itens, link: '/buscar' });
}
