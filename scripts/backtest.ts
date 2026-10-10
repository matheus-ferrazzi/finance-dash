// Teste contra o passado, na VPS: 12 meses fechados × horizontes 1-3 × regras do débito.
//   docker cp dist/backtest.js finance-dashboard:/tmp/backtest.js && docker exec finance-dashboard node /tmp/backtest.js
// Imprime só agregados (erro médio e viés), nunca lançamentos. Resultado vai para o vault.
import { componentesPrevistos, escolherRegra, resumirErros, type LinhaErro } from '../src/lib/backtest';
import { pool } from '../src/lib/db';
import { currentDateSP } from '../src/lib/format';
import { addMonths, diasNoMes } from '../src/lib/previsao';
import { computeProjecao, getProjecaoBase, getRealizado } from '../src/lib/queries';
import type { RegraDebito } from '../src/lib/debito';

const REGRAS: RegraDebito[] = ['confiaveis', 'media3', 'ponderada6', 'mediana3'];
// previsão feita na véspera do mês (último dia do mês anterior)
const vespera = (mes: string) => { const a = addMonths(mes, -1); return `${a}-${String(diasNoMes(a)).padStart(2, '0')}`; };

async function main() {
  const atual = currentDateSP().slice(0, 7);
  const meses = Array.from({ length: 12 }, (_, i) => addMonths(atual, -(12 - i)));
  const real = new Map(await Promise.all(meses.map(async (m) => [m, await getRealizado(m)] as const)));
  const linhas: LinhaErro[] = [];
  for (const regra of REGRAS) for (const h of [1, 2, 3]) for (const mes of meses) {
    // horizonte h: a previsão do mês é feita h-1 meses antes da sua véspera
    const hoje = vespera(addMonths(mes, -(h - 1)));
    const proj = computeProjecao(await getProjecaoBase('casal', hoje, { regraDebito: regra }), h, hoje);
    const p = componentesPrevistos(proj[h]);
    const r = real.get(mes)!;
    linhas.push({ regra, horizonte: h, mes, erros: { receita: p.receita - r.receita, debito: p.debito - r.debito, casa: p.casa - r.casa, fatura: p.fatura - r.fatura, saldo: p.saldo - r.saldo } });
  }
  const resumo = resumirErros(linhas);
  console.log('regra       h  componente   erro_medio   vies');
  for (const x of resumo) console.log(`${x.regra.padEnd(11)} ${x.horizonte}  ${x.comp.padEnd(10)} ${String(Math.round(x.mae)).padStart(10)} ${String(Math.round(x.vies)).padStart(7)}`);
  const esc = escolherRegra(resumo);
  console.log(`\nescolhida: ${esc.regra} (${esc.motivo})`);
  console.log(JSON.stringify({ errosSaldoH1: linhas.filter((l) => l.regra === esc.regra && l.horizonte === 1).map((l) => ({ mes: l.mes, e: Math.round(l.erros.saldo) })) }));
  await pool.end();
}
main();
