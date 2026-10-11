import { NextResponse } from 'next/server';
import { getGastoPorCategoriaEntre, getTrilhaDados } from '@/lib/queries';
import { brl, currentDateSP } from '@/lib/format';
import { agruparGastos } from '@/lib/grupos';
import { gruposDaSemana, semanaAnterior, somaDias } from '@/lib/resumos';
import { avaliarTrilha, partesDoTexto } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

const soma = (m: Map<string, number>) => Math.round(Array.from(m.values()).reduce((s, v) => s + v, 0) * 100) / 100;

/** Dados do resumo semanal (D): a semana anterior × a média das 4 antes, por grupo, e a trilha. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const s = semanaAnterior(hoje);
  const [semana, antes, dados] = await Promise.all([
    getGastoPorCategoriaEntre(s.inicio, somaDias(s.fim, 1)),
    getGastoPorCategoriaEntre(somaDias(s.inicio, -28), s.inicio),
    getTrilhaDados(hoje),
  ]);
  const t = avaliarTrilha(dados);
  const f = t.fases[t.atual - 1];
  return NextResponse.json({
    semana: s,
    total: soma(semana),
    mediaTotal: Math.round((soma(antes) / 4) * 100) / 100,
    grupos: gruposDaSemana(agruparGastos(semana, 0), agruparGastos(antes, 0)),
    // a mensagem é texto simples: o valor marcado do próximo passo vira R$ aqui
    trilha: { fase: t.atual, titulo: f.titulo, proximoPasso: partesDoTexto(f.proximoPasso).map((p) => (typeof p === 'number' ? brl(p) : p)).join('') },
  });
}
