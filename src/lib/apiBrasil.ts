// Consulta de crédito sob demanda na API Brasil (14/11/2026, fase "nome limpo" da Trilha). Duas consultas por CPF:
// - Dossiê de Crédito PF (`dossie-credito-pf`): pendências financeiras, refin, protestos e cheques, com credor e valor;
// - Endividamento Bancário PF (`endividamento-pf`): SCR do Banco Central (a vencer, vencido, prejuízo) e score.
// A resposta traz dados cadastrais (nome, mãe, endereço, telefone): nada disso sai daqui. Fica só o que é dívida e o
// score. Valores vêm como texto brasileiro ("1.000,00"). Em homologação (`homolog: true`) a resposta é fictícia e
// gratuita: serve para testar, nunca para gravar dívida.

export const URL_API_BRASIL = 'https://gateway.apibrasil.io/api/v2/consulta/cpf/credits';

/** Blocos do dossiê que são dívida; o resto (cadastro, telefones, ações cíveis, empresas) fica de fora. */
const BLOCOS_DIVIDA = ['pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico', 'ch_sem_fundos_bacen', 'ch_sem_fundos_varejo'] as const;
/** Os que viram linha em "dívidas fora do banco" (cheque e síntese só entram no resumo). */
const BLOCOS_LINHA: Record<string, string> = { pend_financeiras: 'pendência', pend_refin: 'refin', protestos: 'protesto' };

// A documentação não publica os campos de cada ocorrência (o exemplo vem vazio): procura pelos nomes prováveis e,
// sem credor ou valor legível, conta como "não lida" (o bloco cru fica guardado na consulta para ajustar depois).
const CHAVES_CREDOR = ['credor', 'nome_credor', 'informante', 'empresa', 'razao_social', 'cedente', 'apresentante', 'nome_cartorio', 'cartorio', 'instituicao', 'origem'];
const CHAVES_VALOR = ['valor', 'valor_pendencia', 'valor_divida', 'valor_protesto', 'valor_ocorrencia', 'valor_total'];
const CHAVES_CONTRATO = ['contrato', 'numero_contrato', 'num_contrato', 'documento_origem', 'titulo'];
const CHAVES_DATA = ['data_vencimento', 'data_ocorrencia', 'data_protesto', 'data_inclusao', 'vencimento', 'data'];

export interface DividaConsulta {
  credor: string;
  valor: number;
  /** pendência/refin/protesto negativa o nome; prejuízo e vencido no SCR, não (aparecem, mas não travam a fase) */
  negativada: boolean;
  /** identifica a mesma dívida entre duas consultas (sem o valor, que muda com juros) */
  chave: string;
  observacao: string;
}

export interface ResumoScr {
  aVencer: number; vencido: number; prejuizo: number; limite: number;
  instituicoes: number | null; operacoes: number | null; database: string | null;
}

export interface ResultadoConsulta {
  homolog: boolean;
  /** R$ cobrados nas duas consultas (0 em homologação) */
  custo: number;
  score: number | null;
  faixa: string | null;
  scr: ResumoScr | null;
  /** os blocos de dívida do dossiê como vieram, sem cadastro */
  pendencias: Record<string, unknown>;
  dividas: DividaConsulta[];
  /** ocorrências sem credor ou valor legível */
  naoLidas: number;
  /** o que ficou de fora (ex.: o SCR falhou depois do dossiê já cobrado) */
  avisos: string[];
}

