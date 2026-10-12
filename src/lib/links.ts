// Links do painel: a mesma função serve o site e o bot (projeto D). Link só leva filtro, nunca valor.
import { currentMonthSP } from './format';

export type Tela = 'inicio' | 'previsao' | 'contas' | 'gastos' | 'faturas' | 'diagnostico' | 'assinaturas'
  | 'investimentos' | 'orcamento' | 'casa' | 'buscar' | 'simulador' | 'trilha';

export interface Filtros {
  resp?: 'casal' | 'Matheus' | 'Ariane'; mes?: string; grupo?: string; cartao?: string; tipo?: 'livre';
}

const CAMINHO: Record<Tela, string> = {
  inicio: '/', previsao: '/previsibilidade', contas: '/contas', gastos: '/gastos', faturas: '/faturas',
  diagnostico: '/diagnostico', assinaturas: '/assinaturas', investimentos: '/investimentos',
  orcamento: '/orcamento', casa: '/casa', buscar: '/buscar', simulador: '/simulador', trilha: '/trilha',
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

/** O seletor de mês do topo: a Previsão navega pelas setas do próprio detalhe; Simulador e Trilha não têm mês. */
export function temSeletorDeMes(path: string): boolean {
  return path !== '/previsibilidade' && path !== '/simulador' && path !== '/trilha';
}

/** Mês que a tela de `path` pode mostrar: até o seguinte em Contas/Previsão, até o atual no resto. */
export function mesNoLimite(mes: string | null | undefined, path: string, atual: string): string {
  const v = mesValido(mes ?? undefined);
  if (!v) return atual;
  const [y, m] = atual.split('-').map(Number);
  const seguinte = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const max = podeIrParaMesSeguinte(path) ? seguinte : atual;
  return v > max ? max : v;
}

/** A barra de navegação leva só pessoa e mês; filtros de uma tela (grupo, cartão…) não grudam na outra. */
export function qsNavegacao(qs: string): string {
  const de = new URLSearchParams(qs);
  const p = new URLSearchParams();
  for (const k of ['resp', 'mes']) { const v = de.get(k); if (v) p.set(k, v); }
  return p.toString();
}
