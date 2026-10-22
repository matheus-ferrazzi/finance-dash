import { writeFileSync } from 'node:fs';
import { Cron } from 'croner';
import { Pool } from 'pg';
import { AGENDA, AGENDA_NOTIF, lerArgs, lerModo } from './cli';
import { PgAcoes } from './bot/acoes';
import { criarBot } from './bot/bot';
import { lerMembros } from './bot/entrada';
import { ClienteGroq } from './bot/groq';
import { PgRegistroBot } from './bot/registro';
import { criarServidor } from './bot/servidor';
import { currentDateSP } from '../lib/format';
import { CanalTelegram } from './notificacoes/canal';
import { CanalWhatsApp } from './notificacoes/whatsapp';
import { estadoDaSessao, vigiarWhatsApp } from './notificacoes/vigia';
import { criarFontes } from './notificacoes/fontes';
import { destinoDe, modoDoBot, rodarNotificacao } from './notificacoes/motor';
import { paraPng } from './notificacoes/png';
import { PgRegistroNotif } from './notificacoes/registro';
import type { Bot } from './notificacoes/textos';
import { PluggyClient } from './pluggy';
import { PgRepo } from './repositorio';
import { reporPerdidas } from './repor';
import { TAREFAS } from './tarefas';
import { comTentativas, URL_PRECOS_TESOURO } from './tesouro';

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
  // 17/10: preços públicos do Tesouro (títulos de conexão desligada); ~14 MB, 2 min de folga
  // 22/10: até 3 tentativas, 30 s entre elas (em 21/10 às 23h o download falhou uma vez por rede e a rodada se perdeu)
  const tesouro = () => comTentativas(async () => {
    const r = await fetch(URL_PRECOS_TESOURO, { signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error(`Tesouro Transparente HTTP ${r.status}`);
    return r.text();
  }, 3, 30000);
  const base = () => ({ pluggy: new PluggyClient(creds), repo, agora: () => new Date(), log, tesouro });

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
  // E1: bot de perguntas (só sobe no "agendar" e com tudo configurado)
  const groqKey = process.env.GROQ_API_KEY;
  const groq = groqKey ? new ClienteGroq(groqKey, (process.env.GROQ_MODELOS ?? 'openai/gpt-oss-120b').split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const registroBot = new PgRegistroBot(pool);
  // auditoria 13/10: rotas /api/bot/* e /api/resumo/* do painel exigem este token quando ele está configurado
  const tokenInterno = process.env.PAINEL_TOKEN_INTERNO || undefined;
  const cabInterno: Record<string, string> = tokenInterno ? { 'x-interno': tokenInterno } : {};
  const notif = {
    fontes: criarFontes(pool, process.env.PAINEL_INTERNO ?? 'http://finance-dashboard:3000', undefined,
      groq ? async () => ({ falhas24h: await registroBot.falhas24h(), modelosSumidos: await groq.modelosSumidos() }) : undefined,
      tokenInterno),
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
    new Cron('20 4 * * *', { timezone: TZ, protect: true }, async () => {
      const n = await registroBot.limpar(90).catch(() => 0);
      if (n) log(`bot: ${n} conversa(s) com mais de 90 dias apagada(s)`);
      // E2-M4: propostas paradas expiram; registro de ação com mais de 1 ano sai
      const l = await new PgAcoes(pool).limpar().catch(() => ({ expiradas: 0, apagadas: 0 }));
      if (l.expiradas || l.apagadas) log(`bot: ${l.expiradas} proposta(s) expirada(s), ${l.apagadas} ação(ões) com mais de 1 ano apagada(s)`);
    });
    // S1 (auditoria 13/10): sessão do WhatsApp caiu → aviso pelo Telegram (o técnico sai pelo próprio WhatsApp)
    if (waKey && process.env.WA_GRUPO) {
      new Cron('0 1,7,13,19 * * *', { timezone: TZ, protect: true }, async () => {
        const e = await vigiarWhatsApp(() => estadoDaSessao(waUrl, waKey, waInst), telegram).catch((x) => `erro ao avisar: ${x instanceof Error ? x.message : x}`);
        if (e !== 'open') log(`vigia-whatsapp: sessão ${e}${telegram ? ' (aviso no Telegram)' : ' (sem Telegram para avisar)'}`);
      });
    }
    const faltando = ['GROQ_API_KEY', 'BOT_TOKEN', 'BOT_MEMBROS', 'BOT_JIDS', 'WA_GRUPO', 'WA_API_KEY'].filter((k) => !process.env[k]);
    if (faltando.length) log(`bot desligado: falta ${faltando.join(', ')}`);
    else {
      const painelBase = process.env.PAINEL_INTERNO ?? 'http://finance-dashboard:3000';
      const wa = new CanalWhatsApp(waUrl, waKey!, waInst, process.env.WA_GRUPO!);
      const bot = criarBot({
        cfg: { grupo: process.env.WA_GRUPO!, membros: lerMembros(process.env.BOT_MEMBROS!), botJids: process.env.BOT_JIDS!.split('|').filter(Boolean) },
        groq: groq!, registro: registroBot, wa, renderizar: (s) => paraPng(s), hoje: currentDateSP, painelUrl: notif.painelUrl, log,
        painel: async (c) => {
          const r = await fetch(`${painelBase}${c}`, { headers: cabInterno, signal: AbortSignal.timeout(30000) });
          return { ok: r.ok, dados: await r.json().catch(() => ({ erro: `HTTP ${r.status}` })) };
        },
        // E2: escrita só pelas rotas /api/bot/{previa,executar,desfazer}, depois do "sim" lido pelo código
        painelPost: async (c, corpo) => {
          const r = await fetch(`${painelBase}${c}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cabInterno }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(30000) });
          return { ok: r.ok, dados: await r.json().catch(() => ({ erro: `HTTP ${r.status}` })) };
        },
        acoes: new PgAcoes(pool),
      });
      const porta = Number(process.env.BOT_PORTA ?? 8090);
      const servidor = criarServidor(process.env.BOT_TOKEN!, (c) => bot.receber(c));
      // falha do servidor do bot (porta ocupada etc.) não derruba a ingestão
      servidor.on('error', (e: NodeJS.ErrnoException) => log(`bot: servidor fora (${e.code ?? e.message})`));
      servidor.listen(porta, '0.0.0.0', () => log(`bot no ar na porta interna ${porta}`));
    }
    log(`worker no ar, modo=${modo}, ${AGENDA.length} tarefas + ${AGENDA_NOTIF.length} notificações agendadas (${TZ})`);
    // 17/10: rodada perdida (VPS desligada pela Hostinger, deploy no meio de uma rodada) roda uma vez na subida;
    // 30 s de folga para o Postgres e a rede subirem junto com a VPS
    setTimeout(() => {
      reporPerdidas({ ...base(), modo }, AGENDA, TAREFAS, TZ)
        .then((feitas) => { for (const ex of feitas) log(`${ex.tarefa} (reposta) ${ex.ok ? 'ok' : 'FALHOU'} ${JSON.stringify(ex.contagens)}${ex.erro ? ` erro=${ex.erro}` : ''}`); })
        .catch((e) => log(`repor rodada perdida FALHOU ${e instanceof Error ? e.message : String(e)}`));
    }, 30000);
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
