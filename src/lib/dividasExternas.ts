// Dívidas fora do banco (13/11/2026, plano realista): o que suja o nome e a Pluggy não vê. Entram por cadastro na
// Trilha ou pela consulta sob demanda; alimentam a fase "nome limpo". Sem banco: tipos e validação.
import { parseValorBR } from './format';

export type OrigemDivida = 'manual' | 'consulta';

export interface DividaExternaInput {
  credor: string; responsavel: 'Matheus' | 'Ariane'; valor: number; negativada: boolean; observacao: string | null;
}

/** Como a tela mostra: a dívida em aberto, de onde veio a informação e de quando é. */
export interface DividaExternaTela extends DividaExternaInput {
  id: number; origem: OrigemDivida;
  /** AAAA-MM-DD da informação (o dia do cadastro ou da consulta) */
  referencia: string;
}

const MAX_CREDOR = 80;
const MAX_OBS = 200;

export function validarDividaExterna(body: any): { ok: true; data: DividaExternaInput } | { ok: false; erro: string } {
  const credor = typeof body?.credor === 'string' ? body.credor.trim() : '';
  if (!credor) return { ok: false, erro: 'Diga para quem é a dívida.' };
  if (credor.length > MAX_CREDOR) return { ok: false, erro: 'Nome do credor muito longo.' };
  if (body.responsavel !== 'Matheus' && body.responsavel !== 'Ariane') return { ok: false, erro: 'A dívida é do Matheus ou da Ariane.' };
  const valor = typeof body.valor === 'number' ? body.valor : typeof body.valor === 'string' && body.valor.trim() ? parseValorBR(body.valor) : NaN;
  if (!Number.isFinite(valor) || valor <= 0 || valor > 9_999_999) return { ok: false, erro: 'Valor inválido.' };
  const obs = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, MAX_OBS) : '';
  return {
    ok: true,
    data: { credor, responsavel: body.responsavel, valor: Math.round(valor * 100) / 100, negativada: body.negativada !== false, observacao: obs || null },
  };
}
