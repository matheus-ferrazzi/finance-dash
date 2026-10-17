import { describe, expect, it } from 'vitest';
import { reporPerdidas, rodadasPerdidas } from '../../src/worker/repor';
import type { NomeTarefa } from '../../src/worker/tarefas';
import { PluggyFake, RepoFake } from './fakes';

// 17/10: a Hostinger desligou a VPS das 15h57 às 16h35 SP e a ingestão das 16h se perdeu. Na subida, repõe.
const TZ = 'America/Sao_Paulo';
const AGENDA: readonly [string, NomeTarefa][] = [
  ['5 16,22 * * *', 'transacoes'],
  ['15 16,22 * * *', 'faturas'],
  ['0 23 * * *', 'tesouro'],
];
const sp = (iso: string) => new Date(`${iso}-03:00`);
const ult = (o: Partial<Record<NomeTarefa, string>>) => new Map(Object.entries(o).map(([k, v]) => [k as NomeTarefa, sp(v!)]));

describe('rodadasPerdidas', () => {
  it('o caso de 17/10: voltou às 16h35 sem as rodadas das 16h → repõe as duas, na ordem da agenda', () => {
    const ultimas = ult({ transacoes: '2026-10-16T22:05:10', faturas: '2026-10-16T22:15:10', tesouro: '2026-10-16T23:00:05' });
    expect(rodadasPerdidas(AGENDA, ultimas, sp('2026-10-17T16:35:00'), TZ)).toEqual(['transacoes', 'faturas']);
  });
  it('rodou depois do horário: nada a repor', () => {
    const ultimas = ult({ transacoes: '2026-10-17T16:05:03', faturas: '2026-10-17T16:15:02', tesouro: '2026-10-16T23:00:05' });
    expect(rodadasPerdidas(AGENDA, ultimas, sp('2026-10-17T18:00:00'), TZ)).toEqual([]);
  });
  it('próximo horário em menos de 1 h: deixa para a rodada normal', () => {
    const ultimas = ult({ transacoes: '2026-10-16T22:05:10', faturas: '2026-10-16T22:15:10', tesouro: '2026-10-16T23:00:05' });
    // 21h30: as das 16h se perderam, mas a das 22h05 vem em 35 min (faturas 22h15 em 45 min)
    expect(rodadasPerdidas(AGENDA, ultimas, sp('2026-10-17T21:30:00'), TZ)).toEqual([]);
  });
  it('nunca rodou: repõe', () => {
    expect(rodadasPerdidas(AGENDA, new Map(), sp('2026-10-17T18:00:00'), TZ)).toEqual(['transacoes', 'faturas', 'tesouro']);
  });
});

describe('reporPerdidas', () => {
  it('lê as últimas execuções no modo do worker e roda as perdidas em sequência', async () => {
    const repo = new RepoFake();
    repo.ultimas = ult({ transacoes: '2026-10-16T22:05:10', faturas: '2026-10-17T16:15:02', tesouro: '2026-10-16T23:00:05' });
    const rodou: string[] = [];
    const tarefas = Object.fromEntries(AGENDA.map(([, n]) => [n, async () => { rodou.push(n); return { tarefa: n, modo: 'real', inicio: '', fim: '', ok: true, contagens: {}, erro: null }; }])) as any;
    const feitas = await reporPerdidas({ pluggy: new PluggyFake(), repo, modo: 'real', agora: () => sp('2026-10-17T16:40:00'), log: () => {} }, AGENDA, tarefas, TZ);
    expect(repo.modoLido).toBe('real');
    expect(rodou).toEqual(['transacoes']);
    expect(feitas.map((e) => e.tarefa)).toEqual(['transacoes']);
  });
});
