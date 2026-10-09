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
  it('cobre as seis tarefas', () => {
    expect(new Set(AGENDA.map(([, t]) => t))).toEqual(new Set(['transacoes', 'faturas', 'investimentos', 'saldos', 'itens', 'atualizar-itens']));
  });
});
