// Meta de gastos no mês (17/10/2026; de 15 a 17/10 era só do débito, pela meta da Previsão): todos os gastos —
// débito e crédito, fora casa e dívida antiga — × a média dos meses fechados menos 10%. Uma conta só para o card da
// home, a mensagem do Zeca e os alertas — os três nunca discordam.

export interface EntradaMeta { meta: number | null; gasto: number; previstoFim: number; diaHoje: number; diasNoMes: number }

export interface EstadoMeta {
  meta: number; gasto: number; pct: number; falta: number; porDia: number; diasRestantes: number;
  previstoFim: number; acimaNoRitmo: number;
  situacao: 'dentro' | 'ritmo_passa' | 'passou_80' | 'estourou';
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** null = sem meta ("nem zerando o débito sai do vermelho"): sem card, sem mensagem, sem alerta de meta. */
export function estadoMeta(e: EntradaMeta): EstadoMeta | null {
  if (e.meta === null || !(e.meta > 0)) return null;
  const diasRestantes = Math.max(0, e.diasNoMes - e.diaHoje);
  const falta = Math.max(0, e.meta - e.gasto);
  const pct = Math.round((e.gasto / e.meta) * 100);
  const situacao = e.gasto > e.meta ? 'estourou' : pct >= 80 ? 'passou_80' : e.previstoFim > e.meta ? 'ritmo_passa' : 'dentro';
  return {
    meta: r2(e.meta), gasto: r2(e.gasto), pct, falta: r2(falta),
    // hoje também é dia de gastar (como o "dá pra gastar" do ritmo): no último dia, tudo o que falta
    porDia: r2(falta / (diasRestantes + 1)), diasRestantes,
    previstoFim: r2(e.previstoFim), acimaNoRitmo: r2(Math.max(0, e.previstoFim - e.meta)), situacao,
  };
}

/**
 * 17/10: meta de todos os gastos (débito + crédito) = média dos meses fechados com dado menos 10%, arredondada a
 * R$ 50. Com menos de 3 meses com dado a média é frágil: sem meta. Como o gasto vem caindo, a meta aperta sozinha.
 */
export function metaDaMedia(meses: readonly number[]): number | null {
  const com = meses.filter((v) => v > 0);
  if (com.length < 3) return null;
  const media = com.reduce((a, b) => a + b, 0) / com.length;
  return Math.round((media * 0.9) / 50) * 50;
}

/**
 * Onde o mês fecha: o que já foi + as parcelas já lançadas que ainda caem no mês + o ritmo do à vista (débito e
 * crédito sem parcela, por dia até hoje) nos dias que faltam. Parcela não entra no ritmo: ela já tem data.
 */
export function previstoFimGastos(e: { gasto: number; avista: number; parcelasRestantes: number; diaHoje: number; diasNoMes: number }): number {
  const diasRestantes = Math.max(0, e.diasNoMes - e.diaHoje);
  const ritmo = e.diaHoje > 0 ? Math.max(0, e.avista) / e.diaHoje : 0;
  return r2(e.gasto + e.parcelasRestantes + ritmo * diasRestantes);
}

/** O "já avisei" do mês, guardado no estado do registro de notificações (sem tabela própria). */
export interface MemoriaAlertas { mes: string; ritmoFora: boolean; avisos: string[] }

export type Alerta =
  | { tipo: 'ritmo'; previstoFim: number; acima: number; porDia: number }
  | { tipo: '80' | '100'; gasto: number; meta: number; diasRestantes: number }
  | { tipo: 'orcamento'; item: string; emoji: string; pct: 80 | 100; gasto: number; teto: number };

/**
 * Decide o que avisar agora. Cada alerta uma vez no mês (a meta se mexe todo dia: o % que cai de 80 para 79 não
 * "desavisa"); o de ritmo volta a valer quando o ritmo entra de novo na meta. Estourou e 80% na mesma rodada:
 * só o 100. Mês novo zera.
 */
export function alertasDaMeta(
  est: EstadoMeta | null, orcamento: readonly { item: string; emoji: string; teto: number; gasto: number }[],
  anterior: MemoriaAlertas | null, mes: string,
): { alertas: Alerta[]; memoria: MemoriaAlertas } {
  const mem: MemoriaAlertas = anterior && anterior.mes === mes
    ? { mes, ritmoFora: anterior.ritmoFora, avisos: [...anterior.avisos] }
    : { mes, ritmoFora: false, avisos: [] };
  const ja = (k: string) => mem.avisos.includes(k);
  const marcar = (k: string) => { if (!ja(k)) mem.avisos.push(k); };
  const alertas: Alerta[] = [];

  if (est) {
    if (est.gasto > est.meta && !ja('100')) {
      alertas.push({ tipo: '100', gasto: est.gasto, meta: est.meta, diasRestantes: est.diasRestantes });
      marcar('100'); marcar('80');
    } else if (est.pct >= 80 && !ja('80')) {
      alertas.push({ tipo: '80', gasto: est.gasto, meta: est.meta, diasRestantes: est.diasRestantes });
      marcar('80');
    }
    const fora = est.previstoFim > est.meta;
    // ritmo só faz sentido antes de estourar: depois, o aviso que vale é o de 100%
    if (fora && !mem.ritmoFora && !ja('100')) {
      alertas.push({ tipo: 'ritmo', previstoFim: est.previstoFim, acima: est.acimaNoRitmo, porDia: est.porDia });
    }
    mem.ritmoFora = fora;
  }

  for (const o of orcamento) {
    if (!(o.teto > 0)) continue;
    const pct = ([100, 80] as const).find((p) => o.gasto >= (o.teto * p) / 100);
    if (!pct || ja(`orc:${o.item}:${pct}`)) continue;
    alertas.push({ tipo: 'orcamento', item: o.item, emoji: o.emoji, pct, gasto: r2(o.gasto), teto: o.teto });
    marcar(`orc:${o.item}:${pct}`);
    if (pct === 100) marcar(`orc:${o.item}:80`);
  }
  return { alertas, memoria: mem };
}
