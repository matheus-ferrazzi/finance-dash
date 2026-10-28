// E1: trava de número. Todo R$ e todo % da resposta do modelo têm que ter vindo de uma ferramenta, com o sinal certo.

// número em R$: com milhar (1.234,56) ou sem (12345 / 1234,56); não corta um número maior pela metade
const RE_BRL = /(-?)\s*R\$\s*(-?)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?!\d|[.,]\d)/g;
const RE_PCT = /(-?\d+(?:,\d+)?)\s*%/g;
// só estes campos das ferramentas são dinheiro (parcelas, fase, dias e pct não valem como R$)
const DINHEIRO = new Set([
  'valor', 'total', 'totalA', 'totalB', 'a', 'b', 'diferenca', 'parcela', 'valorTotal', 'aprofunda',
  'dapraGastarHoje', 'ritmoAtualDia', 'ritmoSeguroDia', 'fechaCom', 'aplicado', 'meta', 'totalFalta',
  'dinheiro', 'totalDinheiro', 'totalDinheiroA', 'totalDinheiroB', 'nessePassoFechaEm', 'pelaMediaFechaEm',
]);
// valor negativo dito sem sinal só vale se a linha disser que é negativo
const DIZ_NEGATIVO = /-|negativ|vermelho|falt/i;

function achados(texto: string): { v: number; linha: string }[] {
  const out: { v: number; linha: string }[] = [];
  for (const m of texto.matchAll(RE_BRL)) {
    const n = Number(m[3].replace(/\./g, '').replace(',', '.'));
    const ini = texto.lastIndexOf('\n', m.index ?? 0) + 1;
    const fim = texto.indexOf('\n', m.index ?? 0);
    out.push({ v: m[1] || m[2] ? -n : n, linha: texto.slice(ini, fim < 0 ? undefined : fim) });
  }
  return out;
}

export function valoresBRL(texto: string): number[] {
  return achados(texto).map((a) => a.v);
}

/** Dinheiro e percentuais que as ferramentas devolveram (inclui R$ escritos dentro de textos, como o próximo passo). */
function coletar(x: unknown, chave: string | null, din: number[], pct: number[]): void {
  if (typeof x === 'number' && Number.isFinite(x)) {
    if (chave === 'pct') pct.push(x);
    else if (chave !== null && DINHEIRO.has(chave)) din.push(x);
  } else if (typeof x === 'string') din.push(...valoresBRL(x));
  else if (Array.isArray(x)) x.forEach((v) => coletar(v, chave, din, pct));
  else if (x && typeof x === 'object') Object.entries(x).forEach(([k, v]) => coletar(v, k, din, pct));
}

const perto = (a: number, b: number) => Math.abs(a - b) < 0.006 || Math.abs(a - Math.round(b)) < 0.006;

/**
 * 27/10: os dois "fecha em" do mês têm bases diferentes, e o modelo trocava uma pela outra ("o ritmo de R$ 190,69,
 * se mantido, fecha em -R$ 72,86", que é o pela média). O valor confere com um dado, mas a frase está errada.
 * Agora: o "nesse passo" só passa numa linha que fale do ritmo; o "pela média" (o fecha-em de sempre, que pode vir
 * sem explicação) não passa numa linha que fale do ritmo sem falar da média.
 */
const MEDIA = /m[ée]dia|costum/i;
const RITMO = /passo|ritmo|mantid|mantiver|continu|seguir/i;
const pelaMedia = (l: string) => MEDIA.test(l) || !RITMO.test(l);
const ROTULO: Record<string, (linha: string) => boolean> = {
  fechaCom: pelaMedia, pelaMediaFechaEm: pelaMedia, nessePassoFechaEm: (l) => RITMO.test(l),
};
type Rotulo = { v: number; re: { test: (linha: string) => boolean } };

function coletarRotulos(x: unknown, out: Rotulo[]): void {
  if (Array.isArray(x)) x.forEach((v) => coletarRotulos(v, out));
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === 'number' && ROTULO[k]) out.push({ v, re: { test: ROTULO[k] } });
      else coletarRotulos(v, out);
    }
  }
}

/** 27/10: valor cru no formato americano ("2371.8"): sem R$ a trava não o via, e no grupo sai sem formato */
const CRU = /(?<![\d.,])\d+\.\d{1,2}(?![\d.,])/;

export function respostaConfere(resposta: string, resultados: unknown[]): boolean {
  if (CRU.test(resposta)) return false;
  const din: number[] = [], pct: number[] = [], rotulos: Rotulo[] = [];
  coletar(resultados, null, din, pct);
  coletarRotulos(resultados, rotulos);
  const reais = achados(resposta).every(({ v, linha }) => din.some((n) => perto(Math.abs(v), Math.abs(n))
    && (n === 0 || Math.sign(v) === Math.sign(n) || (n < 0 && v > 0 && DIZ_NEGATIVO.test(linha))))
    && (() => {
      const deles = rotulos.filter((r) => r.v !== 0 && perto(Math.abs(v), Math.abs(r.v)));
      return !deles.length || deles.some((r) => r.re.test(linha));
    })());
  const pcts = [...resposta.matchAll(RE_PCT)].every((m) => {
    const v = Math.abs(Number(m[1].replace(',', '.')));
    return pct.some((n) => Math.abs(v - Math.abs(n)) < 0.06 || Math.abs(v - Math.round(Math.abs(n))) < 0.006);
  });
  return reais && pcts;
}
