import { NextRequest, NextResponse } from 'next/server';
import { criarDividaExterna } from '@/lib/queries';
import { validarDividaExterna } from '@/lib/dividasExternas';

/** 13/11: cadastro de uma dívida fora do banco (fase "nome limpo" da Trilha). */
export async function POST(req: NextRequest) {
  const v = validarDividaExterna(await req.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });
  return NextResponse.json({ id: await criarDividaExterna(v.data) });
}
