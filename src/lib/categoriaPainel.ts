// Categoria pelo painel (F4): uma função só decide a categoria efetiva — usada pelo painel e pelo worker.
// Só imports relativos: o worker empacota este arquivo sem o alias "@".
import { classificar } from '../worker/classificar';

export type TipoRegra = 'lancamento' | 'doc' | 'texto';
export type Origem = TipoRegra | 'banco';
export interface RegraPainel { id: number; tipo: TipoRegra; chave: string; categoria: string }
export interface LancParaRegra {
  id: string; descricao: string; contraparteDoc: string | null; categoriaBanco: string;
  saida: boolean; forma: string; responsavel: string;
}

export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/** Texto sugerido para a regra: a descrição sem números, "*" e "/". */
export function sugerirTexto(descricao: string): string {
  return normalizarTexto(descricao.replace(/[0-9*/]/g, ' '));
}

/** Só este lançamento > pessoa/empresa > texto (mais longo; empate, mais nova) > banco. Regra do painel manda sempre. */
export function categoriaEfetiva(
  l: Pick<LancParaRegra, 'id' | 'descricao' | 'contraparteDoc' | 'categoriaBanco'>, regras: readonly RegraPainel[],
): { categoria: string; origem: Origem } {
  const so = regras.find((r) => r.tipo === 'lancamento' && r.chave === l.id);
  if (so) return { categoria: so.categoria, origem: 'lancamento' };
  const doc = l.contraparteDoc
    ? regras.filter((r) => r.tipo === 'doc' && r.chave === l.contraparteDoc).sort((a, b) => b.id - a.id)[0]
    : undefined;
  if (doc) return { categoria: doc.categoria, origem: 'doc' };
  const d = normalizarTexto(l.descricao);
  const texto = regras
    .filter((r) => r.tipo === 'texto' && r.chave.length > 0 && d.includes(r.chave))
    .sort((a, b) => b.chave.length - a.chave.length || b.id - a.id)[0];
  if (texto) return { categoria: texto.categoria, origem: 'texto' };
  return { categoria: l.categoriaBanco, origem: 'banco' };
}

/** Categoria efetiva e a classe que ela implica (o mesmo classificar do worker). */
export function recalcular(l: LancParaRegra, regras: readonly RegraPainel[]): { categoria: string; classe: string; origem: Origem } {
  const e = categoriaEfetiva(l, regras);
  return { ...e, classe: classificar(e.categoria, l.descricao, l.saida, l.forma, l.responsavel) };
}

// CNPJ (14 dígitos, com ou sem pontuação), CPF (11) e qualquer sequência longa de dígitos
const DOCUMENTO = /\d\d?\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11,}/g;

/** O nome da contraparte para a tela: sem CPF/CNPJ (a razão social de MEI traz o CPF). Vazio → null. */
export function nomeSemDocumento(nome: string | null | undefined): string | null {
  const n = (nome ?? '').replace(DOCUMENTO, ' ').replace(/\s+/g, ' ').trim();
  return n.length ? n : null;
}

