import type { CompromissoInput } from './queries';

export const CATEGORIAS_COMPROMISSO = [
  'Housing', 'Electricity', 'Water', 'Internet', 'Telecommunications', 'Gas',
  'Insurance', 'Education', 'Automotive', 'Loans and financing', 'Services', 'Outros',
] as const;

const CATEGORIAS_VALIDAS = new Set<string>(CATEGORIAS_COMPROMISSO);
const RESPONSAVEIS_VALIDOS = new Set(['casal', 'Matheus', 'Ariane']);

export type ValidacaoResult =
  | { ok: true; data: CompromissoInput }
  | { ok: false; erro: string };

export function validarCompromisso(body: any): ValidacaoResult {
  const nome = String(body?.nome ?? '').trim();
  if (!nome || nome.length > 200) return { ok: false, erro: 'nome inválido' };

  const categoria = String(body?.categoria ?? '');
  if (!CATEGORIAS_VALIDAS.has(categoria)) return { ok: false, erro: 'categoria inválida' };

  const valor = Number(body?.valor);
  if (!Number.isFinite(valor) || valor <= 0 || valor > 1_000_000) return { ok: false, erro: 'valor inválido' };

  const responsavel = String(body?.responsavel ?? '');
  if (!RESPONSAVEIS_VALIDOS.has(responsavel)) return { ok: false, erro: 'responsável inválido' };

  const dataInicio = String(body?.dataInicio ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) return { ok: false, erro: 'data inválida' };

  let mesesTotais: number | null = null;
  if (body?.mesesTotais !== null && body?.mesesTotais !== undefined && body?.mesesTotais !== '') {
    mesesTotais = Number(body.mesesTotais);
    if (!Number.isInteger(mesesTotais) || mesesTotais <= 0 || mesesTotais > 360) {
      return { ok: false, erro: 'meses inválido' };
    }
  }

  const observacao = body?.observacao ? String(body.observacao).slice(0, 500) : null;

  return {
    ok: true,
    data: { nome, categoria, valor, responsavel: responsavel as any, dataInicio, mesesTotais, observacao },
  };
}
