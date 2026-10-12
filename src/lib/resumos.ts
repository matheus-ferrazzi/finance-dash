// Dados das mensagens do D (diário, semanal, mensal): só remonta o que o painel já calcula.
import type { ItemConta } from './contas';
import type { GrupoGasto } from './grupos';
import { mesLabel } from './format';
import type { MesPassado } from './queries';

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface ContaDoDia { nome: string; valor: number; quando: 'hoje' | 'amanhã' }

/**
 * Contas do mês que vencem hoje ou amanhã e ainda estão em falta (paga no banco ou marcada ✓ não é lembrada).
 * O vencimento é o dia típico (`vence`); 31 num mês de 30 dias vence no 30. No último dia do mês, só as de hoje.
 */
export function contasDoDia(itens: ItemConta[], hojeDia: number, diasNoMes: number): ContaDoDia[] {
  const out: ContaDoDia[] = [];
  for (const i of itens) {
    if (i.status !== 'falta' || i.vence == null) continue;
    const dia = Math.min(i.vence, diasNoMes);
    if (dia === hojeDia) out.push({ nome: i.nome, valor: i.previsto, quando: 'hoje' });
    else if (hojeDia < diasNoMes && dia === hojeDia + 1) out.push({ nome: i.nome, valor: i.previsto, quando: 'amanhã' });
  }
  return out.sort((a, b) => (a.quando === b.quando ? 0 : a.quando === 'hoje' ? -1 : 1));
}

export interface GrupoSemana { nome: string; emoji: string; semana: number; media: number }

/**
 * media4 = total das 4 semanas anteriores por grupo (a média semanal é /4); devolve os 3 que mais mudaram.
 * Grupos travados (aluguel, empréstimo) ficam fora: pagos uma vez por mês, dominariam a comparação semanal.
 */
export function gruposDaSemana(semana: GrupoGasto[], media4: GrupoGasto[]): GrupoSemana[] {
  const livres = (gs: GrupoGasto[]) => gs.filter((g) => !g.travado);
  semana = livres(semana); media4 = livres(media4);
  const nomes = new Set([...semana.map((g) => g.nome), ...media4.map((g) => g.nome)]);
  const emoji = new Map([...media4, ...semana].map((g) => [g.nome, g.emoji]));
  return Array.from(nomes)
    .map((nome) => ({
      nome, emoji: emoji.get(nome) ?? '•',
      semana: r2(semana.find((g) => g.nome === nome)?.total ?? 0),
      media: r2((media4.find((g) => g.nome === nome)?.total ?? 0) / 4),
    }))
    .filter((g) => g.semana > 0 || g.media > 0)
    .sort((a, b) => Math.abs(b.semana - b.media) - Math.abs(a.semana - a.media))
    .slice(0, 3);
}

/** A semana (segunda a domingo) anterior à de `hoje` (AAAA-MM-DD). */
export function semanaAnterior(hoje: string): { inicio: string; fim: string } {
  const d = new Date(`${hoje}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = segunda
  const seg = new Date(d.getTime() - (dow + 7) * 86400000);
  const dom = new Date(seg.getTime() + 6 * 86400000);
  const f = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: f(seg), fim: f(dom) };
}

/** Soma de dias a uma data AAAA-MM-DD. */
export function somaDias(data: string, n: number): string {
  return new Date(new Date(`${data}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

/** Gasto acumulado por dia do mês, de 1 até `ateDia` (dias sem gasto repetem o acumulado). */
export function acumular(porDia: { dia: number; valor: number }[], ateDia: number): { dia: number; acumulado: number }[] {
  const out: { dia: number; acumulado: number }[] = [];
  let s = 0;
  for (let d = 1; d <= ateDia; d++) {
    s += porDia.filter((p) => p.dia === d).reduce((a, p) => a + p.valor, 0);
    out.push({ dia: d, acumulado: r2(s) });
  }
  return out;
}

/** Sobra real dos meses fechados para o gráfico do mensal; mês sem receita nem débito (antes do histórico) fica fora. */
export function historicoDe(passados: MesPassado[]): { mes: string; mesLabel: string; sobra: number }[] {
  return passados
    .filter((m) => m.real.receita !== 0 || m.real.debito !== 0)
    .map((m) => ({ mes: m.mes, mesLabel: mesLabel(m.mes), sobra: m.real.saldo }));
}
