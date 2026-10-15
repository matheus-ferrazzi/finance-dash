// Contas do mês: a lista de papel da Ariane, conferida com o banco.
// Regra central: só o banco confirma pagamento. O ✓ na mão e o valor digitado ficam "a confirmar"
// até aparecer no banco um pagamento da mesma pessoa que case — e aí vale o valor do banco.

/** Conta que se repete todo mês ("Seguro", "Escola"), com o padrão que a reconhece no extrato. */
export interface ContaFixa {
  id: number; nome: string; responsavel: string; valorPrevisto: number;
  /** regex (sem diferença de maiúscula) sobre a descrição do lançamento: destinatário/boleto */
  padrao: string;
  /** só lançamentos deste banco (evita contar o espelho da mesma fatura em duas contas) */
  banco: string | null;
  /** fração aceita em torno do previsto (padrão genérico, ex. PIX para o Matheus); null = qualquer valor */
  tolerancia: number | null;
  /** soma todos os pagamentos do mês (consulta 300 + 50, MEI em duas guias) em vez de pegar um */
  somar: boolean;
  /** 'YYYY-MM' do primeiro mês; com `parcelas`, a conta some depois da última */
  inicio: string; parcelas: number | null; ordem: number;
  /** 'YYYY-MM' do último mês ("remover de vez"); os meses anteriores continuam no histórico */
  ate: string | null;
  /** 'YYYY-MM' em que o valor foi alterado na tela: dali em diante vale o valorPrevisto, não o histórico */
  valorDefinidoEm: string | null;
}

/** Marcação feita na tela: ✓ numa conta fixa (contaId), conta tirada do mês (contaId + pago=false) ou avulsa (nome + valor). */
export interface Marca { id: number; mes: string; contaId: number | null; responsavel: string; nome: string | null; valor: number | null; pago: boolean; }

/** Saída de dinheiro vinda do banco (Pluggy). */
export interface Mov { id: string; data: string; valor: number; descricao: string; banco: string; responsavel: string; }

export type Status = 'pago' | 'a_confirmar' | 'falta';

export interface ItemConta {
  contaId: number | null; marcaId: number | null; nome: string; responsavel: string;
  previsto: number; pago: number | null; status: Status; dia: number | null;
  /** dia em que costuma vencer: o do último pagamento nos 3 meses anteriores; null sem histórico ou avulsa */
  vence?: number | null;
  parcela: string | null; avulsa: boolean;
  /** pagamento do banco que confirmou (base do "repetir todo mês"); null se não pago */
  origem: { descricao: string; banco: string } | null;
}

export interface Tirada { contaId: number; marcaId: number; nome: string; responsavel: string; }

export interface ResumoMes {
  mes: string; entrou: number; total: number; pago: number; aConfirmar: number; falta: number; sobra: number;
  itens: ItemConta[];
  /** contas tiradas só deste mês (ex.: Sabesp riscada no caderno) — para poder desfazer */
  tiradas: Tirada[];
}

const TOLERANCIA_AVULSA = 0.01;
const MESES_PARA_PREVISTO = 3;

const r2 = (x: number) => Math.round(x * 100) / 100;

function mesesEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((m) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1);
  return b - a;
}

