import { describe, expect, it } from 'vitest';
import { TAREFAS, type Contexto } from '../../src/worker/tarefas';
import type { Modo } from '../../src/worker/tipos';
import { PluggyFake, RepoFake, contaFake, linhaBancoFake, txFake } from './fakes';

function ctx(modo: Modo, pluggy = new PluggyFake(), repo = new RepoFake()): Contexto & { pluggy: PluggyFake; repo: RepoFake } {
  return { pluggy, repo, modo, agora: () => new Date('2026-10-09T19:05:00Z'), log: () => {} };
}

describe('transacoes', () => {
  function cenario(modo: Modo) {
    const c = ctx(modo);
    // banco tem a, b (sumiu da Pluggy), x1..x3 e "borda" (no dia exato de "desde": nunca é candidata)
    for (const id of ['a', 'b', 'x1', 'x2', 'x3']) c.repo.banco.set(id, linhaBancoFake(id));
    c.repo.banco.set('borda', linhaBancoFake('borda', '2026-08-10'));
    c.pluggy.txs.set('acc-1', [txFake('a'), txFake('x1'), txFake('x2'), txFake('x3'), txFake('novo')]);
    return c;
  }

  it('sombra: grava cru, não toca financas_*, conta o que faria', async () => {
    const c = cenario('sombra');
    const ex = await TAREFAS.transacoes(c, {});
    expect(c.repo.chamadas).toEqual(['gravarCruas 5']);
    expect(ex.ok).toBe(true);
    expect(ex.contagens.contas).toEqual({
      'Nubank/Matheus/Crédito': { pluggy: 5, novos: 1, alterados: 0, iguais: 4, porCampo: {}, remover: 1, abortado: null },
    });
    expect(c.repo.execucoes).toHaveLength(1);
  });

  it('real: aplica linhas e remove o que sumiu, sem tocar a linha da borda', async () => {
    const c = cenario('real');
    await TAREFAS.transacoes(c, {});
    expect(c.repo.aplicado).toEqual([{ linhas: ['a', 'x1', 'x2', 'x3', 'novo'], remover: ['b'] }]);
  });

  it('não remove o que é mais antigo que o histórico que o banco expõe (Itaú só devolve 12 meses)', async () => {
    const c = ctx('real');
    // pedido de 24 meses, mas a Pluggy só tem transações a partir de 2025-10-15
    for (const id of ['velha1', 'velha2']) c.repo.banco.set(id, linhaBancoFake(id, '2025-03-01'));
    for (const id of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10']) c.repo.banco.set(id, linhaBancoFake(id, '2026-01-10'));
    c.pluggy.txs.set('acc-1', ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'].map((id) => txFake(id, '2026-01-10'))
      .concat([txFake('mais-antiga', '2025-10-15')]));
    await TAREFAS.transacoes(c, { desde: '2024-10-09' });
    expect(c.repo.aplicado[0].remover).toEqual([]);
  });

  it('dry-run: não grava nada além da execução', async () => {
    const c = cenario('dry-run');
    await TAREFAS.transacoes(c, {});
    expect(c.repo.chamadas).toEqual([]);
    expect(c.repo.execucoes[0].modo).toBe('dry-run');
  });

  it('janela padrão é 60 dias antes de hoje em São Paulo', async () => {
    const c = cenario('dry-run');
    const ex = await TAREFAS.transacoes(c, {});
    expect(ex.contagens.desde).toBe('2026-08-10');
  });

  it('falha numa conta não derruba a outra', async () => {
    const c = ctx('real');
    c.repo.contas = [contaFake(), contaFake({ account_id: 'acc-2', forma: 'Débito' })];
    c.pluggy.txs.set('acc-1', new Error('Pluggy HTTP 500'));
    c.pluggy.txs.set('acc-2', [txFake('z', '2026-09-20', { accountId: 'acc-2' })]);
    const ex = await TAREFAS.transacoes(c, {});
    expect(ex.ok).toBe(false);
    expect(ex.contagens.falhas).toEqual(['Nubank/Matheus/Crédito: Pluggy HTTP 500']);
    expect(c.repo.aplicado).toHaveLength(1);
  });

  it('conta sem item_id é resolvida pela Pluggy; em sombra o item é gravado em pluggy_contas', async () => {
    const c = ctx('sombra');
    c.repo.contas = [contaFake({ item_id: null })];
    await TAREFAS.transacoes(c, {});
    expect(c.repo.chamadas[0]).toBe('definirItem acc-1 item-1');
  });
});

describe('faturas, saldos, investimentos', () => {
  it('real grava; sombra só conta', async () => {
    const real = ctx('real');
    real.repo.contas = [contaFake({ coleta_saldo: true, coleta_investimentos: true })];
    await TAREFAS.faturas(real, {});
    await TAREFAS.saldos(real, {});
    await TAREFAS.investimentos(real, {});
    expect(real.repo.chamadas).toEqual(['upsertFatura', 'upsertFaturasHistorico', 'upsertSaldo', 'upsertInvestimento']);

    const sombra = ctx('sombra');
    sombra.repo.contas = real.repo.contas;
    await TAREFAS.faturas(sombra, {});
    await TAREFAS.saldos(sombra, {});
    await TAREFAS.investimentos(sombra, {});
    expect(sombra.repo.chamadas).toEqual([]);
    expect(sombra.repo.execucoes.map((e) => e.ok)).toEqual([true, true, true]);
  });
});

describe('itens', () => {
  it('real atualiza pluggy_itens e o selo; sombra só pluggy_itens', async () => {
    const real = ctx('real');
    await TAREFAS.itens(real, {});
    expect(real.repo.chamadas).toEqual(['upsertItem item-1', 'registrarSync Nubank Matheus']);
    const sombra = ctx('sombra');
    await TAREFAS.itens(sombra, {});
    expect(sombra.repo.chamadas).toEqual(['upsertItem item-1']);
  });

  it('descobre conta nova de item conhecido', async () => {
    const c = ctx('sombra');
    c.pluggy.contasPorItem.set('item-1', [
      { id: 'acc-1', itemId: 'item-1', type: 'CREDIT' },
      { id: 'acc-nova', itemId: 'item-1', type: 'BANK' },
    ]);
    const ex = await TAREFAS.itens(c, {});
    expect(c.repo.chamadas).toContain('inserirConta acc-nova Débito');
    expect(ex.contagens.contasNovas).toEqual(['Nubank/Matheus/Débito']);
  });
});

describe('atualizar-itens', () => {
  it('pede atualização só em modo real e só para item parado sem auto-sync', async () => {
    const parado = { id: 'item-1', nextAutoSyncAt: null, lastUpdatedAt: '2026-09-16T00:11:00Z' };
    const sombra = ctx('sombra');
    sombra.pluggy.itens.set('item-1', parado);
    const ex = await TAREFAS['atualizar-itens'](sombra, {});
    expect(sombra.pluggy.atualizados).toEqual([]);
    expect(ex.contagens.pedidos).toEqual(['Nubank/Matheus']);

    const real = ctx('real');
    real.pluggy.itens.set('item-1', parado);
    await TAREFAS['atualizar-itens'](real, {});
    expect(real.pluggy.atualizados).toEqual(['item-1']);
  });
});
