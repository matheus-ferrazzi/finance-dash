// Desafio do mês (auditoria 13/10, P7 — decisão "fazer simples"): um por mês, sem cadastro e sem tabela.
// É sempre recalculável: o maior grupo LIVRE nos 3 meses fechados antes dele, com meta = média − 10%.
// O mensal anuncia no dia 1 e fecha o do mês anterior; o semanal mostra o andamento.
import type { GrupoGasto } from './grupos';

export interface Desafio { mes: string; grupo: string; emoji: string; media: number; meta: number }

const r2 = (x: number) => Math.round(x * 100) / 100;

/** `tres` = gasto por grupo SOMADO nos 3 meses fechados antes de `mes`. Média abaixo de R$ 100: sem desafio. */
export function desafioDoMes(mes: string, tres: GrupoGasto[]): Desafio | null {
  const g = tres.filter((x) => !x.travado && x.nome !== 'Resto').sort((a, b) => b.total - a.total)[0];
  if (!g) return null;
  const media = r2(g.total / 3);
  if (media < 100) return null;
  return { mes, grupo: g.nome, emoji: g.emoji, media, meta: Math.floor((media * 0.9) / 10) * 10 };
}

/** `noMes` = gasto por grupo do mês do desafio (até hoje, ou o mês inteiro no fechamento). */
export function andamentoDesafio(d: Desafio, noMes: GrupoGasto[]): { gasto: number; pct: number; cumpriu: boolean } {
  const gasto = r2(noMes.find((x) => x.nome === d.grupo)?.total ?? 0);
  return { gasto, pct: d.meta > 0 ? Math.round((gasto / d.meta) * 100) : 0, cumpriu: gasto <= d.meta };
}
