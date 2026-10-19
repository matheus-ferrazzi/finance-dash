import { montarLinha } from './linha';
import {
  formaDoTipo, montarFatura, montarHistorico, montarInvestimento, montarSaldo,
} from './montar';
import type { PluggyApi } from './pluggy';
import { contarDiferencas, planejarReconciliacao, semGemeosDePagamento } from './reconciliar';
import type { Repo } from './repositorio';
import { lerPrecosTesouro, precoDoTitulo, tituloDoNome } from './tesouro';
import type { Conta, Execucao, Modo } from './tipos';

export interface Contexto {
  pluggy: PluggyApi;
  repo: Repo;
  modo: Modo;
  agora: () => Date;
  log: (m: string) => void;
  /** 17/10: o CSV de preços do Tesouro Transparente (tarefa `tesouro`) */
  tesouro?: () => Promise<string>;
}
export interface OpcoesTarefa {
  desde?: string;
  limite?: number;
}
export type NomeTarefa = 'transacoes' | 'faturas' | 'saldos' | 'investimentos' | 'itens' | 'tesouro';

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const chave = (c: Conta) => `${c.banco}/${c.responsavel}/${c.forma}`;

/** AAAA-MM-DD em São Paulo, n dias antes de agora */
function diaSP(agora: Date, menosDias: number): string {
  const d = new Date(agora.getTime() - menosDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

async function executar(
  ctx: Contexto,
  tarefa: NomeTarefa,
  corpo: (contagens: Record<string, unknown>, falhas: string[]) => Promise<void>,
): Promise<Execucao> {
  const inicio = ctx.agora().toISOString();
  const contagens: Record<string, unknown> = {};
  const falhas: string[] = [];
  let erro: string | null = null;
  try {
    await corpo(contagens, falhas);
  } catch (e) {
    erro = msg(e);
  }
  if (falhas.length) contagens.falhas = falhas;
  const ex: Execucao = { tarefa, modo: ctx.modo, inicio, fim: ctx.agora().toISOString(), ok: erro === null && falhas.length === 0, contagens, erro };
  await ctx.repo.registrarExecucao(ex);
  return ex;
}

/** Contas ativas com o item resolvido. Em sombra/real grava o item descoberto em pluggy_contas. */
async function contasComItem(ctx: Contexto, filtro: (c: Conta) => boolean): Promise<Conta[]> {
  const out: Conta[] = [];
  for (const c of (await ctx.repo.contasAtivas()).filter(filtro)) {
    if (c.item_id) {
      out.push(c);
      continue;
    }
    const a = await ctx.pluggy.conta(c.account_id);
    if (ctx.modo !== 'dry-run') await ctx.repo.definirItemDaConta(c.account_id, a.itemId);
    out.push({ ...c, item_id: a.itemId });
  }
  return out;
}

/** Um representante (banco/responsável) por item. */
function porItem(contas: readonly Conta[]): Map<string, Conta> {
  const m = new Map<string, Conta>();
  for (const c of contas) if (c.item_id && !m.has(c.item_id)) m.set(c.item_id, c);
  return m;
}

/** CPFs dos titulares, só em memória. Falha de identidade não para a ingestão. */
async function documentosDoCasal(ctx: Contexto, contas: readonly Conta[]): Promise<Set<string>> {
  const docs = new Set<string>();
  for (const itemId of porItem(contas).keys()) {
    try {
      const d = await ctx.pluggy.documentoTitular(itemId);
      if (d) docs.add(d);
    } catch (e) {
      ctx.log(`identidade indisponivel: ${msg(e)}`);
    }
  }
  return docs;
}

async function transacoes(ctx: Contexto, opts: OpcoesTarefa) {
  return executar(ctx, 'transacoes', async (contagens, falhas) => {
    const desde = opts.desde ?? diaSP(ctx.agora(), 60);
    contagens.desde = desde;
    const contas = await contasComItem(ctx, (c) => c.coleta_transacoes);
    const docs = await documentosDoCasal(ctx, contas);
    const porConta: Record<string, unknown> = {};
    for (const c of contas) {
      try {
        const txs = await ctx.pluggy.transacoes(c.account_id, desde);
        // auditoria 18/10: a cópia "só data" do pagamento de fatura do Nubank não vira linha; a que já está no banco
        // sai pela reconciliação (vai para financas_lancamentos_removidos). A crua fica gravada como veio.
        const uteis = semGemeosDePagamento(txs);
        // relidas a cada conta: uma regra salva no painel durante a execução vale já, e não é desfeita
        const regras = await ctx.repo.regrasPainel();
        const linhas = uteis.map((t) => montarLinha(t, c, docs, regras));
        const banco = await ctx.repo.lancamentosDaConta(c, desde);
        const dif = contarDiferencas(banco, linhas);
        // Só é candidata a remoção a linha dentro do que a Pluggy de fato cobriu:
        // - o dia exato de "desde" fica fora (a Pluggy filtra por data-hora, o banco guarda só a data);
        // - nada antes da transação mais antiga devolvida: Itaú e Inter só expõem 12 meses, e
        //   "não veio" por estar fora do histórico do banco não é "foi cancelado".
        const maisAntiga = linhas.reduce((m, l) => (l.data_lancamento < m ? l.data_lancamento : m), '9999-12-31');
        const candidatos = [...banco.values()]
          .filter((l) => String(l.data_lancamento) > desde && String(l.data_lancamento) >= maisAntiga)
          .map((l) => l.id_transacao);
        const plano = planejarReconciliacao(new Set(uteis.map((t) => t.id)), candidatos, opts.limite);
        if (ctx.modo !== 'dry-run') await ctx.repo.gravarCruas(txs);
        if (ctx.modo === 'real') await ctx.repo.aplicarConta(linhas, plano.remover);
        porConta[chave(c)] = { pluggy: txs.length, ...dif, remover: plano.remover.length, abortado: plano.abortado };
      } catch (e) {
        falhas.push(`${chave(c)}: ${msg(e)}`);
      }
    }
    contagens.contas = porConta;
    // N2: as duas pontas só existem juntas depois de todas as contas gravadas
    if (ctx.modo === 'real') contagens.pareadas = await ctx.repo.parearTransferencias(desde);
  });
}

async function faturas(ctx: Contexto) {
  return executar(ctx, 'faturas', async (contagens, falhas) => {
    const agoraIso = ctx.agora().toISOString();
    const porConta: Record<string, unknown> = {};
    for (const c of await contasComItem(ctx, (x) => x.coleta_faturas)) {
      try {
        const account = await ctx.pluggy.conta(c.account_id);
        const bills = await ctx.pluggy.faturas(c.account_id);
        const atual = montarFatura(account, bills, c, agoraIso);
        if (ctx.modo === 'real') {
          await ctx.repo.upsertFatura(atual);
          await ctx.repo.upsertFaturasHistorico(montarHistorico(c.account_id, bills));
        }
        porConta[chave(c)] = { faturas: bills.length, vencimento: atual.data_vencimento, valor: atual.valor_fatura_atual };
      } catch (e) {
        falhas.push(`${chave(c)}: ${msg(e)}`);
      }
    }
    contagens.contas = porConta;
  });
}

async function saldos(ctx: Contexto) {
  return executar(ctx, 'saldos', async (contagens, falhas) => {
    const porConta: Record<string, unknown> = {};
    for (const c of await contasComItem(ctx, (x) => x.coleta_saldo)) {
      try {
        const s = montarSaldo(await ctx.pluggy.conta(c.account_id), c);
        if (ctx.modo === 'real') await ctx.repo.upsertSaldo(s);
        porConta[chave(c)] = { saldo: s.saldo };
      } catch (e) {
        falhas.push(`${chave(c)}: ${msg(e)}`);
      }
    }
    contagens.contas = porConta;
  });
}

async function investimentos(ctx: Contexto) {
  return executar(ctx, 'investimentos', async (contagens, falhas) => {
    const agoraIso = ctx.agora().toISOString();
    const porItemOut: Record<string, number> = {};
    for (const [itemId, c] of porItem(await contasComItem(ctx, (x) => x.coleta_investimentos))) {
      try {
        const invs = await ctx.pluggy.investimentos(itemId);
        for (const inv of invs) {
          const i = montarInvestimento(inv, { banco: c.banco, responsavel: c.responsavel }, agoraIso);
          if (ctx.modo === 'real') await ctx.repo.upsertInvestimento(i);
        }
        porItemOut[`${c.banco}/${c.responsavel}`] = invs.length;
      } catch (e) {
        falhas.push(`${c.banco}/${c.responsavel}: ${msg(e)}`);
      }
    }
    contagens.itens = porItemOut;
  });
}

async function itens(ctx: Contexto) {
  return executar(ctx, 'itens', async (contagens, falhas) => {
    const contas = await contasComItem(ctx, () => true);
    // inclui as desligadas: conta registrada não é "descoberta" de novo a cada hora
    const conhecidas = await ctx.repo.idsRegistrados();
    const novas: string[] = [];
    for (const [itemId, c] of porItem(contas)) {
      try {
        const it = await ctx.pluggy.item(itemId);
        if (ctx.modo !== 'dry-run') await ctx.repo.upsertItem(itemId, c.banco, c.responsavel, it);
        if (ctx.modo === 'real' && it.lastUpdatedAt) await ctx.repo.registrarSync(c.banco, c.responsavel, it.lastUpdatedAt);
        for (const a of await ctx.pluggy.contasDoItem(itemId)) {
          const forma = formaDoTipo(a.type);
          if (conhecidas.has(a.id) || !forma) continue;
          const nova: Conta = {
            account_id: a.id, item_id: itemId, banco: c.banco, responsavel: c.responsavel, forma,
            coleta_transacoes: true, coleta_saldo: forma === 'Débito', coleta_faturas: forma === 'Crédito', coleta_investimentos: false,
          };
          if (ctx.modo !== 'dry-run') await ctx.repo.inserirConta(nova, a.type);
          novas.push(chave(nova));
        }
      } catch (e) {
        falhas.push(`${c.banco}/${c.responsavel}: ${msg(e)}`);
      }
    }
    if (novas.length) contagens.contasNovas = novas;
  });
}

/**
 * 17/10: títulos do Tesouro de conexão desligada (o Inter saiu do Meu Pluggy): valor bruto = quantidade × PU de
 * resgate do dia mais recente do Tesouro Transparente. Sem título nessa situação, nem baixa o arquivo (~14 MB).
 */
async function tesouro(ctx: Contexto) {
  return executar(ctx, 'tesouro', async (contagens, falhas) => {
    const titulos = await ctx.repo.titulosSemConexao();
    const feitos: string[] = [];
    contagens.titulos = feitos;
    if (!titulos.length) return;
    if (!ctx.tesouro) throw new Error('sem fonte de preços do Tesouro');
    const precos = lerPrecosTesouro(await ctx.tesouro());
    for (const t of titulos) {
      const rot = `${t.banco}/${t.responsavel} ${t.nome}`;
      const tit = tituloDoNome(t.nome);
      const p = tit && precoDoTitulo(precos, tit);
      if (!p) { falhas.push(`${rot}: sem preço no Tesouro Transparente`); continue; }
      const valor = Math.round(t.quantidade * p.pu * 100) / 100;
      if (ctx.modo === 'real') await ctx.repo.atualizarValorTitulo(t.id_investimento, valor, ctx.agora().toISOString());
      feitos.push(`${rot}: ${valor} (${p.data})`);
    }
  });
}

export const TAREFAS: Record<NomeTarefa, (ctx: Contexto, opts: OpcoesTarefa) => Promise<Execucao>> = {
  transacoes,
  faturas,
  saldos,
  investimentos,
  itens,
  tesouro,
};