export class ErroConsulta extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** "1.000,00" → 1000; "", "-" ou lixo → 0. */
export function numBR(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const texto = (o: Record<string, unknown>, chaves: string[]) => {
  for (const k of chaves) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object' && typeof (v as any).descricao === 'string' && (v as any).descricao.trim()) return (v as any).descricao.trim();
  }
  return null;
};
const valorDe = (o: Record<string, unknown>) => {
  for (const k of CHAVES_VALOR) { const n = numBR(o[k]); if (n > 0) return n; }
  return 0;
};
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Uma ocorrência do dossiê → dívida, ou null se faltar credor ou valor. */
export function ocorrenciaParaDivida(o: unknown, bloco: string): DividaConsulta | null {
  if (!o || typeof o !== 'object') return null;
  const x = o as Record<string, unknown>;
  const credor = texto(x, CHAVES_CREDOR);
  const valor = valorDe(x);
  if (!credor || valor <= 0) return null;
  const contrato = texto(x, CHAVES_CONTRATO);
  const data = texto(x, CHAVES_DATA);
  const tipo = BLOCOS_LINHA[bloco] ?? bloco;
  return {
    credor: credor.slice(0, 80), valor: r2(valor), negativada: true,
    chave: [bloco, norm(credor), contrato ? norm(contrato) : '', data ?? ''].join('|').slice(0, 200),
    observacao: [`${tipo} na consulta`, contrato && `contrato ${contrato}`, data && `data ${data}`].filter(Boolean).join(' · ').slice(0, 200),
  };
}

function ok(bloco: unknown): boolean {
  return (bloco as any)?.status_retorno?.codigo === '1';
}

/** Dossiê → blocos de dívida (sem cadastro) e as linhas legíveis. */
export function lerDossie(json: any): { pendencias: Record<string, unknown>; dividas: DividaConsulta[]; naoLidas: number } {
  const c = json?.data?.credcadastral ?? {};
  const pendencias: Record<string, unknown> = {};
  const dividas: DividaConsulta[] = [];
  let naoLidas = 0;
  for (const b of BLOCOS_DIVIDA) {
    if (!(b in c)) continue;
    pendencias[b] = c[b];
    if (!(b in BLOCOS_LINHA)) continue;
    if (!ok(c[b])) throw new ErroConsulta(`a fonte de ${BLOCOS_LINHA[b]}s não respondeu (${c[b]?.status_retorno?.descricao ?? 'sem status'})`, 502);
    for (const o of (Array.isArray(c[b].ocorrencias) ? c[b].ocorrencias : [])) {
      const d = ocorrenciaParaDivida(o, b);
      if (d) dividas.push(d); else naoLidas++;
    }
    // a contagem do bloco diz quantas há; se a lista veio menor, as que faltam também são "não lidas"
    const declaradas = numBR(c[b].quantidade_ocorrencia);
    const listadas = Array.isArray(c[b].ocorrencias) ? c[b].ocorrencias.length : 0;
    if (declaradas > listadas) naoLidas += declaradas - listadas;
  }
  // a mesma dívida repetida na lista conta uma vez (o UNIQUE do banco recusaria a segunda)
  const unicas = new Map<string, DividaConsulta>();
  for (const d of dividas) unicas.set(d.chave, unicas.has(d.chave) ? { ...d, valor: r2(unicas.get(d.chave)!.valor + d.valor) } : d);
  return { pendencias, dividas: [...unicas.values()], naoLidas };
}

/** Endividamento (SCR) → resumo e score. */
export function lerEndividamento(json: any): { scr: ResumoScr; score: number | null; faixa: string | null } {
  const r = json?.data?.credcadastral?.relatorio_scr;
  if (!r || !ok(r)) throw new ErroConsulta(`o SCR não respondeu (${r?.status_retorno?.descricao ?? 'sem relatório'})`, 502);
  const cons = r.consolidado ?? {};
  const qtd = (v: unknown) => (String(v ?? '').trim() ? numBR(v) : null);
  const pont = numBR(r.score?.pontuacao);
  return {
    scr: {
      aVencer: r2(numBR(cons.credito_avencer?.valor_total)), vencido: r2(numBR(cons.credito_vencido?.valor_total)),
      prejuizo: r2(numBR(cons.prejuizo?.valor_total)), limite: r2(numBR(cons.limite_credito?.valor_total)),
      instituicoes: qtd(r.quantidade_instituicoes), operacoes: qtd(r.quantidade_operacoes), database: r.database_consultada || null,
    },
    score: pont > 0 ? Math.round(pont) : null,
    faixa: typeof r.score?.faixa === 'string' && r.score.faixa.trim() ? r.score.faixa.trim() : null,
  };
}

