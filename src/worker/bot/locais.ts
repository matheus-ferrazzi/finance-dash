// E2: ferramentas que rodam no worker — busca (guarda as refs L1..L5) e propostas (não gravam: só criam a proposta).
import { traduzCategoria } from '../../lib/format';
import type { PgAcoes } from './acoes';
import { textoLista, textoPropostaAvulsa, textoPropostaCategoria } from './acoesTextos';

type Res = { ok: boolean; dados: any };
type Item = { id: string; data: string; valor: number; descricao: string; pessoa: string; categoria: string };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const proxMes = (m: string) => { const [a, b] = m.split('-').map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, '0')}`; };
const TIPO = { este: 'lancamento', pessoa: 'doc', texto: 'texto' } as const;

export function criarLocais(d: {
  pessoa: string; hoje: string; refs: Map<string, Map<string, Item>>;
  painel: (c: string) => Promise<Res>; painelPost: (c: string, corpo: object) => Promise<Res>; acoes: Pick<PgAcoes, 'criar'>;
}): Record<string, (args: any) => Promise<Res>> {
  return {
    async buscar_lancamentos(a) {
      const q = new URLSearchParams();
      if (a.texto) q.set('texto', String(a.texto));
      if (a.valor) q.set('valor', String(a.valor));
      if (a.periodo) q.set('periodo', String(a.periodo));
      q.set('pessoa', a.pessoa === 'eu' ? d.pessoa : String(a.pessoa ?? 'casal'));
      const r = await d.painel(`/api/bot/buscar?${q}`);
      if (!r.ok) return r;
      const itens: Item[] = r.dados.itens ?? [];
      d.refs.set(d.pessoa, new Map(itens.map((x, i) => [`L${i + 1}`, x])));
      const paraModelo = itens.map(({ id: _id, ...x }, i) => ({ ref: `L${i + 1}`, ...x }));
      return { ok: true, dados: { itens: paraModelo, ...(itens.length > 1 ? { lista: textoLista(paraModelo) } : {}), ...(itens.length ? {} : { aviso: 'nenhum gasto encontrado' }) } };
    },
    async propor_categoria(a) {
      const it = d.refs.get(d.pessoa)?.get(String(a.ref));
      if (!it) return { ok: false, dados: { erro: 'ref desconhecida: use buscar_lancamentos e uma ref L1..L5 que ela devolveu' } };
      const escopo = a.escopo as 'este' | 'pessoa' | 'texto';
      const corpo: any = { idTransacao: it.id, escopo, categoria: a.categoria, ...(a.texto ? { texto: a.texto } : {}) };
      const pr = await d.painelPost('/api/bot/previa', corpo);
      if (!pr.ok) return pr;
      const categoria = traduzCategoria(a.categoria);
      const params = { tipo: TIPO[escopo], idTransacao: it.id, categoria: a.categoria, ...(pr.dados.texto ? { texto: pr.dados.texto } : {}) };
      await d.acoes.criar(d.pessoa, 'categoria', params, `${pr.dados.afetados} lançamento(s) → ${categoria}`);
      return { ok: true, dados: { proposta: textoPropostaCategoria({ afetados: pr.dados.afetados, categoria, escopo, nome: pr.dados.nome, item: it }) } };
    },
    async propor_conta_avulsa(a) {
      const valor = Math.round(Number(a.valor) * 100) / 100;
      const mes = String(a.mes ?? d.hoje.slice(0, 7));
      const pessoa = !a.pessoa || a.pessoa === 'eu' ? d.pessoa : String(a.pessoa);
      const nome = String(a.nome ?? '').trim().slice(0, 60);
      if (!nome || !(valor >= 0.01 && valor <= 100000)) return { ok: false, dados: { erro: 'nome e valor entre 0,01 e 100.000' } };
      if (mes !== d.hoje.slice(0, 7) && mes !== proxMes(d.hoje.slice(0, 7))) return { ok: false, dados: { erro: 'mês: só o atual ou o próximo' } };
      if (pessoa !== 'Matheus' && pessoa !== 'Ariane') return { ok: false, dados: { erro: 'pessoa: Matheus ou Ariane' } };
      await d.acoes.criar(d.pessoa, 'avulsa', { mes, nome, valor, responsavel: pessoa }, `${nome} ${brl(valor)}`);
      return { ok: true, dados: { proposta: textoPropostaAvulsa({ nome, valor, mes, pessoa }) } };
    },
  };
}
