// Trilha do casal (F3): sair das dívidas → fazer sobrar → reserva → patrimônio. Regras e textos puros.

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const CATS_DIVIDA = ['Loans and financing', 'Loans'];
const PALAVRAS_DIVIDA = ['RENEGOCIA', 'PARCELAMENTO DE FATURA', 'PARC.FATURA', 'EMPREST', 'FINANCIAMENTO'];
const CATS_ATRASO = ['Interests charged', 'Late payment and overdraft costs'];
const PALAVRAS_ATRASO = ['JUROS DE MORA', 'ENCARGOS DE ATRASO', 'ENC ATRASO'];

/** Dívida de verdade (renegociação, parcelamento de fatura, empréstimo); compra parcelada comum não é. */
export function ehDivida(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_DIVIDA.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_DIVIDA.some((p) => d.includes(p));
}

/** Juros/encargos de atraso: sinal de fatura não paga inteira ou de conta no negativo. */
export function ehAtraso(descricao: string, categoria: string | null): boolean {
  if (categoria && CATS_ATRASO.includes(categoria)) return true;
  const d = semAcento(descricao);
  return PALAVRAS_ATRASO.some((p) => d.includes(p));
}

export interface LancDivida { descricao: string; categoria: string | null; banco: string; forma: string; data: string; valor: number }
export interface DividaAtiva { nome: string; banco: string; valorParcela: number; restantes: number | null; fim: string | null }

const nomeDivida = (d: string) => d.toLowerCase().replace(/[0-9/.]/g, ' ').replace(/\s+/g, ' ').trim();

/** Dívidas ainda em aberto: parcelas depois de hoje; prestação no débito (sem data futura) fica sem fim. */
export function agruparDividas(lancs: LancDivida[], hoje: string): DividaAtiva[] {
  const grupos = new Map<string, LancDivida[]>();
  for (const l of lancs) {
    if (!ehDivida(l.descricao, l.categoria)) continue;
    const k = `${nomeDivida(l.descricao)}|${l.banco}`;
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  const out: DividaAtiva[] = [];
  for (const [k, ls] of Array.from(grupos)) {
    const [nome, banco] = k.split('|');
    const futuras = ls.filter((l) => l.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
    if (futuras.length > 0) {
      const ult = futuras[futuras.length - 1];
      out.push({ nome, banco, valorParcela: ult.valor, restantes: futuras.length, fim: ult.data.slice(0, 7) });
    } else if (ls.some((l) => l.forma === 'Débito')) {
      const ult = [...ls].sort((a, b) => a.data.localeCompare(b.data))[ls.length - 1];
      out.push({ nome, banco, valorParcela: ult.valor, restantes: null, fim: null });
    }
  }
  return out.sort((a, b) => (a.fim ?? '9999').localeCompare(b.fim ?? '9999'));
}

/** Meses em que o saldo em conta (reconstruído do saldo de hoje e dos movimentos) ficou negativo. */
export function mesesComContaNegativa(saldoHoje: number, movs: Record<string, number>, desde: string, hoje: string): string[] {
  const dias = Object.keys(movs).filter((d) => d >= desde && d <= hoje).sort();
  let saldo = saldoHoje - dias.reduce((s, d) => s + movs[d], 0);
  const meses = new Set<string>();
  if (saldo < -0.005) meses.add(desde.slice(0, 7));
  for (const d of dias) {
    saldo += movs[d];
    if (saldo < -0.005) meses.add(d.slice(0, 7));
  }
  return Array.from(meses).sort();
}
