import { Cron } from 'croner';
import { Pool } from 'pg';
import { AGENDA, AGENDA_NOTIF, lerArgs, lerModo } from './cli';
import { CanalTelegram } from './notificacoes/canal';
import { criarFontes } from './notificacoes/fontes';
import { modoDoBot, rodarNotificacao } from './notificacoes/motor';
import { PgRegistroNotif } from './notificacoes/registro';
import type { Bot } from './notificacoes/textos';
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

  // notificações (C2): sem token/chat do Telegram, tudo em sombra (registra, não envia)
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  const canal = token && chat ? new CanalTelegram(token, chat) : null;
  const notif = { fontes: criarFontes(pool), registro: new PgRegistroNotif(pool), canal };
  const notificar = async (bot: Bot, dryRun: boolean) => {
    const modo = dryRun ? 'dry-run' as const : modoDoBot(bot, process.env.NOTIF_REAL, !!canal);
    return rodarNotificacao(bot, { ...notif, modo });
  };

  if (args.tarefa === 'agendar') {
    for (const [expr, nome] of AGENDA) {
      new Cron(expr, { timezone: TZ, protect: true }, async () => {
        const ex = await TAREFAS[nome]({ ...base(), modo }, {});
        log(`${nome} ${ex.ok ? 'ok' : 'FALHOU'} ${JSON.stringify(ex.contagens)}${ex.erro ? ` erro=${ex.erro}` : ''}`);
      });
    }
    for (const [expr, bot] of AGENDA_NOTIF) {
      new Cron(expr, { timezone: TZ, protect: true }, async () => {
        try {
          const r = await notificar(bot, false);
          log(`notif-${bot} ${r.modo} ${r.texto === null ? 'sem mensagem' : `enviado=${r.enviado}`}${r.erro ? ` erro=${r.erro}` : ''}`);
        } catch (e) {
          // registrar no banco falhou: só o log; a notificação não derruba o worker nem a ingestão
          log(`notif-${bot} FALHOU ${e instanceof Error ? e.message : String(e)}`);
        }
      });
    }
    if (!canal) log('notificações em sombra: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ausentes');
    log(`worker no ar, modo=${modo}, ${AGENDA.length} tarefas + ${AGENDA_NOTIF.length} notificações agendadas (${TZ})`);
    return;
  }

  if (args.tarefa.startsWith('notif-')) {
    const r = await notificar(args.tarefa.slice('notif-'.length) as Bot, args.dryRun);
    console.log(JSON.stringify(r, null, 2));
    await pool.end();
    process.exitCode = r.erro ? 1 : 0;
    return;
  }

  const ex = await TAREFAS[args.tarefa as keyof typeof TAREFAS]({ ...base(), modo: args.dryRun ? 'dry-run' : modo }, { desde: args.desde, limite: args.limite });
  console.log(JSON.stringify(ex, null, 2));
  await pool.end();
  process.exitCode = ex.ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
