// Rodada perdida (17/10/2026): a Hostinger desligou a VPS das 15h57 às 16h35 SP (manutenção da frota) e a ingestão
// das 16h não rodou. Na subida do worker, cada tarefa da agenda cujo último horário passou sem execução roda uma vez,
// na ordem da agenda — menos quando o próximo horário normal está a menos de 1 h (evita rodar duas vezes) ou o
// horário perdido tem mais de 24 h.
import { Cron } from 'croner';
import type { Contexto, NomeTarefa, OpcoesTarefa } from './tarefas';
import type { Execucao } from './tipos';

const H = 3600 * 1000;

export function rodadasPerdidas(
  agenda: readonly (readonly [string, NomeTarefa])[], ultimas: ReadonlyMap<NomeTarefa, Date>, agora: Date, tz: string,
): NomeTarefa[] {
  const out: NomeTarefa[] = [];
  for (const [expr, nome] of agenda) {
    const c = new Cron(expr, { timezone: tz, paused: true });
    const [antes] = c.previousRuns(1, agora);
    const depois = c.nextRun(agora);
    c.stop();
    if (!antes || agora.getTime() - antes.getTime() > 24 * H) continue;
    if (depois && depois.getTime() - agora.getTime() < H) continue;
    const ult = ultimas.get(nome);
    if (!ult || ult < antes) out.push(nome);
  }
  return out;
}

/** Repõe as rodadas perdidas, uma de cada vez. A "última execução" é a do modo do worker (dry-run manual não conta). */
export async function reporPerdidas(
  ctx: Contexto, agenda: readonly (readonly [string, NomeTarefa])[],
  tarefas: Record<NomeTarefa, (ctx: Contexto, opts: OpcoesTarefa) => Promise<Execucao>>, tz: string,
): Promise<Execucao[]> {
  const perdidas = rodadasPerdidas(agenda, await ctx.repo.ultimasExecucoes(ctx.modo), ctx.agora(), tz);
  const feitas: Execucao[] = [];
  for (const nome of perdidas) {
    ctx.log(`repondo rodada perdida: ${nome}`);
    feitas.push(await tarefas[nome](ctx, {}));
  }
  return feitas;
}
