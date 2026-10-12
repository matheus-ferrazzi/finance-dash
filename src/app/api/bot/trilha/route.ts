import { NextResponse } from 'next/server';
import { brl } from '@/lib/format';
import { getTrilhaDados } from '@/lib/queries';
import { avaliarTrilha, partesDoTexto } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

export async function GET() {
  const t = avaliarTrilha(await getTrilhaDados());
  const f = t.fases[t.atual - 1];
  return NextResponse.json({
    fase: t.atual, titulo: f.titulo,
    proximoPasso: partesDoTexto(f.proximoPasso).map((p) => (typeof p === 'number' ? brl(p) : p)).join(''),
    reserva: { aplicado: t.reserva.aplicado, meta: t.reserva.meta }, link: '/trilha',
  });
}
