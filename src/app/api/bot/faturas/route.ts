import { NextResponse } from 'next/server';
import { getFaturas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);

export async function GET() {
  const fs = await getFaturas('casal');
  const itens = fs.map((f) => ({ banco: f.banco, pessoa: f.responsavel, valor: f.valor, vencimento: ddmm(f.vencimento), paga: f.valor <= 0 }));
  return NextResponse.json({ itens, total: Math.round(itens.reduce((s, i) => s + Math.max(0, i.valor), 0) * 100) / 100, link: '/faturas' });
}
