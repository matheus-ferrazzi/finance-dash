import { NextResponse } from 'next/server';
import { apagarMeta } from '@/lib/queries';

export async function DELETE(_req: Request, props: { params: Promise<{ chave: string }> }) {
  const params = await props.params;
  if (params.chave !== 'meses_reserva' && params.chave !== 'meta_patrimonio') {
    return NextResponse.json({ erro: 'Meta desconhecida.' }, { status: 400 });
  }
  await apagarMeta(params.chave);
  return NextResponse.json({ ok: true });
}