function addMes(mes: string, n: number): string {
  const t = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function casaConta(c: ContaFixa, m: Mov): boolean {
  return m.responsavel === c.responsavel && (!c.banco || m.banco === c.banco) && new RegExp(c.padrao, 'i').test(m.descricao);
}

/** Pagamentos que confirmam a conta no mês, entre os ainda não usados. */
function pagamentosDaConta(c: ContaFixa, previsto: number, movs: readonly Mov[], usados: Set<string>): Mov[] {
  const cand = movs.filter((m) => !usados.has(m.id) && casaConta(c, m)
    && (c.tolerancia === null || Math.abs(m.valor - previsto) <= previsto * c.tolerancia));
  if (c.somar || cand.length === 0) return cand;
  return [cand.reduce((a, b) => (Math.abs(b.valor - previsto) < Math.abs(a.valor - previsto) ? b : a))];
}

/**
 * Monta as contas de um mês. `movs` pode trazer meses anteriores: o previsto de cada conta é o último
 * valor pago nos 3 meses anteriores (conta variável — Vivo, Sabesp, fatura), ou o cadastrado.
 */
export function montarMes(mes: string, contas: readonly ContaFixa[], marcas: readonly Marca[], movs: readonly Mov[], entrou = 0): ResumoMes {
  const doMes = movs.filter((m) => m.data.slice(0, 7) === mes);
  const marcasMes = marcas.filter((m) => m.mes === mes);
  const usados = new Set<string>();
  const itens: ItemConta[] = [];
  const tiradas: Tirada[] = [];

  for (const c of [...contas].sort((a, b) => a.ordem - b.ordem)) {
    const k = mesesEntre(c.inicio, mes);
    if (k < 0 || (c.parcelas !== null && k >= c.parcelas) || (c.ate !== null && mes > c.ate)) continue;

    let previsto = c.valorPrevisto;
    let vence: number | null = null;
    const definido = c.valorDefinidoEm !== null && mes >= c.valorDefinidoEm; // valor alterado na tela vence o histórico
    for (let i = 1; i <= MESES_PARA_PREVISTO; i++) {
      const ant = movs.filter((m) => m.data.slice(0, 7) === addMes(mes, -i));
      const pg = pagamentosDaConta(c, c.valorPrevisto, ant, new Set());
      if (!pg.length) continue;
      if (!definido) previsto = r2(pg.reduce((s, m) => s + m.valor, 0));
      vence = Number(pg.map((m) => m.data).sort().at(-1)!.slice(8, 10));
      break;
    }

    const pg = pagamentosDaConta(c, previsto, doMes, usados);
    pg.forEach((m) => usados.add(m.id));
    const marca = marcasMes.find((m) => m.contaId === c.id && m.pago) ?? null;
    const tirada = marcasMes.find((m) => m.contaId === c.id && !m.pago);
    if (tirada && !pg.length) { // o banco vence: paga aparece mesmo tirada
      tiradas.push({ contaId: c.id, marcaId: tirada.id, nome: c.nome, responsavel: c.responsavel });
      continue;
    }
    itens.push({
      contaId: c.id, marcaId: marca?.id ?? null, nome: c.nome, responsavel: c.responsavel, previsto,
      pago: pg.length ? r2(pg.reduce((s, m) => s + m.valor, 0)) : null,
      status: pg.length ? 'pago' : marca ? 'a_confirmar' : 'falta',
      dia: pg.length ? Number(pg.map((m) => m.data).sort().at(-1)!.slice(8, 10)) : null, vence,
      parcela: c.parcelas !== null ? `${k + 1}/${c.parcelas}` : null, avulsa: false,
      origem: pg.length ? { descricao: pg[0].descricao, banco: pg[0].banco } : null,
    });
  }

  for (const a of marcasMes.filter((m) => m.contaId === null)) {
    const previsto = a.valor ?? 0;
    const m = doMes.find((x) => !usados.has(x.id) && x.responsavel === a.responsavel
      && Math.abs(x.valor - previsto) <= previsto * TOLERANCIA_AVULSA);
    if (m) usados.add(m.id);
    itens.push({
      contaId: null, marcaId: a.id, nome: a.nome ?? 'Avulsa', responsavel: a.responsavel, previsto,
      pago: m ? m.valor : null, status: m ? 'pago' : a.pago ? 'a_confirmar' : 'falta',
      dia: m ? Number(m.data.slice(8, 10)) : null, parcela: null, avulsa: true,
      origem: m ? { descricao: m.descricao, banco: m.banco } : null,
    });
  }

  const total = r2(itens.reduce((s, i) => s + (i.pago ?? i.previsto), 0));
  const pago = r2(itens.reduce((s, i) => s + (i.pago ?? 0), 0));
  const aConfirmar = r2(itens.filter((i) => i.status === 'a_confirmar').reduce((s, i) => s + i.previsto, 0));
  return { mes, entrou: r2(entrou), total, pago, aConfirmar, falta: r2(total - pago), sobra: r2(entrou - total), itens, tiradas };
}

/**
 * Padrão de conta fixa a partir da descrição real do pagamento ("repetir todo mês"): sem números
 * (data, parcela, código que muda todo mês), regex escapada, espaço variável entre as palavras.
 */
export function padraoDe(descricao: string): string {
  return descricao.replace(/[\d/]+/g, ' ').trim().split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
}

/**
 * Número do topo da tela de contas (N6, auditoria 13/10). O caderno é da Ariane: "entrou − contas" só faz
 * sentido na visão de quem tem o caderno. No casal, o que responde "vai sobrar?" é a previsão.
 */
export function destaqueDoTopo(
  resp: 'casal' | 'Matheus' | 'Ariane', r: { entrou: number; total: number; sobra: number }, fechaCom: number | null,
  quando: 'atual' | 'passado' | 'futuro' = 'atual',
): { label: string; valor: number | null; hint: string } {
  if (resp === 'casal') {
    if (quando === 'passado') return { label: 'O mês fechou com', valor: fechaCom, hint: 'real: entrou − saiu' };
    if (quando === 'futuro') return { label: 'O mês fecha em', valor: null, hint: 'veja a previsão' };
    return { label: 'O mês fecha em', valor: fechaCom, hint: 'pela previsão' };
  }
  if (r.total <= 0) return { label: 'Sobra do caderno', valor: null, hint: 'sem contas no caderno' };
  if (r.entrou <= 0) return { label: 'Sobra do caderno', valor: null, hint: 'quando o salário cair' };
  return { label: 'Sobra do caderno', valor: r.sobra, hint: 'entrou − contas do caderno (cartão e dia a dia fora)' };
}

const semAcentoC = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Onda 5: o topo de Contas é o que falta; a lista começa por ele (por vencimento) e as pagas ficam recolhidas. */
export function separarContas(itens: ItemConta[]): { falta: ItemConta[]; pagas: ItemConta[] } {
  const v = (i: ItemConta) => i.vence ?? 99;
  return {
    falta: itens.filter((i) => i.status !== 'pago').sort((a, b) => v(a) - v(b)),
    pagas: itens.filter((i) => i.status === 'pago').sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99)),
  };
}

/** Conta do caderno que é a fatura de um cartão (ex.: "Crédito Neon" da Ariane): mesma pessoa, nome contém o banco. */
export function contaEhFatura(item: { nome: string; responsavel: string }, cartoes: readonly { banco: string; responsavel: string }[]) {
  const c = cartoes.find((f) => f.responsavel === item.responsavel && semAcentoC(item.nome).includes(semAcentoC(f.banco)));
  return c ? { banco: c.banco, responsavel: c.responsavel } : null;
}
