// 05/11: a conta do diário em texto corrido, como gente escreve no WhatsApp (antes: uma linha por número, cada uma
// com 👉 e um rótulo — "Origem:", "Ritmo:"). Recebe as frases de explicacaoDaConta, inclusive as já guardadas com
// diários antigos; frase de formato desconhecido perde só o rótulo.
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const REESCRITAS: [RegExp, string][] = [
  [/^Origem: nas contas tem (.+?)( e .+)$/, 'Nas contas vocês têm $1$2'],
  [/^Sobra para o dia a dia até o fim do mês: (.+?)\.$/, 'Então sobram *$1* para o dia a dia até o fim do mês.'],
  [/^Dá pra gastar: .+? divididos por (.+?) dá (.+?) por dia\.$/, 'Divididos por $1, dá $2 por dia.'],
  [/^Ritmo: o dia a dia/, 'Até agora o dia a dia'],
  [/^Nesse passo: (.+?) por dia (.+?) são (.+?); .+? menos isso fecha em (.+?)\.$/, 'Se continuar nesse passo ($1 por dia), são $3 $2 e o mês fecha em $4.'],
  [/^Pela média: pelo jeito que vocês costumam gastar no resto do mês, ainda saem (.+?) no dia a dia; .+? menos isso fecha em (.+?)\.$/,
    'Pelo jeito que vocês costumam gastar, o resto do mês ainda leva $1 no dia a dia, e aí fecha em $2.'],
];
const ROTULO = /^[A-ZÀ-Úa-zà-ú ]{2,20}: /;

function frase(l: string): string {
  const t = l.trim();
  for (const [re, por] of REESCRITAS) if (re.test(t)) return t.replace(re, por);
  const sem = t.replace(ROTULO, '');
  return sem.charAt(0).toUpperCase() + sem.slice(1);
}

/** As lojas que mais puxaram o ritmo, numa frase. */
export function frasePuxou(c: { linhas: { chave: string; valor: number }[] }): string {
  const ns = c.linhas.map((l) => `${l.chave} (${brl(l.valor)})`);
  return `O que mais pesou no dia a dia até agora: ${ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns.at(-1)}` : ns[0]}.`;
}

/** Até o ritmo: de onde vem a sobra; do ritmo em diante: para onde o mês vai; por último, o que puxou. */
export function explicacaoCorrida(linhas: string[], puxou: string | null = null): string {
  const corte = linhas.findIndex((l) => /^Ritmo:/.test(l.trim()));
  const blocos = corte > 0 ? [linhas.slice(0, corte), linhas.slice(corte)] : [linhas];
  return [...blocos.map((b) => b.map(frase).join(' ')), ...(puxou ? [puxou] : [])].join('\n\n');
}
