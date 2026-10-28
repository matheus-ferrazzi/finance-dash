// E2: ferramentas que rodam no worker — busca (guarda as refs L1..L5) e propostas (não gravam: só criam a proposta).
import { traduzCategoria } from '../../lib/format';
import { CATEGORIAS_GASTO } from '../../lib/grupos';
import { explicacaoDaConta, type ContaDoMes } from '../../lib/previsao';
import type { PgAcoes } from './acoes';
import { textoLista, textoPropostaAvulsa, textoPropostaCategoria, textoPropostaDinheiro } from './acoesTextos';

type Res = { ok: boolean; dados: any };
type Item = { id: string; data: string; valor: number; descricao: string; pessoa: string; categoria: string };
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const proxMes = (m: string) => { const [a, b] = m.split('-').map(Number); return b === 12 ? `${a + 1}-01` : `${a}-${String(b + 1).padStart(2, '0')}`; };
const TIPO = { este: 'lancamento', pessoa: 'doc', texto: 'texto' } as const;
const REFS_VALEM = 5 * 60_000;
/** AAAA-MM-DD que existe no calendário (31/09 não). */
const dataReal = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const somaDias =(dt: string, n: number) => new Date(Date.parse(`${dt}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function criarLocais(d: {
  pessoa: string; hoje: string; refs: Map<string, { quando: number; itens: Map<string, Item> }>;
  painel: (c: string) => Promise<Res>; painelPost: (c: string, corpo: object) => Promise<Res>; acoes: Pick<PgAcoes, 'criar'>;
  /** 22/10: o que o Zeca mandou no grupo nas últimas 36 h (sem o aviso técnico, que é do privado) */
  mensagens?: () => Promise<{ tipo: string; quando: string; texto: string; conta?: ContaDoMes | null }[]>;
}): Record<string, (args: any) => Promise<Res>> {
  return {
    async mensagens_do_zeca() {
      if (!d.mensagens) return { ok: false, dados: { erro: 'mensagens indisponíveis' } };
      // 27/10: só o diário tem conta guardada — vira a explicação em frases, com os números daquela hora (os dois
      // "fecha em" rotulados, para a trava não aceitar um no lugar do outro)
      const mensagens = (await d.mensagens()).map(({ conta, ...m }) => (conta ? {
        ...m, explicacao: explicacaoDaConta(conta), pelaMediaFechaEm: conta.pelaMediaFechaEm, nessePassoFechaEm: conta.nessePassoFechaEm,
      } : m));
      return { ok: true, dados: { mensagens, ...(mensagens.length ? {} : { aviso: 'nenhuma mensagem nas últimas 36 horas' }) } };
    },
    async buscar_lancamentos(a) {
      const q = new URLSearchParams();
      if (a.texto) q.set('texto', String(a.texto));
      if (a.valor) q.set('valor', String(a.valor));
      if (a.periodo) q.set('periodo', String(a.periodo));
      q.set('pessoa', a.pessoa === 'eu' ? d.pessoa : String(a.pessoa ?? 'casal'));
      const r = await d.painel(`/api/bot/buscar?${q}`);
      if (!r.ok) return r;
      const itens: Item[] = r.dados.itens ?? [];
      d.refs.set(d.pessoa, { quando: Date.now(), itens: new Map(itens.map((x, i) => [`L${i + 1}`, x])) });
      const paraModelo = itens.map(({ id: _id, ...x }, i) => ({ ref: `L${i + 1}`, ...x }));
      return { ok: true, dados: { itens: paraModelo, ...(itens.length > 1 ? { lista: textoLista(paraModelo) } : {}), ...(itens.length ? {} : { aviso: 'nenhum gasto encontrado' }) } };
    },
    async propor_categoria(a) {
      // ref só vale da busca recente (5 min) da mesma pessoa
      const busca = d.refs.get(d.pessoa);
      const it = busca && Date.now() - busca.quando <= REFS_VALEM ? busca.itens.get(String(a.ref)) : undefined;
      if (!it) return { ok: false, dados: { erro: 'ref desconhecida ou velha: use buscar_lancamentos agora e uma ref L1..L5 que ela devolveu' } };
      const escopo = a.escopo as 'este' | 'pessoa' | 'texto';
      const corpo: any = { idTransacao: it.id, escopo, categoria: a.categoria, ...(a.texto ? { texto: a.texto } : {}) };
      const pr = await d.painelPost('/api/bot/previa', corpo);
      if (!pr.ok) return pr;
      const categoria = traduzCategoria(a.categoria);
      if (!(pr.dados.afetados > 0)) return { ok: false, dados: { erro: `já está em ${categoria}: nada muda` } };
      const params = { tipo: TIPO[escopo], idTransacao: it.id, categoria: a.categoria, ...(pr.dados.texto ? { texto: pr.dados.texto } : {}) };
      await d.acoes.criar(d.pessoa, 'categoria', params, `${pr.dados.afetados} lançamento(s) → ${categoria}`);
      return { ok: true, dados: { proposta: textoPropostaCategoria({ afetados: pr.dados.afetados, categoria, escopo, nome: pr.dados.nome, item: it }) } };
    },
    // E3: gasto em dinheiro vivo — d.hoje já é a data de SP (23h50 de SP continua "hoje", não o dia seguinte de UTC)
    async propor_gasto_dinheiro(a) {
      const valor = Math.round(Number(a.valor) * 100) / 100;
      const descricao = String(a.descricao ?? '').trim();
      const data = String(a.data ?? d.hoje);
      const pessoa = !a.pessoa || a.pessoa === 'eu' ? d.pessoa : String(a.pessoa);
      if (!(valor >= 0.01 && valor <= 10000)) return { ok: false, dados: { erro: 'valor entre 0,01 e 10.000' } };
      if (!descricao || descricao.length > 80) return { ok: false, dados: { erro: 'descrição de 1 a 80 letras' } };
      // só categoria de gasto: fatura/salário/investimento em dinheiro contariam o mesmo dinheiro duas vezes
      if (!CATEGORIAS_GASTO.includes(a.categoria)) return { ok: false, dados: { erro: 'categoria de gasto da lista' } };
      if (!dataReal(data)) return { ok: false, dados: { erro: 'essa data não existe (use AAAA-MM-DD)' } };
      if (data > d.hoje) return { ok: false, dados: { erro: 'data futura não vale: só de hoje até 30 dias atrás' } };
      if (data < somaDias(d.hoje, -30)) return { ok: false, dados: { erro: 'mais de 30 dias atrás não vale: só de hoje até 30 dias atrás' } };
      if (pessoa !== 'Matheus' && pessoa !== 'Ariane') return { ok: false, dados: { erro: 'pessoa: Matheus ou Ariane' } };
      const categoria = traduzCategoria(a.categoria);
      await d.acoes.criar(d.pessoa, 'dinheiro', { data, valor, descricao, categoria: a.categoria, responsavel: pessoa }, `💵 ${descricao} ${brl(valor)}`);
      return { ok: true, dados: { proposta: textoPropostaDinheiro({ valor, descricao, categoria, data, pessoa }) } };
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
