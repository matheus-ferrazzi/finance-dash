// Consulta de crédito sob demanda na API Brasil (14/11/2026, fase "nome limpo" da Trilha).
// - Restrições de Crédito Serasa (`restricoes-serasa`, R$ 16,88): a do botão. Negativações na Serasa (PEFIN, REFIN…)
//   e protestos, com credor, valor e datas, mais o score da Serasa. 14/11: o dossiê abaixo devolveu as pendências
//   zeradas para um CPF com um PEFIN de cinco dígitos na Serasa — para "nome limpo", vale a Serasa.
// - Dossiê de Crédito PF (`dossie-credito-pf`) + Endividamento Bancário PF (`endividamento-pf`, SCR e score): a
//   primeira versão; ficam para uso à mão (o SCR veio com o consolidado zerado na primeira consulta real).
// A resposta traz dados cadastrais (nome, mãe, nascimento, endereço, telefone): nada disso sai daqui. Fica só o que é
// dívida e o score. Em homologação (`homolog: true`) a resposta é fictícia e gratuita: nunca vira dívida.

export const URL_API_BRASIL = 'https://gateway.apibrasil.io/api/v2/consulta/cpf/credits';
export const URL_SERASA = 'https://gateway.apibrasil.io/api/v2/consulta/restricoes-serasa/credits';
/** prefixos de chave de cada fonte: a dívida que sumiu só é dada por limpa pela fonte que respondeu */
const PREFIXOS_NEGATIVACAO = ['serasa', 'pend_financeiras', 'pend_refin'];
const PREFIXOS_PROTESTO = ['protestos', 'protesto_sintetico'];

/** Blocos do dossiê que são dívida; o resto (cadastro, telefones, ações cíveis, empresas) fica de fora. */
const BLOCOS_DIVIDA = ['pend_financeiras', 'pend_refin', 'protestos', 'protesto_sintetico', 'ch_sem_fundos_bacen', 'ch_sem_fundos_varejo'] as const;
/**
 * Os que viram linha em "dívidas fora do banco" (cheque só entra no resumo). 14/11, primeira consulta real: o protesto
 * veio só no `protesto_sintetico` (o `protestos` detalhado vazio); o sintético vale quando o detalhado não trouxe nada.
 */
const BLOCOS_LINHA: Record<string, string> = { pend_financeiras: 'pendência', pend_refin: 'refin', protestos: 'protesto', protesto_sintetico: 'protesto' };

