// E1: validação dos parâmetros das rotas /api/bot/* (erro em texto que o modelo entende e corrige).
import { GRUPOS_VALIDOS } from './grupos';
import { lerPessoa, resolverPeriodo } from './periodos';
import type { Resp } from './queries';

type Campo = 'periodo' | 'periodo_b' | 'pessoa' | 'grupo';
type Per = { inicio: string; fimExcl: string; label: string };
export type Params = { periodo?: Per; periodo_b?: Per; pessoa?: Resp; grupo?: string | null };

const ERRO_PERIODO = 'use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)';

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
