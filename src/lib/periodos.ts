// E1: períodos por nome (o modelo nunca escreve data) resolvidos no horário de SP.
import { mesLabel } from './format';
import { addMonths } from './previsao';
import type { Resp } from './queries';
import { semanaAnterior, somaDias } from './resumos';

export const PERIODOS = ['hoje', 'esta_semana', 'semana_passada', 'este_mes', 'mes_passado'];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const ultimoDia = (mes: string) => somaDias(`${addMonths(mes, 1)}-01`, -1);

/** [inicio, fimExcl) e um rótulo; null para nome desconhecido ou mês futuro. */
export function resolverPeriodo(nome: string, hoje: string): { inicio: string; fimExcl: string; label: string } | null {
  const amanha = somaDias(hoje, 1);
  const mesAtual = hoje.slice(0, 7);
  if (nome === 'hoje') return { inicio: hoje, fimExcl: amanha, label: 'hoje' };
  if (nome === 'esta_semana') {
    const seg = somaDias(semanaAnterior(hoje).inicio, 7);
    return { inicio: seg, fimExcl: amanha, label: `esta semana (${ddmm(seg)} a ${ddmm(hoje)})` };
  }
  if (nome === 'semana_passada') {
    const s = semanaAnterior(hoje);
    return { inicio: s.inicio, fimExcl: somaDias(s.fim, 1), label: `semana passada (${ddmm(s.inicio)} a ${ddmm(s.fim)})` };
  }
  if (nome === 'este_mes') return { inicio: `${mesAtual}-01`, fimExcl: amanha, label: mesLabel(mesAtual) };
  const mes = nome === 'mes_passado' ? addMonths(mesAtual, -1) : nome;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes) || mes > mesAtual) return null;
  return { inicio: `${mes}-01`, fimExcl: mes === mesAtual ? amanha : somaDias(ultimoDia(mes), 1), label: mesLabel(mes) };
}

export function lerPessoa(v: string | null): Resp | null {
  if (v === null || v === '' || v === 'casal') return 'casal';
  return v === 'Matheus' || v === 'Ariane' ? v : null;
}
