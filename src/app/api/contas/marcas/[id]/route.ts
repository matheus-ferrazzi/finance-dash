import { NextRequest, NextResponse } from 'next/server';
import { alterarValorAvulsa, apagarMarca } from '@/lib/queries';
import { validarValor } from '@/lib/validation';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  await apagarMarca(id);
  return NextResponse.json({ ok: true });
}

// Alterar o valor de uma avulsa ainda não confirmada pelo banco.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const valor = validarValor(body?.valor);
  if (valor === null) return NextResponse.json({ erro: 'valor inválido' }, { status: 400 });

  try {
    await alterarValorAvulsa(id, valor);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 400 });
  }
}
