// E1: validação dos parâmetros das rotas /api/bot/* (erro em texto que o modelo entende e corrige).
import { GRUPOS_VALIDOS } from './grupos';
import { lerPessoa, resolverPeriodo } from './periodos';
import type { Resp } from './queries';

type Campo = 'periodo' | 'periodo_b' | 'pessoa' | 'grupo';
type Per = { inicio: string; fimExcl: string; label: string };
export type Params = { periodo?: Per; periodo_b?: Per; pessoa?: Resp; grupo?: string | null };

const ERRO_PERIODO = 'use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)';

const dias = (p: Per) => Math.round((Date.parse(`${p.fimExcl}T12:00:00Z`) - Date.parse(`${p.inicio}T12:00:00Z`)) / 86400000);
const somaDias = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * Comparação justa: se A ainda está em andamento (termina hoje) e B é mais longo, B é cortado no mesmo número
 * de dias ("out até dia 12" × "set até dia 12", não × setembro inteiro).
 */
export function alinharPeriodos(a: Per, b: Per, hoje: string): { a: Per; b: Per } {
  const n = dias(a);
  if (a.fimExcl !== somaDias(hoje, 1) || dias(b) <= n) return { a, b };
  const corta = { ...b, fimExcl: somaDias(b.inicio, n) };
  if (a.inicio.endsWith('-01') && b.inicio.endsWith('-01')) {
    const rot = ` (dias 1 a ${n})`;
    return { a: { ...a, label: a.label + rot }, b: { ...corta, label: b.label + rot } };
  }
  return { a, b: corta };
}

export function lerParams(sp: URLSearchParams, hoje: string, campos: Campo[]): { ok: true; v: Params } | { ok: false; erro: string } {
  const v: Params = {};
  for (const c of campos) {
    if (c === 'periodo' || c === 'periodo_b') {
      const p = resolverPeriodo(sp.get(c) ?? '', hoje);
      if (!p) return { ok: false, erro: `${c} inválido: ${ERRO_PERIODO}` };
      v[c] = p;
    } else if (c === 'pessoa') {
      const p = lerPessoa(sp.get('pessoa'));
      if (!p) return { ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' };
      v.pessoa = p;
    } else {
      const g = sp.get('grupo');
      if (g && !GRUPOS_VALIDOS.includes(g)) return { ok: false, erro: `grupo inválido: use ${GRUPOS_VALIDOS.join(', ')}` };
      v.grupo = g || null;
    }
  }
  return { ok: true, v };
}
