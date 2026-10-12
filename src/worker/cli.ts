import { TAREFAS, type NomeTarefa } from './tarefas';
import type { Modo } from './tipos';

/** Horário de São Paulo. Cada tarefa fica alguns minutos depois do horário do workflow que substitui. */
export const AGENDA: readonly [string, NomeTarefa][] = [
  ['5 16,22 * * *', 'transacoes'],
  ['15 16,22 * * *', 'faturas'],
  ['25 16,22 * * *', 'investimentos'],
  ['35 16,22 * * *', 'saldos'],
  ['9 14-22 * * *', 'itens'],
  ['0 13 * * *', 'atualizar-itens'],
];

export function lerModo(v: string | undefined): Modo {
  return v === 'real' ? 'real' : 'sombra';
}

export interface Args {
  tarefa: NomeTarefa | 'agendar';
  dryRun: boolean;
  desde?: string;
  limite?: number;
}

export function lerArgs(argv: string[]): Args {
  const [primeiro, ...resto] = argv;
  if (!primeiro || primeiro === 'agendar') return { tarefa: 'agendar', dryRun: false };
  if (!(primeiro in TAREFAS)) throw new Error(`tarefa desconhecida: ${primeiro}. Use: ${Object.keys(TAREFAS).join(', ')}`);
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
