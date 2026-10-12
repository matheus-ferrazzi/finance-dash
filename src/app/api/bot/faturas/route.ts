import { NextResponse } from 'next/server';
import { currentDateSP } from '@/lib/format';
import { getFaturas } from '@/lib/queries';

export const dynamic = 'force-dynamic';
const ddmm = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : null);

/** Faturas para o bot. Vencimento já passado = última fatura fechada (a Pluggy segue mostrando): fora do "a vencer". */
export async function GET() {
  const hoje = currentDateSP();
  const itens = (await getFaturas('casal')).map((f) => ({
    banco: f.banco, pessoa: f.responsavel, valor: f.valor, vencimento: ddmm(f.vencimento),
    paga: f.valor <= 0, vencida: f.vencimento !== null && f.vencimento < hoje,
  }));
  const total = itens.filter((i) => !i.vencida && i.valor > 0).reduce((s, i) => s + i.valor, 0);
  return NextResponse.json({ itens, total: Math.round(total * 100) / 100, link: '/faturas' });
}