// A documentação não publica os campos de cada ocorrência (o exemplo vem vazio): procura pelos nomes prováveis e,
// sem credor ou valor legível, conta como "não lida" (o bloco cru fica guardado na consulta para ajustar depois).
// Protesto costuma vir sem credor (14/11: credor e cedente vazios): aí o nome é o cartório.
const CHAVES_CREDOR = ['credor', 'nome_credor', 'informante', 'empresa', 'razao_social', 'cedente', 'apresentante', 'instituicao', 'origem'];
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
  /** o consolidado veio zerado e "a vencer" é a soma das operações */
  porOperacao?: boolean;
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
  /** prefixos de chave das fontes que responderam: a dívida que sumiu só é dada por limpa por elas */
  fontes: string[];
  /** o relatório do SCR como veio, sem nome nem documento (null se não houve SCR) */
  scrBruto: Record<string, unknown> | null;
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
  const valor = valorDe(x);
  let credor = texto(x, CHAVES_CREDOR);
  if (!credor && bloco.startsWith('protesto')) {
    const cart = texto(x, ['cartorio', 'nome_cartorio']);
    const onde = [texto(x, ['comarca', 'cidade', 'municipio']), texto(x, ['uf'])].filter(Boolean).join('/');
    if (cart || onde) credor = `Protesto em cartório${cart ? ` ${/^\d+$/.test(cart) ? `${Number(cart)}º` : cart}` : ''}${onde ? ` de ${onde}` : ''}`;
  }
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
    // o sintético repete o detalhado quando este vem preenchido: só entra se o detalhado não trouxe protesto
    if (b === 'protesto_sintetico' && dividas.some((d) => d.chave.startsWith('protestos|'))) continue;
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
export function lerEndividamento(json: any): { scr: ResumoScr; score: number | null; faixa: string | null; bruto: Record<string, unknown> } {
  const r = json?.data?.credcadastral?.relatorio_scr;
  if (!r || !ok(r)) throw new ErroConsulta(`o SCR não respondeu (${r?.status_retorno?.descricao ?? 'sem relatório'})`, 502);
  const cons = r.consolidado ?? {};
  const qtd = (v: unknown) => (String(v ?? '').trim() ? numBR(v) : null);
  const pont = numBR(r.score?.pontuacao);
  const scr: ResumoScr = {
    aVencer: r2(numBR(cons.credito_avencer?.valor_total)), vencido: r2(numBR(cons.credito_vencido?.valor_total)),
    prejuizo: r2(numBR(cons.prejuizo?.valor_total)), limite: r2(numBR(cons.limite_credito?.valor_total)),
    instituicoes: qtd(r.quantidade_instituicoes), operacoes: qtd(r.quantidade_operacoes), database: r.database_consultada || null,
  };
  // 14/11, primeira consulta real: consolidado todo zerado com 11 operações em 4 instituições. Se as operações têm
  // total e o consolidado não, o total delas entra como "a vencer" (sem separar vencido e prejuízo, que o
  // consolidado é quem diz) e `porOperacao` marca que veio assim.
  const somaOps = r2((Array.isArray(r.operacoes) ? r.operacoes : []).reduce((s: number, o: any) => s + numBR(o?.total), 0));
  if (scr.aVencer + scr.vencido + scr.prejuizo === 0 && somaOps > 0) { scr.aVencer = somaOps; scr.porOperacao = true; }
  // o relatório como veio, sem identificação (nome e documento), para conferir o formato real
  const { nome_razao_social: _n, documento: _d, tipo_documento: _t, ...bruto } = r;
  return {
    scr,
    score: pont > 0 ? Math.round(pont) : null,
    faixa: typeof r.score?.faixa === 'string' && r.score.faixa.trim() ? r.score.faixa.trim() : null,
    bruto,
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
  // a da Serasa tem endereço próprio e o CPF vai em `documento`
  const serasa = tipo === 'restricoes-serasa';
  const r = await fetchFn(serasa ? URL_SERASA : URL_API_BRASIL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(serasa ? { tipo, documento: cpf, homolog } : { tipo, cpf, homolog }),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => null);
  // erro pode vir com HTTP 200: vale o campo `error`
  if (!r.ok) throw new ErroConsulta(mensagemDoStatus(r.status, j?.message), r.status);
  if (!j || j.error !== false) throw new ErroConsulta(`A API Brasil recusou a consulta: ${j?.message ?? 'resposta sem corpo'}.`, 502);
  if (Boolean(j.homolog) !== homolog) throw new ErroConsulta(`a API Brasil respondeu ${j.homolog ? 'em homologação' : 'em produção'} sem ter sido pedido`, 502);
  return j;
}

/**
 * As duas consultas de um CPF. Dossiê primeiro: sem ele não há o que gravar, e o SCR não é cobrado à toa.
 * `soScr`: só o endividamento (R$ 4,80), para refazer o SCR e o score sem pagar o dossiê de novo.
 */
export async function consultarCredito(p: { cpf: string; token: string; homolog: boolean; soScr?: boolean; fetchFn?: typeof fetch }): Promise<ResultadoConsulta> {
  const f = p.fetchFn ?? fetch;
  const dossie = p.soScr ? null : await chamar('dossie-credito-pf', p.cpf, p.token, p.homolog, f);
  const d = dossie ? lerDossie(dossie) : { pendencias: {}, dividas: [], naoLidas: 0 };
  // o dossiê já foi cobrado: se só o SCR falhar, o resultado sai sem ele (com aviso), em vez de jogar fora o que foi pago
  let endiv: any = null;
  let e: ReturnType<typeof lerEndividamento> | null = null;
  const avisos: string[] = [];
  try {
    endiv = await chamar('endividamento-pf', p.cpf, p.token, p.homolog, f);
    e = lerEndividamento(endiv);
  } catch (err) {
    if (p.soScr) throw err; // sem dossiê, não há o que salvar
    avisos.push(`SCR e score ficaram de fora: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (e?.scr.porOperacao) avisos.push('O SCR veio sem o consolidado: "a vencer" é a soma das operações, sem separar vencido e prejuízo.');
  return {
    homolog: p.homolog,
    fontes: [...(dossie ? [...Object.keys(BLOCOS_LINHA)] : []), ...(e ? ['scr'] : [])],
    scrBruto: e?.bruto ?? null,
    custo: r2(numBR(dossie?.valor_consulta) + numBR(endiv?.valor_consulta)),
    score: e?.score ?? null, faixa: e?.faixa ?? null, scr: e?.scr ?? null,
    pendencias: d.pendencias,
    dividas: [...d.dividas, ...(e ? dividasDoScr(e.scr) : [])],
    naoLidas: d.naoLidas,
    avisos,
  };
}

// ==================== Restrições de Crédito Serasa (14/11: a consulta do botão) ====================

/** Uma ocorrência da Serasa → dívida. Base "serasa" (PEFIN, REFIN…) ou "protestos" (credor = o cartório). */
export function ocorrenciaSerasa(o: any): DividaConsulta | null {
  if (!o || typeof o !== 'object') return null;
  const base = o.base === 'protestos' ? 'protestos' : 'serasa';
  const credor = typeof o.credor === 'string' && o.credor.trim() ? o.credor.trim() : null;
  const valor = numBR(o.valor);
  if (!credor || valor <= 0) return null;
  const contrato = typeof o.contrato === 'string' && o.contrato.trim() ? o.contrato.trim() : null;
  const data = (typeof o.data_inclusao === 'string' && o.data_inclusao) || (typeof o.data_ocorrencia === 'string' && o.data_ocorrencia) || '';
  const dataBR = /^\d{4}-\d{2}-\d{2}/.test(data) ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : data;
  const tipo = [o.tipo, o.modalidade].filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().toLowerCase()).join(', ');
  return {
    credor: credor.slice(0, 80), valor: r2(valor), negativada: true,
    chave: [base, norm(credor), contrato ? norm(contrato) : '', data].join('|').slice(0, 200),
    observacao: [base === 'protestos' ? 'protesto (Serasa)' : `Serasa${tipo ? `: ${tipo}` : ''}`, contrato && `contrato ${contrato}`,
      dataBR && `desde ${dataBR}`, o.avalista === true && 'como avalista'].filter(Boolean).join(' · ').slice(0, 200),
  };
}

/** Resposta da Serasa → dívidas, score e as fontes que responderam (sem titular nem documento). */
export function lerSerasa(json: any): Omit<ResultadoConsulta, 'homolog' | 'custo'> {
  const d = json?.data;
  if (!d || typeof d !== 'object') throw new ErroConsulta('a Serasa respondeu sem dados', 502);
  const semResposta: string[] = Array.isArray(d.bases_sem_resposta) ? d.bases_sem_resposta.map(String) : [];
  const fontes = [
    ...(semResposta.includes('serasa') ? [] : PREFIXOS_NEGATIVACAO),
    ...(semResposta.includes('protestos') ? [] : PREFIXOS_PROTESTO),
  ];
  if (fontes.length === 0) throw new ErroConsulta('nem a Serasa nem a base de protestos responderam', 502);
  const dividas: DividaConsulta[] = [];
  let naoLidas = 0;
  for (const o of Array.isArray(d.ocorrencias) ? d.ocorrencias : []) {
    const x = ocorrenciaSerasa(o);
    if (x) dividas.push(x); else naoLidas++;
  }
  const declaradas = numBR(d.resumo?.total_ocorrencias);
  if (declaradas > dividas.length + naoLidas) naoLidas += declaradas - dividas.length - naoLidas;
  const unicas = new Map<string, DividaConsulta>();
  for (const x of dividas) unicas.set(x.chave, unicas.has(x.chave) ? { ...x, valor: r2(unicas.get(x.chave)!.valor + x.valor) } : x);
  const sc = (Array.isArray(d.scores) ? d.scores : []).find((s: any) => s?.base === 'serasa') ?? (Array.isArray(d.scores) ? d.scores[0] : null);
  const score = numBR(sc?.valor);
  const { titular: _t, documento: _d, tipo_documento: _td, ...semCadastro } = d;
  const avisos = semResposta.length ? [`sem resposta de: ${semResposta.join(', ')} (o que veio dela antes não foi dado por limpo)`] : [];
  return {
    score: score > 0 ? Math.round(score) : null, faixa: typeof d.classificacao_risco === 'string' && d.classificacao_risco.trim() ? d.classificacao_risco.trim() : null,
    scr: null, scrBruto: null, pendencias: { serasa: semCadastro }, dividas: [...unicas.values()], naoLidas, avisos, fontes,
  };
}

/** A consulta do botão: uma chamada à Serasa (negativações e protestos, com score). */
export async function consultarSerasa(p: { cpf: string; token: string; homolog: boolean; fetchFn?: typeof fetch }): Promise<ResultadoConsulta> {
  const j = await chamar('restricoes-serasa', p.cpf, p.token, p.homolog, p.fetchFn ?? fetch);
  return { homolog: p.homolog, custo: r2(numBR(j.valor_consulta)), ...lerSerasa(j) };
}
