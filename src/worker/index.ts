import { Cron } from 'croner';
import { Pool } from 'pg';
import { AGENDA, lerArgs, lerModo } from './cli';
import { PluggyClient } from './pluggy';
import { PgRepo } from './repositorio';
import { TAREFAS } from './tarefas';

const TZ = 'America/Sao_Paulo';

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`variável de ambiente ${nome} ausente`);
  return v;
}

async function main() {
  const args = lerArgs(process.argv.slice(2)); // valida antes de abrir conexão
  const pool = new Pool({
    host: process.env.DB_HOST ?? 'postgres-hub',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'personal_hub_db',
    user: exigir('WORKER_DB_USER'),
    password: exigir('WORKER_DB_PASSWORD'),
    max: 3,
  });
  const creds = { clientId: exigir('PLUGGY_CLIENT_ID'), clientSecret: exigir('PLUGGY_CLIENT_SECRET') };
  const repo = new PgRepo(pool);
  const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);
  const modo = lerModo(process.env.WORKER_MODO);
  // cliente (e chave da Pluggy) novo a cada rodada: a chave vence em ~2h e o processo vive dias
  const base = () => ({ pluggy: new PluggyClient(creds), repo, agora: () => new Date(), log });

  if (args.tarefa === 'agendar') {
    for (const [expr, nome] of AGENDA) {
      new Cron(expr, { timezone: TZ, protect: true }, async () => {
        const ex = await TAREFAS[nome]({ ...base(), modo }, {});
        log(`${nome} ${ex.ok ? 'ok' : 'FALHOU'} ${JSON.stringify(ex.contagens)}${ex.erro ? ` erro=${ex.erro}` : ''}`);
      });
    }
    log(`worker no ar, modo=${modo}, ${AGENDA.length} tarefas agendadas (${TZ})`);
    return;
  }

  const ex = await TAREFAS[args.tarefa]({ ...base(), modo: args.dryRun ? 'dry-run' : modo }, { desde: args.desde, limite: args.limite });
  console.log(JSON.stringify(ex, null, 2));
  await pool.end();
  process.exitCode = ex.ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