/** SCR vencido e prejuízo viram linhas (o SCR não diz o banco): aparecem na fase, sem negativar. */
export function dividasDoScr(scr: ResumoScr): DividaConsulta[] {
  const out: DividaConsulta[] = [];
  const base = scr.database ? ` (base ${scr.database})` : '';
  if (scr.prejuizo > 0) out.push({ credor: 'Bancos: prejuízo no SCR', valor: scr.prejuizo, negativada: false, chave: 'scr|prejuizo', observacao: `dívida bancária baixada como prejuízo no SCR do Banco Central${base}; o SCR não diz o banco` });
  if (scr.vencido > 0) out.push({ credor: 'Bancos: vencido no SCR', valor: scr.vencido, negativada: false, chave: 'scr|vencido', observacao: `crédito vencido no SCR do Banco Central${base}; o SCR não diz o banco` });
  return out;
}

function mensagemDoStatus(status: number, msg: string | undefined): string {
  if (status === 402) return 'Sem saldo na API Brasil: recarregue os créditos lá e tente de novo.';
  if (status === 404) return 'A API Brasil não achou informação para este CPF (não houve cobrança).';
  if (status === 401 || status === 403) return 'A API Brasil recusou o token: grave um novo com scripts/f-credenciais-env.sh.';
  if (status === 400) return `A API Brasil recusou o pedido: ${msg ?? 'CPF inválido'}.`;
  if (status >= 500) return 'A fonte da API Brasil está fora do ar agora (não houve cobrança). Tente mais tarde.';
  return msg ?? `A API Brasil respondeu ${status}.`;
}

async function chamar(tipo: string, cpf: string, token: string, homolog: boolean, fetchFn: typeof fetch): Promise<any> {
  const r = await fetchFn(URL_API_BRASIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tipo, cpf, homolog }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json().catch(() => null);
  // erro pode vir com HTTP 200: vale o campo `error`
  if (!r.ok) throw new ErroConsulta(mensagemDoStatus(r.status, j?.message), r.status);
  if (!j || j.error !== false) throw new ErroConsulta(`A API Brasil recusou a consulta: ${j?.message ?? 'resposta sem corpo'}.`, 502);
  if (Boolean(j.homolog) !== homolog) throw new ErroConsulta(`a API Brasil respondeu ${j.homolog ? 'em homologação' : 'em produção'} sem ter sido pedido`, 502);
  return j;
}

/** As duas consultas de um CPF. Dossiê primeiro: sem ele não há o que gravar, e o SCR não é cobrado à toa. */
export async function consultarCredito(p: { cpf: string; token: string; homolog: boolean; fetchFn?: typeof fetch }): Promise<ResultadoConsulta> {
  const f = p.fetchFn ?? fetch;
  const dossie = await chamar('dossie-credito-pf', p.cpf, p.token, p.homolog, f);
  const d = lerDossie(dossie);
  // o dossiê já foi cobrado: se só o SCR falhar, o resultado sai sem ele (com aviso), em vez de jogar fora o que foi pago
  let endiv: any = null;
  let e: ReturnType<typeof lerEndividamento> | null = null;
  const avisos: string[] = [];
  try {
    endiv = await chamar('endividamento-pf', p.cpf, p.token, p.homolog, f);
    e = lerEndividamento(endiv);
  } catch (err) {
    avisos.push(`SCR e score ficaram de fora: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    homolog: p.homolog,
    custo: r2(numBR(dossie.valor_consulta) + numBR(endiv?.valor_consulta)),
    score: e?.score ?? null, faixa: e?.faixa ?? null, scr: e?.scr ?? null,
    pendencias: d.pendencias,
    dividas: [...d.dividas, ...(e ? dividasDoScr(e.scr) : [])],
    naoLidas: d.naoLidas,
    avisos,
  };
}
