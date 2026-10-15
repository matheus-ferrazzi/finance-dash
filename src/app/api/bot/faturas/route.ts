import { NextResponse } from 'next/server';
import { currentDateSP } from '@/lib/format';
import { totalAPagar } from '@/lib/faturas';
import { getFaturas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Faturas para o bot (N4): a última fatura fechada de cada cartão, com situação; total = o que falta pagar. */
export async function GET() {
  const fs = (await getFaturas('casal', currentDateSP())).filter((f) => f.ultima);
  const itens = fs.map((f) => ({
    banco: f.banco, pessoa: f.responsavel, total: f.ultima!.total, vencimento: ddmm(f.ultima!.vencimento),
    situacao: f.ultima!.situacao, falta: f.ultima!.falta,
  }));
  // P3: o link abre as compras das faturas fechadas (as listadas aqui), não as do ciclo em curso
  return NextResponse.json({ itens, total: totalAPagar(itens), link: '/faturas?ciclo=fechada' });
}
