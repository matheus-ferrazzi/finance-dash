import { describe, expect, it } from 'vitest';
import { AGENDA, lerArgs, lerModo } from '../../src/worker/cli';

describe('lerModo', () => {
  it('só "real" liga o modo real; qualquer outra coisa é sombra', () => {
    expect([lerModo('real'), lerModo(undefined), lerModo('REAL'), lerModo('')]).toEqual(['real', 'sombra', 'sombra', 'sombra']);
  });
});

describe('lerArgs', () => {
  it('sem argumento é o agendador', () => {
    expect(lerArgs([])).toEqual({ tarefa: 'agendar', dryRun: false });
  });
  it('tarefa com opções', () => {
    expect(lerArgs(['transacoes', '--dry-run', '--desde', '2024-10-01', '--limite', '0.5']))
      .toEqual({ tarefa: 'transacoes', dryRun: true, desde: '2024-10-01', limite: 0.5 });
  });
  it('rejeita tarefa, data e limite inválidos', () => {
    expect(() => lerArgs(['apagar-tudo'])).toThrow(/tarefa/);
    expect(() => lerArgs(['transacoes', '--desde', '01/10/2024'])).toThrow(/desde/);
    expect(() => lerArgs(['transacoes', '--limite', '2'])).toThrow(/limite/);
  });
});

describe('AGENDA', () => {
  it('cobre as cinco tarefas; sem pedir atualização de item (17/10: item do Meu Pluggy não aceita PATCH)', () => {
    expect(new Set(AGENDA.map(([, t]) => t))).toEqual(new Set(['transacoes', 'faturas', 'investimentos', 'saldos', 'itens']));
  });
});

describe('notificações (C2)', () => {
  it('aceita notif-<bot> com --dry-run; recusa bot desconhecido e opção de ingestão', async () => {
    expect(lerArgs(['notif-ritmo', '--dry-run'])).toEqual({ tarefa: 'notif-ritmo', dryRun: true });
    expect(lerArgs(['notif-backup'])).toEqual({ tarefa: 'notif-backup', dryRun: false });
    expect(() => lerArgs(['notif-xyz'])).toThrow('tarefa desconhecida');
    expect(() => lerArgs(['notif-gasto', '--desde', '2026-01-01'])).toThrow('opção desconhecida');
  });
  it('agenda nos horários do n8n', async () => {
    const { AGENDA_NOTIF } = await import('../../src/worker/cli');
    expect(AGENDA_NOTIF).toEqual([['0 8 * * *', 'ritmo'], ['0 9 * * *', 'fatura'], ['45 16,22 * * *', 'gasto'], ['30 12 * * *', 'saude'], ['0 10 * * *', 'backup'],
      ['0 8 * * *', 'diario'], ['0 9 * * 1', 'semanal'], ['0 9 1 * *', 'mensal'], ['30 12 * * *', 'tecnico'],
      ['0 9 * * 2,5', 'meta'], ['50 16 * * *', 'alerta-meta'], ['5 8 * * *', 'alerta-meta']]);
    expect(lerArgs(['notif-alerta-meta', '--dry-run'])).toEqual({ tarefa: 'notif-alerta-meta', dryRun: true });
    expect(lerArgs(['notif-diario', '--dry-run'])).toEqual({ tarefa: 'notif-diario', dryRun: true });
  });
});


describe('--png (D2)', () => {
  it('notificação aceita --png <arquivo> só com --dry-run', () => {
    expect(lerArgs(['notif-diario', '--dry-run', '--png', '/tmp/d.png'])).toEqual({ tarefa: 'notif-diario', dryRun: true, png: '/tmp/d.png' });
    expect(() => lerArgs(['notif-diario', '--png', '/tmp/d.png'])).toThrow(/--png só com --dry-run/);
    expect(() => lerArgs(['notif-diario', '--dry-run', '--png'])).toThrow(/--png precisa de um arquivo/);
    // D2-M9: o container roda como "node" e só /tmp é gravável — nome solto vai para /tmp
    expect(lerArgs(['notif-diario', '--dry-run', '--png', 'd.png']).png).toBe('/tmp/d.png');
  });
});
