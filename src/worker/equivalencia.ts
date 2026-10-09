import { classificar, corrigirCategoria } from './classificar';
import type { Conta, PluggyTransacao } from './tipos';

type Fn = (...a: unknown[]) => unknown;
export interface FuncoesAntigas { corrigirCategoria: Fn; classificar: Fn }

/** Recorta as duas funções do nó "Code in JavaScript" (do início de corrigirCategoria até "const dadosBrutos"). */
export function extrairFuncoesAntigas(jsCode: string): FuncoesAntigas {
  const ini = jsCode.indexOf('function corrigirCategoria');
  const fim = jsCode.indexOf('const dadosBrutos');
  if (ini < 0 || fim < 0 || fim < ini) throw new Error('não achei corrigirCategoria/classificar no código do nó');
  // código vindo do export do próprio workflow do Matheus; nada externo
  return new Function(`${jsCode.slice(ini, fim)}\nreturn { corrigirCategoria, classificar };`)() as FuncoesAntigas;
}

export function compararClassificacao(antigas: FuncoesAntigas, itens: readonly { t: PluggyTransacao; conta: Conta }[]) {
  let divergemCategoria = 0;
  let divergemClasse = 0;
  const exemplos: string[] = [];
  for (const { t, conta } of itens) {
    const saida = t.type === 'DEBIT';
    const catVelha = antigas.corrigirCategoria(t.category, t.description) as string | null | undefined;
    const catNova = corrigirCategoria(t.category, t.description);
    const classeVelha = antigas.classificar(catVelha, t.description, saida, conta.forma, conta.responsavel);
    const classeNova = classificar(catNova, t.description, saida, conta.forma, conta.responsavel);
    const difCat = (catVelha || 'Outros') !== (catNova || 'Outros');
    const difClasse = classeVelha !== classeNova;
    if (difCat) divergemCategoria++;
    if (difClasse) divergemClasse++;
    if ((difCat || difClasse) && exemplos.length < 10) exemplos.push(t.id);
  }
  return { total: itens.length, divergemCategoria, divergemClasse, exemplos };
}
