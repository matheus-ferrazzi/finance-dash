import { NextResponse } from 'next/server';
import { currentDateSP, traduzCategoria } from '@/lib/format';
import { lerPessoa, resolverPeriodo } from '@/lib/periodos';
import { addMonths } from '@/lib/previsao';
import { getBuscaBot } from '@/lib/queries';
import { somaDias } from '@/lib/resumos';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const hoje = currentDateSP();
  const per = sp.get('periodo') ? resolverPeriodo(sp.get('periodo')!, hoje) : { inicio: `${addMonths(hoje.slice(0, 7), -1)}-01`, fimExcl: somaDias(hoje, 1) };
  const pessoa = lerPessoa(sp.get('pessoa'));
  const texto = (sp.get('texto') ?? '').trim() || null;
  const valor = sp.get('valor') ? Number(sp.get('valor')) : null;
  if (!per || !pessoa || (valor !== null && !(valor > 0))) return NextResponse.json({ erro: 'use texto e/ou valor > 0; periodo como nas outras ferramentas; pessoa casal, Matheus ou Ariane' }, { status: 400 });
  if (!texto && valor === null) return NextResponse.json({ erro: 'diga um texto (ex.: nome de quem recebeu) ou o valor' }, { status: 400 });
  const itens = (await getBuscaBot(pessoa, per.inicio, per.fimExcl, texto, valor)).map((x) => ({ ...x, categoria: traduzCategoria(x.categoria) }));
  return NextResponse.json({ itens });
}
