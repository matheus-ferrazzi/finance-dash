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

export interface MarcaInput {
  mes: string; contaId: number | null; responsavel: 'Matheus' | 'Ariane'; nome: string | null; valor: number | null;
  /** false = conta fixa tirada só deste mês */
  pago: boolean;
}

/** Marcação da tela Contas do mês: ✓ ou "tirar do mês" numa conta fixa (contaId), ou conta avulsa (nome + valor). */
export function validarMarca(body: any): { ok: true; data: MarcaInput } | { ok: false; erro: string } {
  const mes = String(body?.mes ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, erro: 'mês inválido' };
  const responsavel = String(body?.responsavel ?? '');
  if (responsavel !== 'Matheus' && responsavel !== 'Ariane') return { ok: false, erro: 'responsável inválido' };
  const pago = body?.pago !== false;

  if (body?.contaId !== undefined && body?.contaId !== null) {
    const contaId = Number(body.contaId);
    if (!Number.isInteger(contaId) || contaId <= 0) return { ok: false, erro: 'conta inválida' };
    return { ok: true, data: { mes, contaId, responsavel, nome: null, valor: null, pago } };
  }
  if (!pago) return { ok: false, erro: 'só conta fixa pode ser tirada do mês' };
  const nome = String(body?.nome ?? '').trim();
  if (!nome || nome.length > 120) return { ok: false, erro: 'nome inválido' };
  const valor = Number(String(body?.valor ?? '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0 || valor >= 1_000_000) return { ok: false, erro: 'valor inválido' };
  return { ok: true, data: { mes, contaId: null, responsavel, nome, valor: Math.round(valor * 100) / 100, pago: true } };
}

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
