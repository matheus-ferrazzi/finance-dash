import { NextRequest, NextResponse } from 'next/server';
import { updateCompromisso, deleteCompromisso } from '@/lib/queries';
import { validarCompromisso } from '@/lib/validation';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ erro: 'JSON inválido' }, { status: 400 });

  const v = validarCompromisso(body);
  if (!v.ok) return NextResponse.json({ erro: v.erro }, { status: 400 });

  await updateCompromisso(id, v.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseId(params.id);
  if (id === null) return NextResponse.json({ erro: 'id inválido' }, { status: 400 });

  await deleteCompromisso(id);
  return NextResponse.json({ ok: true });
}
