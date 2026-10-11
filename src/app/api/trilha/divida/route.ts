import { NextRequest, NextResponse } from 'next/server';
import { marcarDivida } from '@/lib/queries';

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  let r;
  if (b?.tipo === 'divida' && typeof b.idTransacao === 'string' && b.idTransacao) {
    r = await marcarDivida({ tipo: 'divida', idTransacao: b.idTransacao });
  } else if (b?.tipo === 'nao_divida' && typeof b.chave === 'string') {
    r = await marcarDivida({ tipo: 'nao_divida', chave: b.chave, nome: typeof b.nome === 'string' ? b.nome : '' });
  } else {
    return NextResponse.json({ erro: 'Pedido inválido.' }, { status: 400 });
  }
  if ('erro' in r) return NextResponse.json(r, { status: 400 });
  return NextResponse.json(r);
}
