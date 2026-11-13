// O plano do casal (13/11/2026, plano realista). Sem banco: tipos, a conta e a validação.
//
// O plano são os tetos do dia a dia por grupo, medidos em débito + crédito (a meta só do débito dava para "cumprir"
// passando a compra para o cartão). Cada teto é alcançado em degraus: a meta do mês desce em passos iguais da média
// de partida até o teto. A renda é o piso (o que entra todo mês); o que vier a mais adianta o plano, e aparece numa
// segunda linha.
import { addMonths } from './previsao';
import { parseValorBR } from './format';

/** Grupos em que o casal vê espaço para gastar menos; os outros (saúde, pet, transporte, resto) entram pela média. */
export const GRUPOS_COM_TETO = ['Mercado', 'Compras', 'Lazer e digital', 'Comer fora'] as const;
export type GrupoComTeto = (typeof GRUPOS_COM_TETO)[number];

/** `base` = a média do grupo quando o plano foi criado: o ponto de partida dos degraus, que não muda depois. */
export interface TetoDoGrupo { teto: number; base: number }
export interface Plano {
  /** 'AAAA-MM' do primeiro mês com meta */
  inicio: string;
  /** em quantos meses chega aos tetos (1 = teto cheio desde o início) */
  degraus: number;
  tetos: Record<GrupoComTeto, TetoDoGrupo>;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const mesesEntre = (de: string, ate: string) =>
  (Number(ate.slice(0, 4)) * 12 + Number(ate.slice(5, 7))) - (Number(de.slice(0, 4)) * 12 + Number(de.slice(5, 7)));

/** A meta de um grupo no mês: degraus iguais da base até o teto; quem já gasta o teto ou menos fica no teto. Antes do início, null. */
export function metaDoGrupo(t: TetoDoGrupo, plano: Pick<Plano, 'inicio' | 'degraus'>, mes: string): number | null {
  const k = mesesEntre(plano.inicio, mes);
  if (k < 0) return null;
  if (t.base <= t.teto) return r2(t.teto);
  const passo = (t.base - t.teto) / Math.max(1, plano.degraus);
  return r2(Math.max(t.teto, t.base - passo * (k + 1)));
}

export interface PlanoDoMes {
  mes: string;
  grupos: { grupo: GrupoComTeto; meta: number; teto: number }[];
  /** a média dos grupos sem teto */
  semTeto: number;
  /** o dia a dia do plano no mês: metas + grupos sem teto */
  diaADia: number;
}

/** `mediasSemTeto`: grupo → média mensal dos grupos sem teto (os com teto que vierem aqui são ignorados). */
export function planoDoMes(plano: Plano, mes: string, mediasSemTeto: Record<string, number>): PlanoDoMes | null {
  if (mesesEntre(plano.inicio, mes) < 0) return null;
  const grupos = GRUPOS_COM_TETO.map((grupo) => ({ grupo, meta: metaDoGrupo(plano.tetos[grupo], plano, mes)!, teto: plano.tetos[grupo].teto }));
  const semTeto = r2(Object.entries(mediasSemTeto).filter(([g]) => !(GRUPOS_COM_TETO as readonly string[]).includes(g)).reduce((s, [, v]) => s + v, 0));
  return { mes, grupos, semTeto, diaADia: r2(grupos.reduce((s, g) => s + g.meta, 0) + semTeto) };
}

export interface EntradaConta {
  hoje: string;
  /** o que entra todo mês (as fontes recorrentes, sem os extras) */
  piso: number;
  /** mediana do que entra a mais (plantão maior, trocas de turno) */
  extras: number;
  casa: number;
  /** consórcio, seguro, imposto */
  travados: number;
  /** parcelas das dívidas em dia; fim 'AAAA-MM' é o mês da última parcela, null = sem fim conhecido */
  dividas: { valorParcela: number; fim: string | null }[];
  semTeto: number;
  plano: Plano;
}
export interface MesDaConta { mes: string; parcelas: number; diaADia: number; sobra: number; sobraComExtras: number }
export interface ContaDoPlano {
  meses: MesDaConta[];
  /** primeiro mês a partir do qual não falta mais, só com o piso; null = não acontece no horizonte */
  paraDeFaltar: string | null;
  paraDeFaltarComExtras: string | null;
  /** o último mês do horizonte: como fica depois que as parcelas conhecidas acabam */
  estavel: MesDaConta;
  /** quando não fecha: quanto ainda falta no mês mais folgado do horizonte */
  faltaNoMelhorMes: number | null;
}

const primeiroQueFica = (ms: readonly MesDaConta[], sobra: (m: MesDaConta) => number): string | null => {
  for (let i = 0; i < ms.length; i++) if (ms.slice(i).every((m) => sobra(m) >= 0)) return ms[i].mes;
  return null;
};

/** A conta do plano mês a mês, do início do plano (ou do mês de hoje, o que vier depois) por `horizonte` meses. */
export function contaDoPlano(e: EntradaConta, horizonte = 36): ContaDoPlano {
  const mesHoje = e.hoje.slice(0, 7);
  const primeiro = e.plano.inicio > mesHoje ? e.plano.inicio : mesHoje;
  const meses: MesDaConta[] = [];
  for (let i = 0; i < horizonte; i++) {
    const mes = addMonths(primeiro, i);
    const parcelas = r2(e.dividas.filter((d) => d.fim === null || d.fim >= mes).reduce((s, d) => s + d.valorParcela, 0));
    const diaADia = planoDoMes(e.plano, mes, { resto: e.semTeto })!.diaADia;
    const sobra = r2(e.piso - e.casa - e.travados - parcelas - diaADia);
    meses.push({ mes, parcelas, diaADia, sobra, sobraComExtras: r2(sobra + e.extras) });
  }
  const paraDeFaltar = primeiroQueFica(meses, (m) => m.sobra);
  return {
    meses, paraDeFaltar,
    paraDeFaltarComExtras: primeiroQueFica(meses, (m) => m.sobraComExtras),
    estavel: meses[meses.length - 1],
    faltaNoMelhorMes: paraDeFaltar ? null : r2(-Math.max(...meses.map((m) => m.sobra))),
  };
}

export function validarPlano(body: any): { ok: true; data: { tetos: Record<GrupoComTeto, number>; degraus: number } } | { ok: false; erro: string } {
  const tetos = {} as Record<GrupoComTeto, number>;
  for (const g of GRUPOS_COM_TETO) {
    const bruto = body?.tetos?.[g];
    if (bruto === undefined || bruto === null || bruto === '') return { ok: false, erro: `Falta o teto de ${g}.` };
    const v = typeof bruto === 'number' ? bruto : typeof bruto === 'string' ? parseValorBR(bruto) : NaN;
    if (!Number.isFinite(v) || v < 0 || v > 999_999) return { ok: false, erro: `Teto de ${g} inválido.` };
    tetos[g] = r2(v);
  }
  const degraus = body?.degraus;
  if (!Number.isInteger(degraus) || degraus < 1 || degraus > 12) return { ok: false, erro: 'Degraus: de 1 a 12 meses.' };
  return { ok: true, data: { tetos, degraus } };
}
