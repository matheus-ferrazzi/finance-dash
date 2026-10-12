// E2: grava e desfaz as ações confirmadas pelo bot, com as mesmas funções das telas.
import { writerPool } from './db';
import { mesLabel, traduzCategoria } from './format';
import { alvoDaRegra, apagarRegra, categoriaDaRegra, criarMarca, salvarRegra } from './queries';

type R = { ok: true; resumo: string; afetados?: number } | { ok: false; erro: string };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function marcar(id: number, estado: string, resultado: unknown) {
  await writerPool.query(`UPDATE financas_bot_acoes SET estado = $2, resultado = $3, atualizado_em = now() WHERE id = $1`, [id, estado, JSON.stringify(resultado)]);
}

export async function executarAcao(id: number): Promise<R> {
  // reivindica a ação: só um executar passa de 'confirmada' para 'executando' (dois pedidos juntos não gravam duas vezes)
  const { rows } = await writerPool.query(
    `UPDATE financas_bot_acoes SET estado = 'executando', atualizado_em = now() WHERE id = $1 AND estado = 'confirmada' RETURNING tipo, params`, [id]);
  const a = rows[0];
  if (!a) {
    const atual = (await writerPool.query(`SELECT estado FROM financas_bot_acoes WHERE id = $1`, [id])).rows[0];
    return { ok: false, erro: atual ? `Ação em estado ${atual.estado}.` : 'Ação não encontrada.' };
  }
  try {
    if (a.tipo === 'categoria') {
      const p = a.params;
      const alvo = await alvoDaRegra(p);
      if ('erro' in alvo) { await marcar(id, 'erro', alvo); return { ok: false, erro: alvo.erro }; }
      const anterior = await categoriaDaRegra(alvo.tipo, alvo.chave);
      const r = await salvarRegra(p);
      if ('erro' in r) { await marcar(id, 'erro', r); return { ok: false, erro: r.erro }; }
      // guarda como ficou (tipo, chave, categoria) para o desfazer conferir que ninguém mudou depois
      await marcar(id, 'feita', { regraId: r.id, afetados: r.afetados, anterior: anterior?.categoria ?? null, tipo: alvo.tipo, chave: alvo.chave, categoria: p.categoria });
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
    const res = a.resultado;
    // se a regra mudou depois (pela tela ou outra ação), desfazer apagaria a mudança de alguém: recusa
    const atual = await categoriaDaRegra(res.tipo, res.chave);
    if (!atual || atual.categoria !== res.categoria) return { ok: false, erro: 'essa categoria mudou depois; desfaça pelo painel' };
    if (res.anterior) {
      const r = await salvarRegra({ ...a.params, categoria: res.anterior });
      if ('erro' in r) return { ok: false, erro: r.erro };
    } else if (!(await apagarRegra(res.regraId))) {
      return { ok: false, erro: 'a regra já não existe' };
    }
  } else {
    const del = await writerPool.query(`DELETE FROM financas_contas_marcas WHERE id = $1 RETURNING id`, [a.resultado.marcaId]);
    if (!del.rowCount) return { ok: false, erro: 'essa conta já não existe nas contas do mês' };
  }
  await writerPool.query(`UPDATE financas_bot_acoes SET estado = 'desfeita', atualizado_em = now() WHERE id = $1`, [id]);
  return { ok: true };
}
