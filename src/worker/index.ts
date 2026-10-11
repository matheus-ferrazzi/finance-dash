import { writeFileSync } from 'node:fs';
import { Cron } from 'croner';
import { Pool } from 'pg';
import { AGENDA, AGENDA_NOTIF, lerArgs, lerModo } from './cli';
import { CanalTelegram } from './notificacoes/canal';
import { CanalWhatsApp } from './notificacoes/whatsapp';
import { criarFontes } from './notificacoes/fontes';
import { destinoDe, modoDoBot, rodarNotificacao } from './notificacoes/motor';
import { paraPng } from './notificacoes/png';
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
  const telegram = token && chat ? new CanalTelegram(token, chat) : null;
  // D: WhatsApp (Evolution API na rede interna); diário/semanal/mensal vão para o grupo do WhatsApp quando
  // configurado (senão, Telegram); os bots do C2 ficam no Telegram até o desligamento
  const waUrl = process.env.WA_URL ?? 'http://evolution:8080';
  const waKey = process.env.WA_API_KEY;
  const waInst = process.env.WA_INSTANCIA ?? 'financas';
  const wa = (destino: string | undefined) => (waKey && destino ? new CanalWhatsApp(waUrl, waKey, waInst, destino) : null);
  const canais = { grupo: wa(process.env.WA_GRUPO) ?? telegram, matheus: wa(process.env.WA_MATHEUS), telegram };
  const notif = {
    fontes: criarFontes(pool, process.env.PAINEL_INTERNO ?? 'http://finance-dashboard:3000'),
    registro: new PgRegistroNotif(pool), canais, painelUrl: process.env.PAINEL_URL ?? '',
  };
  const notificar = async (bot: Bot, dryRun: boolean) => {
    const modo = dryRun ? 'dry-run' as const : modoDoBot(bot, process.env.NOTIF_REAL, !!canais[destinoDe(bot)]);
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
    if (!canais.grupo) log('notificações do grupo em sombra: sem WhatsApp (WA_API_KEY/WA_GRUPO) nem Telegram');
    if (!canais.matheus) log('aviso técnico em sombra: sem WA_MATHEUS');
    if (!canais.telegram) log('bots do C2 em sombra: sem Telegram');
    if (!notif.painelUrl) log('PAINEL_URL vazio: as mensagens saem sem link do painel');
    log(`worker no ar, modo=${modo}, ${AGENDA.length} tarefas + ${AGENDA_NOTIF.length} notificações agendadas (${TZ})`);
    return;
  }

  if (args.tarefa.startsWith('notif-')) {
    const r = await notificar(args.tarefa.slice('notif-'.length) as Bot, args.dryRun);
    if (args.png) {
      if (r.svg) { writeFileSync(args.png, await paraPng(r.svg)); console.log(`gráfico gravado em ${args.png}`); }
      else console.log('sem gráfico para esta mensagem');
    }
    const { svg: _svg, ...semSvg } = r;
    console.log(JSON.stringify(semSvg, null, 2));
    await pool.end();
    // só o aviso da imagem (texto entregue) não é falha
    process.exitCode = r.erro && !r.erro.startsWith('imagem:') ? 1 : 0;
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
