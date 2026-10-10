// Links do painel: a mesma função serve o site e o bot (projeto D). Link só leva filtro, nunca valor.
import { currentMonthSP } from './format';

export type Tela = 'inicio' | 'previsao' | 'contas' | 'gastos' | 'faturas' | 'diagnostico' | 'assinaturas'
  | 'investimentos' | 'orcamento' | 'casa' | 'buscar';

export interface Filtros {
  resp?: 'casal' | 'Matheus' | 'Ariane'; mes?: string; grupo?: string; cartao?: string; tipo?: 'livre';
}

const CAMINHO: Record<Tela, string> = {
  inicio: '/', previsao: '/previsibilidade', contas: '/contas', gastos: '/gastos', faturas: '/faturas',
  diagnostico: '/diagnostico', assinaturas: '/assinaturas', investimentos: '/investimentos',
  orcamento: '/orcamento', casa: '/casa', buscar: '/buscar',
};

export function mesValido(v: string | undefined): string | null {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export function linkPara(tela: Tela, f: Filtros = {}, mesAtual: string = currentMonthSP()): string {
  const p = new URLSearchParams();
  if (f.resp && f.resp !== 'casal') p.set('resp', f.resp);
  const mes = mesValido(f.mes);
  if (mes && mes !== mesAtual) p.set('mes', mes);
  if (f.grupo) p.set('grupo', f.grupo);
  if (f.cartao) p.set('cartao', f.cartao);
  if (f.tipo === 'livre') p.set('tipo', 'livre');
  const qs = p.toString();
  return CAMINHO[tela] + (qs ? `?${qs}` : '');
}

/** Planejar o mês que vem só faz sentido onde há o que planejar. */
export function podeIrParaMesSeguinte(path: string): boolean {
  return path === '/contas' || path === '/previsibilidade';
}
