// Detecção de assinaturas: o que se repete como ASSINATURA, não só o que é frequente.
import { mediana } from './previsao';

export interface Assinatura { nome: string; valorMedio: number; meses: number; categoria: string; banco: string; ultima: string; }

/** Uma cobrança candidata. `chave` = descrição sem dígitos (agrupa "LOJA 2/3" e "LOJA 3/3"). */
export interface Cobranca {
  chave: string; data: string; valor: number; categoria: string; banco: string;
  /** veio da Pluggy como parcela (N de M, M > 1) ou tem "N/M" no fim da descrição */
  parcelado: boolean;
}

const MESES_MINIMOS = 3;
const VARIACAO_MAXIMA = 0.15; // reajuste de streaming cabe; PIX para pessoa e compra variável não
const VALOR_MINIMO = 5;

const TAMANHO_MINIMO_PREFIXO = 8; // "ebn*playstati" (truncado pelo banco) = "ebn*playstation"

// meio de pagamento que o banco põe antes do nome (prefixos que aparecem nos dados reais)
const PREFIXO_MEIO = /^(pagamento de pix qr code|pix qrs|compra cartao deb mc|pix enviado|pagamento de boleto outros bancos)\s*\/?\s*/;

/** Comerciante: sem o tipo de compra ("compra no débito|", PIX QR, cartão de débito), sem espaço e sem "/". */
function comerciante(chave: string): string {
  return chave.slice(chave.lastIndexOf('|') + 1).replace(PREFIXO_MEIO, '').replace(/[\s/]+/g, '');
}

/** Junta grafias truncadas: cada comerciante vira o menor outro do qual é extensão. */
function unificarTruncados(nomes: readonly string[]): Map<string, string> {
  const ordem = [...new Set(nomes)].sort((a, b) => a.length - b.length);
  const raiz = new Map<string, string>();
  for (const n of ordem) {
    const curto = ordem.find((m) => m.length >= TAMANHO_MINIMO_PREFIXO && m !== n && n.startsWith(m));
    raiz.set(n, curto ? raiz.get(curto)! : n);
  }
  return raiz;
}

const COBRANCAS_POR_MES_MAX = 3; // acima disso é lugar de compra (mercado semanal); PlayStation fica em ~2
const DIAS_SEM_COBRANCA = 45; // passou disso sem cobrar, foi cancelada (Xbox parou em julho)
const FOLGA_DIA = 5; // boleto do dia 1º que cai no dia 3 por fim de semana ainda é o mesmo dia

/** Cobrança de assinatura cai sempre perto do mesmo dia do mês (contando a virada: 30, 31 e 1º são vizinhos). */
function diaEstavel(cs: readonly Cobranca[]): boolean {
  const dias = cs.map((c) => Number(c.data.slice(8, 10)));
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 31 - Math.abs(a - b));
  return dias.some((ref) => dias.every((d) => dist(ref, d) <= FOLGA_DIA));
}

/** Separa as cobranças de um comerciante em faixas de valor (cada faixa cabe na variação máxima). */
function faixasDeValor(cs: readonly Cobranca[]): Cobranca[][] {
  const faixas: Cobranca[][] = [];
  for (const c of [...cs].sort((a, b) => a.valor - b.valor)) {
    const atual = faixas.at(-1);
    if (atual && c.valor <= atual[0].valor * (1 + VARIACAO_MAXIMA)) atual.push(c);
    else faixas.push([c]);
  }
  return faixas;
}

/**
 * Assinatura = aparece em 3+ meses, no máximo uma cobrança por mês, valor estável e nunca parcela.
 * A regra antiga ("mesma descrição em 3+ meses") pegava parcelamento já terminado (o número some
 * da descrição) e lugar onde se compra sempre (mercado, delivery, PIX recorrente).
 * Agrupa por comerciante e faixa de valor: a loja do PlayStation cobra duas assinaturas e ainda vende
 * jogo parcelado, com três grafias; débito e crédito do mesmo serviço são a mesma assinatura.
 */
export function detectarAssinaturas(cobrancas: readonly Cobranca[], hoje?: string): Assinatura[] {
  const corte = hoje ? new Date(Date.parse(hoje) - DIAS_SEM_COBRANCA * 86_400_000).toISOString().slice(0, 10) : '';
  const raiz = unificarTruncados(cobrancas.map((c) => comerciante(c.chave)));
  const porComerciante = new Map<string, Cobranca[]>();
  for (const c of cobrancas) {
    if (c.parcelado) continue;
    const k = raiz.get(comerciante(c.chave))!;
    porComerciante.set(k, [...(porComerciante.get(k) ?? []), c]);
  }
  const grupos = [...porComerciante.values()]
    .filter((cs) => cs.length / new Set(cs.map((c) => c.data.slice(0, 7))).size <= COBRANCAS_POR_MES_MAX)
    .flatMap(faixasDeValor);

  const out: Assinatura[] = [];
  for (const cs of grupos) {
    const porMes = new Map<string, number>();
    for (const c of cs) porMes.set(c.data.slice(0, 7), (porMes.get(c.data.slice(0, 7)) ?? 0) + 1);
    if (porMes.size < MESES_MINIMOS) continue;
    if (Math.max(...porMes.values()) > 1) continue;
    const valores = cs.map((c) => c.valor);
    const tipico = mediana(valores);
    if (tipico < VALOR_MINIMO) continue;
    if ((Math.max(...valores) - Math.min(...valores)) / tipico > VARIACAO_MAXIMA) continue;
    if (!diaEstavel(cs)) continue;
    const ultima = cs.map((c) => c.data).sort().at(-1)!;
    if (ultima < corte) continue;
    const moda = (xs: string[]) => [...xs].sort((a, b) => xs.filter((x) => x === b).length - xs.filter((x) => x === a).length)[0];
    out.push({
      nome: moda(cs.map((c) => c.chave.slice(c.chave.lastIndexOf('|') + 1))), valorMedio: Math.round(tipico * 100) / 100, meses: porMes.size,
      categoria: moda(cs.map((c) => c.categoria)), banco: moda(cs.map((c) => c.banco)), ultima,
    });
  }
  return out.sort((a, b) => b.valorMedio - a.valorMedio).slice(0, 30);
}
