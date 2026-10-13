// E3: gasto em dinheiro vivo. Só as visões de gasto por categoria somam isto (de propósito);
// as contas do saldo do banco (previsão, ritmo, trilha) não leem esta tabela.
import { q, qw } from './db';
import { escaparLike } from './format';
import type { Resp } from './queries';

const r2 = (x: number) => Math.round(x * 100) / 100;
const filtroPessoa = (resp: Resp, idx: number) => (resp === 'casal' ? { sql: '', p: [] as string[] } : { sql: ` AND responsavel = $${idx}`, p: [resp] });

export async function getDinheiroPorCategoriaEntre(inicio: string, fimExcl: string, resp: Resp = 'casal'): Promise<Map<string, number>> {
  const f = filtroPessoa(resp, 3);
  const rows = await q<any>(
    `SELECT categoria, SUM(valor)::float8 AS v FROM financas_gastos_dinheiro
     WHERE data >= $1::date AND data < $2::date${f.sql} GROUP BY 1`, [inicio, fimExcl, ...f.p]);
  return new Map(rows.map((x) => [x.categoria as string, r2(Number(x.v))]));
}

export async function getGastosDinheiro(resp: Resp, inicio: string, fimExcl: string) {
  const f = filtroPessoa(resp, 3);
  const rows = await q<any>(
    `SELECT id, to_char(data,'YYYY-MM-DD') AS data, valor::float8 AS valor, descricao, categoria, responsavel AS pessoa
     FROM financas_gastos_dinheiro WHERE data >= $1::date AND data < $2::date${f.sql} ORDER BY data DESC, id DESC`, [inicio, fimExcl, ...f.p]);
  return rows.map((x) => ({ id: Number(x.id), data: x.data, valor: r2(Number(x.valor)), descricao: x.descricao, categoria: x.categoria, pessoa: x.pessoa }));
}

/** Busca na descrição dos gastos em dinheiro (tela Buscar), mais recentes primeiro, até 80. */
export async function buscarDinheiro(resp: Resp, termo: string) {
  const f = filtroPessoa(resp, 2);
  const rows = await q<any>(
    `SELECT id, to_char(data,'YYYY-MM-DD') AS data, valor::float8 AS valor, descricao, categoria, responsavel AS pessoa
     FROM financas_gastos_dinheiro WHERE descricao ILIKE '%' || $1 || '%'${f.sql} ORDER BY data DESC, id DESC LIMIT 80`, [escaparLike(termo), ...f.p]);
  return rows.map((x) => ({ id: Number(x.id), data: x.data, valor: r2(Number(x.valor)), descricao: x.descricao, categoria: x.categoria, pessoa: x.pessoa }));
}

export async function inserirDinheiro(g: { data: string; valor: number; descricao: string; categoria: string; responsavel: 'Matheus' | 'Ariane' }): Promise<number> {
  const rows = await qw<any>(
    `INSERT INTO financas_gastos_dinheiro (data, valor, descricao, categoria, responsavel) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [g.data, g.valor, g.descricao, g.categoria, g.responsavel]);
  return Number(rows[0].id);
}

export async function apagarDinheiro(id: number): Promise<boolean> {
  return (await qw<any>(`DELETE FROM financas_gastos_dinheiro WHERE id = $1 RETURNING id`, [id])).length > 0;
}

// mora em ./bot (puro); reexportado aqui para quem já soma o dinheiro
export { somarMapas } from './bot';
