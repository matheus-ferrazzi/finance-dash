// Teste contra o passado, na VPS (lê o banco com o usuário somente-leitura do painel):
//   docker cp dist/backtest.js finance-dashboard:/tmp/backtest.js && docker exec finance-dashboard node /tmp/backtest.js
// Para cada um dos 3 últimos meses fechados: previsão com hoje = dia 1º × realizado.
// Imprime só totais por componente. Sai com código 1 se algum mês reprova no critério do spec.
import { avaliarMes, componentesPrevistos, LIMITES, type Componentes } from '../src/lib/backtest';
import { pool, q } from '../src/lib/db';
import { currentDateSP } from '../src/lib/format';
import { addMonths } from '../src/lib/previsao';
import { CASA_CATS, computeProjecao, getProjecaoBase } from '../src/lib/queries';

const SEM_ESPELHO = `descricao NOT ILIKE '%MORA CARTAO%' AND descricao NOT ILIKE '%PROVISAO%' AND descricao NOT ILIKE '%GASTOS CART%'`;

async function realizado(mes: string): Promise<Componentes> {
  const [r] = await q<any>(
    `SELECT
       COALESCE(SUM(valor) FILTER (WHERE classe='receita'),0) AS receita,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND forma_pagamento='Débito' AND NOT (categoria = ANY($2::text[])) AND ${SEM_ESPELHO}),0) AS debito,
       COALESCE(SUM(valor) FILTER (WHERE classe='despesa' AND categoria = ANY($2::text[])),0) AS casa,
       COALESCE(SUM(valor) FILTER (WHERE classe='pagamento_fatura' AND forma_pagamento='Débito' AND ${SEM_ESPELHO}),0) AS fatura
     FROM financas_lancamentos WHERE date_trunc('month', data_lancamento) = $1::date`,
    [`${mes}-01`, CASA_CATS],
  );
  const c = { receita: Number(r.receita), debito: Number(r.debito), casa: Number(r.casa), fatura: Number(r.fatura) };
  return { ...c, saldo: c.receita - c.debito - c.casa - c.fatura };
}

const brl = (v: number) => Math.round(v).toLocaleString('pt-BR');

async function main() {
  const atual = currentDateSP().slice(0, 7);
  const meses = [3, 2, 1].map((i) => addMonths(atual, -i));
  let tudoOk = true;
  console.log(`limites: receita ±${LIMITES.receita}, fatura ±${LIMITES.fatura}, saldo ±${LIMITES.saldo}`);
  console.log('mês      componente  previsto      real      erro');
  for (const mes of meses) {
    const hoje = `${mes}-01`;
    const base = await getProjecaoBase('casal', hoje);
    const previsto = componentesPrevistos(computeProjecao(base, 0, hoje)[0]);
    const real = await realizado(mes);
    const { erros, ok } = avaliarMes(previsto, real);
    tudoOk &&= ok;
    for (const k of Object.keys(previsto) as (keyof Componentes)[]) {
      console.log(`${mes}  ${k.padEnd(10)} ${brl(previsto[k]).padStart(9)} ${brl(real[k]).padStart(9)} ${brl(erros[k]).padStart(9)}`);
    }
    console.log(`${mes}  ${ok ? 'APROVADO' : 'REPROVADO'}`);
  }
  await pool.end();
  process.exitCode = tudoOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
