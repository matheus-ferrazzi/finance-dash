import { TAREFAS, type NomeTarefa } from './tarefas';
import type { Modo } from './tipos';
import { BOTS, type Bot } from './notificacoes/textos';

/** Horário de São Paulo. Cada tarefa fica alguns minutos depois do horário do workflow que substitui. */
export const AGENDA: readonly [string, NomeTarefa][] = [
  ['5 16,22 * * *', 'transacoes'],
  ['15 16,22 * * *', 'faturas'],
  ['25 16,22 * * *', 'investimentos'],
  ['35 16,22 * * *', 'saldos'],
  ['9 14-22 * * *', 'itens'],
  ['0 13 * * *', 'atualizar-itens'],
];

/** Notificações (C2), no horário (SP) dos bots do n8n que substituem. */
export const AGENDA_NOTIF: readonly [string, Bot][] = [
  ['0 8 * * *', 'ritmo'],
  ['0 9 * * *', 'fatura'],
  ['45 16,22 * * *', 'gasto'],
  ['30 12 * * *', 'saude'],
  ['0 10 * * *', 'backup'],
  // D (WhatsApp): grupo do casal; técnico no privado do Matheus
  ['0 8 * * *', 'diario'],
  ['0 9 * * 1', 'semanal'],
  ['0 9 1 * *', 'mensal'],
  ['30 12 * * *', 'tecnico'],
];
export type TarefaNotif = `notif-${Bot}`;
const NOTIFS = new Set<string>(BOTS.map((b) => `notif-${b}`));

export function lerModo(v: string | undefined): Modo {
  return v === 'real' ? 'real' : 'sombra';
}

export interface Args {
  tarefa: NomeTarefa | TarefaNotif | 'agendar';
  dryRun: boolean;
  desde?: string;
  limite?: number;
  /** D2: grava o gráfico da notificação (só com --dry-run) */
  png?: string;
}

export function lerArgs(argv: string[]): Args {
  const [primeiro, ...resto] = argv;
  if (!primeiro || primeiro === 'agendar') return { tarefa: 'agendar', dryRun: false };
  if (NOTIFS.has(primeiro)) {
    // notificação: --dry-run (monta e mostra, não grava nem envia) e --png <arquivo> (grava o gráfico)
    const out: Args = { tarefa: primeiro as TarefaNotif, dryRun: false };
    for (let i = 0; i < resto.length; i++) {
      if (resto[i] === '--dry-run') out.dryRun = true;
      else if (resto[i] === '--png') {
        const v = resto[++i];
        if (!v || v.startsWith('--')) throw new Error('--png precisa de um arquivo');
        out.png = v;
      } else throw new Error(`opção desconhecida: ${resto[i]}`);
    }
    if (out.png && !out.dryRun) throw new Error('--png só com --dry-run');
    return out;
  }
  if (!(primeiro in TAREFAS)) throw new Error(`tarefa desconhecida: ${primeiro}. Use: ${[...Object.keys(TAREFAS), ...NOTIFS].join(', ')}`);
  const out: Args = { tarefa: primeiro as NomeTarefa, dryRun: false };
  for (let i = 0; i < resto.length; i++) {
    const a = resto[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--desde') {
      const v = resto[++i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v ?? '')) throw new Error('--desde precisa de AAAA-MM-DD');
      out.desde = v;
    } else if (a === '--limite') {
      const v = Number(resto[++i]);
      if (!(v > 0 && v <= 1)) throw new Error('--limite precisa ser um número entre 0 e 1');
      out.limite = v;
    } else throw new Error(`opção desconhecida: ${a}`);
  }
  return out;
}
