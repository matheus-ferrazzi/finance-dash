// E2: grava e desfaz as ações confirmadas pelo bot, com as mesmas funções das telas.
import { writerPool } from './db';
import { mesLabel, traduzCategoria } from './format';
import { apagarMarca, apagarRegra, categoriaDaRegra, alvoDaRegra, criarMarca, salvarRegra } from './queries';

type R = { ok: true; resumo: string; afetados?: number } | { ok: false; erro: string };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function marcar(id: number, estado: string, resultado: unknown) {
  await writerPool.query(`UPDATE financas_bot_acoes SET estado = $2, resultado = $3, atualizado_em = now() WHERE id = $1`, [id, estado, JSON.stringify(resultado)]);
}

export async function executarAcao(id: number): Promise<R> {
  const { rows } = await writerPool.query(`SELECT tipo, params, estado FROM financas_bot_acoes WHERE id = $1`, [id]);
  const a = rows[0];
  if (!a) return { ok: false, erro: 'Ação não encontrada.' };
  if (a.estado !== 'confirmada') return { ok: false, erro: `Ação em estado ${a.estado}.` };
  try {
    if (a.tipo === 'categoria') {
      const p = a.params;
      const alvo = await alvoDaRegra(p);
      if ('erro' in alvo) { await marcar(id, 'erro', alvo); return { ok: false, erro: alvo.erro }; }
      const anterior = await categoriaDaRegra(alvo.tipo, alvo.chave);
      const r = await salvarRegra(p);
      if ('erro' in r) { await marcar(id, 'erro', r); return { ok: false, erro: r.erro }; }
      await marcar(id, 'feita', { regraId: r.id, afetados: r.afetados, anterior: anterior?.categoria ?? null });
      return { ok: true, afetados: r.afetados, resumo: `${r.afetados} lançamento(s) → ${traduzCategoria(p.categoria)}` };
    }
    const p = a.params;
    // avulsa nasce marcada (pago = true, exigido pela tabela): fica "a confirmar" até o banco achar o pagamento
    const marcaId = await criarMarca({ mes: p.mes, contaId: null, responsavel: p.responsavel, nome: p.nome, valor: p.valor, pago: true });
    await marcar(id, 'feita', { marcaId });
    return { ok: true, resumo: `${p.nome} ${brl(p.valor)} nas contas de ${mesLabel(p.mes)}` };
  } catch (e) {
    await marcar(id, 'erro', { erro: e instanceof Error ? e.message : String(e) });
    return { ok: false, erro: 'Não consegui gravar.' };
  }
}

export async function desfazerAcao(id: number, pessoa: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { rows } = await writerPool.query(
    `SELECT tipo, params, resultado FROM financas_bot_acoes WHERE id = $1 AND pessoa = $2 AND estado = 'feita' AND atualizado_em > now() - interval '24 hours'`,
    [id, pessoa]);
  const a = rows[0];
  if (!a) return { ok: false, erro: 'Nada para desfazer.' };
  if (a.tipo === 'categoria') {
    // havia regra antes: regrava a categoria anterior; não havia: apaga a regra (volta ao banco ou a outra regra)
    if (a.resultado.anterior) await salvarRegra({ ...a.params, categoria: a.resultado.anterior });
    else await apagarRegra(a.resultado.regraId);
  } else {
    await apagarMarca(a.resultado.marcaId);
  }
  await writerPool.query(`UPDATE financas_bot_acoes SET estado = 'desfeita', atualizado_em = now() WHERE id = $1`, [id]);
  return { ok: true };
}
