// P7: o desafio do mês a partir do banco (o cálculo puro fica em desafio.ts). Do casal, banco + dinheiro vivo,
// no mesmo recorte do semanal (getGastoPorCategoriaEntre).
import { getDinheiroPorCategoriaEntre, somarMapas } from './dinheiro';
import { andamentoDesafio, desafioDoMes, type Desafio } from './desafio';
import { agruparGastos } from './grupos';
import { addMonths } from './previsao';
import { getGastoPorCategoriaEntre } from './queries';

async function gruposEntre(inicio: string, fimExcl: string) {
  const [banco, din] = await Promise.all([getGastoPorCategoriaEntre(inicio, fimExcl), getDinheiroPorCategoriaEntre(inicio, fimExcl)]);
  return agruparGastos(somarMapas(banco, din), 0);
}

export async function getDesafio(mes: string): Promise<Desafio | null> {
  return desafioDoMes(mes, await gruposEntre(`${addMonths(mes, -3)}-01`, `${mes}-01`));
}

/** Desafio de `mes` com o gasto do grupo de 1º do mês até `ateExcl` (exclusive). */
export async function getDesafioComAndamento(mes: string, ateExcl: string) {
  const d = await getDesafio(mes);
  if (!d) return null;
  return { ...d, ...andamentoDesafio(d, await gruposEntre(`${mes}-01`, ateExcl)) };
}
