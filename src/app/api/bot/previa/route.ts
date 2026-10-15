import { NextResponse } from 'next/server';
import { CATEGORIAS_PAINEL } from '@/lib/format';
import { alvoDaRegra, getLancamentoParaCorrigir, previaRegra } from '@/lib/queries';
import { nomeSemDocumento } from '@/lib/categoriaPainel';

export const dynamic = 'force-dynamic';
const TIPO: Record<string, 'lancamento' | 'doc' | 'texto'> = { este: 'lancamento', pessoa: 'doc', texto: 'texto' };

export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  const tipo = TIPO[b?.escopo];
  if (!b || typeof b.idTransacao !== 'string' || !tipo || !CATEGORIAS_PAINEL.includes(b.categoria)) {
    return NextResponse.json({ erro: 'use idTransacao, escopo este|pessoa|texto e uma categoria da lista' }, { status: 400 });
  }
  let texto: string | undefined;
  if (tipo === 'texto') texto = (typeof b.texto === 'string' && b.texto.trim()) || (await getLancamentoParaCorrigir(b.idTransacao))?.sugestaoTexto || '';
  const pedido = { tipo, idTransacao: b.idTransacao, categoria: b.categoria, ...(texto !== undefined ? { texto } : {}) };
  const alvo = await alvoDaRegra(pedido);
  if ('erro' in alvo) return NextResponse.json({ erro: alvo.erro }, { status: 400 });
  const p = await previaRegra(pedido);
  if ('erro' in p) return NextResponse.json({ erro: p.erro }, { status: 400 });
  // E2-M3: no escopo "este" o nome é a descrição do lançamento — sem CPF/CNPJ
  return NextResponse.json({ tipo, texto, afetados: p.afetados, nome: nomeSemDocumento(alvo.nome) ?? '(sem descrição)' });
}
