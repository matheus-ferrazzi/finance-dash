import { NextRequest, NextResponse } from 'next/server';
import { alterarValorConta, encerrarConta } from '@/lib/queries';
import { validarValor } from '@/lib/validation';

// "Remover de vez": a conta para de aparecer depois de `ultimoMes`; os meses anteriores continuam no histórico.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  const ultimoMes = req.nextUrl.searchParams.get('ultimoMes') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ultimoMes)) return NextResponse.json({ erro: 'mês inválido' }, { status: 400 });

  await encerrarConta(id, ultimoMes);
  return NextResponse.json({ ok: true });
}

// "Alterar valor": previsto da conta a partir do mês informado; o pago continua vindo do banco.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const valor = validarValor(body?.valor);
  if (valor === null) return NextResponse.json({ erro: 'valor inválido' }, { status: 400 });
  const mes = String(body?.aPartirDe ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ erro: 'mês inválido' }, { status: 400 });

  await alterarValorConta(id, valor, mes);
  return NextResponse.json({ ok: true });
}
