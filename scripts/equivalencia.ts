// Compara a classificação antiga (JS do Finance 2.0) com a porta, sobre as transações cruas guardadas.
// Uso na VPS (só contagens e ids na saída):
//   docker exec -i finance-worker node equivalencia.js < /tmp/finance20.json
import { Pool } from 'pg';
import { compararClassificacao, extrairFuncoesAntigas } from '../src/worker/equivalencia';
import type { Conta, PluggyTransacao } from '../src/worker/tipos';

async function lerStdin(): Promise<string> {
  const partes: Buffer[] = [];
  for await (const p of process.stdin) partes.push(p as Buffer);
  return Buffer.concat(partes).toString('utf8');
}

async function main() {
  const wf = JSON.parse(await lerStdin()) as { nodes: { name: string; parameters: { jsCode?: string } }[] };
  const no = wf.nodes.find((n) => n.name === 'Code in JavaScript');
  if (!no?.parameters.jsCode) throw new Error('nó "Code in JavaScript" não encontrado no workflow');
  const antigas = extrairFuncoesAntigas(no.parameters.jsCode);

  const pool = new Pool({
    host: process.env.DB_HOST ?? 'postgres-hub', port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'personal_hub_db', user: process.env.WORKER_DB_USER, password: process.env.WORKER_DB_PASSWORD,
  });
  const r = await pool.query<{ raw: PluggyTransacao } & Conta>(
    `SELECT t.raw, c.account_id, c.item_id, c.banco, c.responsavel, c.forma,
            c.coleta_transacoes, c.coleta_saldo, c.coleta_faturas, c.coleta_investimentos
       FROM pluggy_transacoes t JOIN pluggy_contas c USING (account_id)`,
  );
  await pool.end();
  const res = compararClassificacao(antigas, r.rows.map(({ raw, ...conta }) => ({ t: raw, conta })));
  console.log(JSON.stringify(res, null, 2));
  process.exitCode = res.divergemCategoria + res.divergemClasse === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
