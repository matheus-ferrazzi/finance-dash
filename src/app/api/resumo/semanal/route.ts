import { NextResponse } from 'next/server';
import { getDinheiroPorCategoriaEntre, somarMapas } from '@/lib/dinheiro';
import { getFaturas, getGastoPorCategoriaEntre, getTrilhaDados } from '@/lib/queries';
import { totalAPagar } from '@/lib/faturas';
import { brl, currentDateSP } from '@/lib/format';
import { agruparGastos } from '@/lib/grupos';
import { gruposDaSemana, semanaAnterior, somaDias, totaisLivres } from '@/lib/resumos';
import { avaliarTrilha, partesDoTexto } from '@/lib/trilha';

export const dynamic = 'force-dynamic';

const soma = (m: Map<string, number>) => Math.round(Array.from(m.values()).reduce((s, v) => s + v, 0) * 100) / 100;

/** Dados do resumo semanal (D): a semana anterior × a média das 4 antes, por grupo, e a trilha. Do casal. */
export async function GET() {
  const hoje = currentDateSP();
  const s = semanaAnterior(hoje);
  const [semanaBanco, antesBanco, dinSemana, dinAntes, dados] = await Promise.all([
    getGastoPorCategoriaEntre(s.inicio, somaDias(s.fim, 1)),
    getGastoPorCategoriaEntre(somaDias(s.inicio, -28), s.inicio),
    getDinheiroPorCategoriaEntre(s.inicio, somaDias(s.fim, 1)),
    getDinheiroPorCategoriaEntre(somaDias(s.inicio, -28), s.inicio),
    getTrilhaDados(hoje),
  ]);
  // E3: gasto em dinheiro vivo entra na semana e na média (separado em totalDinheiro)
  const semana = somarMapas(semanaBanco, dinSemana);
  const antes = somarMapas(antesBanco, dinAntes);
  const t = avaliarTrilha(dados);
  const f = t.fases[t.atual - 1];
  // gráfico: todos os grupos livres (os travados, pagos uma vez por mês, ficam fora como no texto)
  const gs = agruparGastos(semana, 0).filter((g) => !g.travado);
  const ms = agruparGastos(antes, 0).filter((g) => !g.travado);
  const nomes = Array.from(new Set([...gs.map((g) => g.nome), ...ms.map((g) => g.nome)]));
  const todosGrupos = nomes.map((nome) => ({
    nome, emoji: (gs.find((g) => g.nome === nome) ?? ms.find((g) => g.nome === nome))!.emoji,
    semana: Math.round((gs.find((g) => g.nome === nome)?.total ?? 0) * 100) / 100,
    media: Math.round(((ms.find((g) => g.nome === nome)?.total ?? 0) / 4) * 100) / 100,
  }));
  // N7: título com o mesmo recorte do corpo (só gasto livre): aluguel/renegociação pagos uma vez no mês
  // faziam a semana em que caem parecer "310% acima da média"
  const livres = totaisLivres(agruparGastos(semana, 0), agruparGastos(antes, 0));
  // S7: faturas fechadas ainda a pagar (o Bot 02 do Telegram trazia; N4: a fatura é a do histórico)
  const ultimas = (await getFaturas('casal', hoje)).flatMap((f) => (f.ultima ? [f.ultima] : []));
  const aVencer = ultimas.filter((u) => u.situacao === 'a_vencer').map((u) => u.vencimento).sort();
  const faturas = { aPagar: totalAPagar(ultimas), proximoVencimento: aVencer[0] ? `${aVencer[0].slice(8, 10)}/${aVencer[0].slice(5, 7)}` : null };
  return NextResponse.json({
    semana: s,
    ...livres,
    faturas,
    totalDinheiro: soma(dinSemana),
    grupos: gruposDaSemana(agruparGastos(semana, 0), agruparGastos(antes, 0)),
    todosGrupos,
    // a mensagem é texto simples: o valor marcado do próximo passo vira R$ aqui
    trilha: { fase: t.atual, titulo: f.titulo, proximoPasso: partesDoTexto(f.proximoPasso).map((p) => (typeof p === 'number' ? brl(p) : p)).join('') },
  });
}
