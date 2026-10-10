// Saldo em conta do dia 1 ao fim do mês: passado reconstruído do saldo de hoje, futuro pela previsão.
// Por construção o último ponto do mês corrente é o "fecha com" da previsão.
export interface PontoLinha { dia: number; saldo: number; futuro: boolean }
export interface SerieMes { pontos: PontoLinha[]; fechamento: number; passado: boolean }

function diasNoMes(mes: string): number {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
}
const dataDe = (mes: string, dia: number) => `${mes}-${String(dia).padStart(2, '0')}`;

export function serieDoMes(e: {
  mes: string; hoje: string; saldoHoje: number; movimentos: Record<string, number>;
  receitas: { dia: number; valor: number }[]; aindaSai: number;
}): SerieMes {
  const D = diasNoMes(e.mes);
  const mesHoje = e.hoje.slice(0, 7);
  const passado = e.mes < mesHoje;
  const ultimoPassado = passado ? D : Number(e.hoje.slice(8, 10));
  // saldo no fim do dia d = saldo de hoje − movimentos depois de d (até hoje)
  const depoisDe = (data: string) => Object.entries(e.movimentos)
    .filter(([d]) => d > data && d <= e.hoje).reduce((s, [, v]) => s + v, 0);
  const pontos: PontoLinha[] = [];
  for (let d = 1; d <= ultimoPassado; d++) pontos.push({ dia: d, saldo: e.saldoHoje - depoisDe(dataDe(e.mes, d)), futuro: false });
  if (passado) return { pontos, fechamento: pontos.at(-1)!.saldo, passado };

  const hojeDia = ultimoPassado;
  const restantes = D - hojeDia;
  // receita atrasada (dia típico já passou) entra amanhã; dia típico além do fim do mês (31 em mês
  // de 30) entra no último dia — senão sumiria e o fechamento deixaria de bater com a previsão
  const diaDaReceita = (dia: number) => Math.min(Math.max(dia, hojeDia + 1), D);
  const entradaNoDia = (d: number) => e.receitas.reduce((s, r) => s + (diaDaReceita(r.dia) === d ? r.valor : 0), 0);
  if (restantes === 0) {
    const fechamento = e.saldoHoje + e.receitas.reduce((s, r) => s + r.valor, 0) - e.aindaSai;
    return { pontos, fechamento, passado };
  }
  let saldo = e.saldoHoje;
  for (let d = hojeDia + 1; d <= D; d++) {
    saldo += entradaNoDia(d) - e.aindaSai / restantes;
    pontos.push({ dia: d, saldo, futuro: true });
  }
  return { pontos, fechamento: saldo, passado };
}
