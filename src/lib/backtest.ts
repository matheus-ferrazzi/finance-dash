// Teste contra o passado: o que a previsão diria no dia 1º × o que aconteceu no mês.
import type { ProjecaoMes } from './previsao';
import { calibrar } from './faixa';

export interface Componentes { receita: number; debito: number; casa: number; fatura: number; saldo: number }

/** Limites de referência por mês (critério original do P1; o aceite agora é "nenhuma medida pior que o modelo anterior"). */
export const LIMITES = { receita: 400, fatura: 400, saldo: 500 } as const;

export function componentesPrevistos(m: ProjecaoMes): Componentes {
  return {
    receita: m.receita,
    debito: m.despesaVariavel + m.despesaFixa,
    casa: m.despesaCasa + m.despesaManual,
    fatura: m.fatura,
    saldo: m.saldo,
  };
}

export function avaliarMes(previsto: Componentes, real: Componentes) {
  const erros = Object.fromEntries(
    (Object.keys(previsto) as (keyof Componentes)[]).map((k) => [k, Math.round((previsto[k] - real[k]) * 100) / 100]),
  ) as unknown as Componentes;
  const ok = Math.abs(erros.receita) <= LIMITES.receita
    && Math.abs(erros.fatura) <= LIMITES.fatura
    && Math.abs(erros.saldo) <= LIMITES.saldo;
  return { erros, ok };
}

export interface LinhaErro { regra: string; horizonte: number; mes: string; erros: Componentes }
const COMPS: (keyof Componentes)[] = ['receita', 'debito', 'casa', 'fatura', 'saldo'];
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Erro absoluto médio e viés (média com sinal) por regra × horizonte × componente. */
export function resumirErros(linhas: LinhaErro[]) {
  const grupos = new Map<string, LinhaErro[]>();
  for (const l of linhas) grupos.set(`${l.regra}|${l.horizonte}`, [...(grupos.get(`${l.regra}|${l.horizonte}`) ?? []), l]);
  return [...grupos.entries()].flatMap(([k, ls]) => {
    const [regra, h] = k.split('|');
    return COMPS.map((comp) => ({
      regra, horizonte: Number(h), comp,
      mae: r2(ls.reduce((s, l) => s + Math.abs(l.erros[comp]), 0) / ls.length),
      vies: r2(ls.reduce((s, l) => s + l.erros[comp], 0) / ls.length),
    }));
  });
}

/** Critério da spec: menor erro do saldo no horizonte 1, sem piorar nenhuma medida da regra atual. */
export function escolherRegra(resumo: ReturnType<typeof resumirErros>, atual = 'confiaveis'): { regra: string; motivo: string } {
  const de = (regra: string) => resumo.filter((x) => x.regra === regra);
  const base = de(atual);
  const mae = (regra: string) => de(regra).find((x) => x.horizonte === 1 && x.comp === 'saldo')?.mae ?? Infinity;
  const candidatas = [...new Set(resumo.map((x) => x.regra))].filter((r) => r !== atual)
    .filter((r) => base.every((b) => (de(r).find((x) => x.horizonte === b.horizonte && x.comp === b.comp)?.mae ?? Infinity) <= b.mae))
    .sort((a, b) => mae(a) - mae(b));
  if (!candidatas.length) return { regra: atual, motivo: 'nenhuma candidata sem piorar alguma medida' };
  return { regra: candidatas[0], motivo: `saldo h1 ${mae(atual)} -> ${mae(candidatas[0])}` };
}

/**
 * Validação da faixa (aceite da spec: 1 mês à frente), fora da amostra: cada mês é testado com a faixa
 * calibrada só nos meses anteriores (mínimo 6). Calibrar e medir nos mesmos meses daria 80% por construção.
 */
export function coberturaH1(linhas: LinhaErro[], meses: string[], regra: string): { dentro: number; total: number } {
  const erroDe = (mes: string) => linhas.find((l) => l.regra === regra && l.horizonte === 1 && l.mes === mes)?.erros.saldo;
  let dentro = 0, total = 0;
  meses.forEach((mes, i) => {
    const anteriores = meses.slice(0, i).map(erroDe).filter((e): e is number => e !== undefined);
    const c = calibrar(anteriores, mes);
    const e = erroDe(mes);
    if (!c || e === undefined) return;
    total++;
    // real dentro da faixa de 1 mês ⇔ o erro do mês cai entre p10 e p90 da calibração
    if (e >= c.p10 && e <= c.p90) dentro++;
  });
  return { dentro, total };
}
