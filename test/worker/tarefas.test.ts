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

  it('N2: real pareia as transferências do casal depois de gravar todas as contas (sombra/dry-run não)', async () => {
    const c = cenario('real');
    c.repo.pareadas = 2;
    const ex = await TAREFAS.transacoes(c, {});
    expect(c.repo.chamadas.at(-1)).toBe('parear 2026-08-10');
    expect(ex.contagens.pareadas).toBe(2);
  });

  it('auditoria 18/10: cópia "só data" do pagamento do Nubank não vira linha e a que já estava no banco sai', async () => {
    const c = ctx('real');
    // 5 linhas boas + a seca: a remoção fica abaixo da trava de 20%
    const boas = ['a', 'x1', 'x2', 'x3', 'x4'];
    for (const id of [...boas, 'seca']) c.repo.banco.set(id, linhaBancoFake(id));
    const pag = { description: 'Pagamento recebido', amount: -1234 };
    c.pluggy.txs.set('acc-1', [...boas.map((id) => txFake(id)), txFake('seca', '2026-09-20', pag), txFake('hora', '2026-09-20', { ...pag, date: '2026-09-20T14:15:12.514Z' })]);
    await TAREFAS.transacoes(c, {});
    expect(c.repo.aplicado).toEqual([{ linhas: [...boas, 'hora'], remover: ['seca'] }]);
    expect(c.repo.chamadas[0]).toBe('gravarCruas 7');
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

  it('regras do painel relidas a cada conta: uma regra salva no meio da execução já vale para a conta seguinte', async () => {
    const c = ctx('real');
    c.repo.contas = [contaFake(), contaFake({ account_id: 'acc-2', forma: 'Débito' })];
    c.pluggy.txs.set('acc-1', [txFake('a', '2026-09-20')]);
    c.pluggy.txs.set('acc-2', [txFake('b', '2026-09-20', { accountId: 'acc-2' })]);
    const aplicar = c.repo.aplicarConta.bind(c.repo);
    const vistas: string[] = [];
    c.repo.aplicarConta = async (l: any, r: any) => {
      vistas.push(...l.map((x: any) => x.categoria));
      c.repo.regras = [{ id: 1, tipo: 'lancamento', chave: 'b', categoria: 'Gifts' }]; // salva no painel durante a execução
      return aplicar(l, r);
    };
    await TAREFAS.transacoes(c, {});
    expect(c.repo.regrasLidas).toBe(2);
    expect(vistas[1]).toBe('Gifts');
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

  it('conta já registrada, mesmo desligada, não é redescoberta', async () => {
    const c = ctx('sombra');
    c.repo.desligadas = ['acc-poupanca'];
    c.pluggy.contasPorItem.set('item-1', [{ id: 'acc-poupanca', itemId: 'item-1', type: 'BANK' }]);
    const ex = await TAREFAS.itens(c, {});
    expect(c.repo.chamadas.filter((x) => x.startsWith('inserirConta'))).toEqual([]);
    expect(ex.contagens.contasNovas).toBeUndefined();
  });
});

// 17/10: títulos do Tesouro de conexão desligada, pelo preço público (valor bruto)
describe('tesouro', () => {
  const CSV = [
    'Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha',
    'Tesouro Selic;01/03/2027;15/10/2026;0,01;0,02;20097,80;20086,80;20086,80',
    'Tesouro IPCA+;15/05/2035;15/10/2026;6,84;6,96;2713,48;2686,72;2686,72',
  ].join(String.fromCharCode(10));
  function cenario(modo: Modo) {
    const c = ctx(modo);
    let baixou = 0;
    c.tesouro = async () => { baixou++; return CSV; };
    c.repo.titulos = [
      { id_investimento: 't1', nome: 'LFT - Tesouro Selic 2027', quantidade: 0.03, banco: 'Inter', responsavel: 'Matheus' },
      { id_investimento: 't2', nome: 'NTN-B Princ - Tesouro IPCA 2035', quantidade: 0.02, banco: 'Inter', responsavel: 'Matheus' },
      { id_investimento: 't3', nome: 'LTN - Tesouro Prefixado 2031', quantidade: 1, banco: 'Inter', responsavel: 'Matheus' },
    ];
    return { c, baixou: () => baixou };
  }
  it('real: quantidade × PU de resgate do dia mais recente; título sem preço vira falha com o nome', async () => {
    const { c } = cenario('real');
    const ex = await TAREFAS.tesouro(c, {});
    expect(c.repo.chamadas).toEqual(['atualizarValorTitulo t1 602.6', 'atualizarValorTitulo t2 53.73']);
    expect(ex.contagens.titulos).toEqual(['Inter/Matheus LFT - Tesouro Selic 2027: 602.6 (2026-10-15)', 'Inter/Matheus NTN-B Princ - Tesouro IPCA 2035: 53.73 (2026-10-15)']);
    expect(ex.contagens.falhas).toEqual(['Inter/Matheus LTN - Tesouro Prefixado 2031: sem preço no Tesouro Transparente']);
    expect(ex.ok).toBe(false);
  });
  it('sombra e dry-run calculam sem gravar', async () => {
    for (const modo of ['sombra', 'dry-run'] as const) {
      const { c } = cenario(modo);
      const ex = await TAREFAS.tesouro(c, {});
      expect(c.repo.chamadas).toEqual([]);
      expect((ex.contagens.titulos as string[]).length).toBe(2);
    }
  });
  it('sem título de conexão desligada: não baixa o arquivo (14 MB)', async () => {
    const { c, baixou } = cenario('real');
    c.repo.titulos = [];
    const ex = await TAREFAS.tesouro(c, {});
    expect(baixou()).toBe(0);
    expect(ex.ok).toBe(true);
  });
});

// W3 (23/10): a reconciliação abortada era só uma contagem — a rodada ficava ok e ninguém era avisado
describe('W3: reconciliação abortada vira falha', () => {
  it('a conta que abortou entra nas falhas da rodada, com quantas e de quantas', async () => {
    const c = ctx('real');
    for (const id of ['k1', 'k2', 'k3', 'k4', 'k5']) c.repo.banco.set(id, linhaBancoFake(id));
    c.pluggy.txs.set('acc-1', [txFake('novo')]);
    const ex = await TAREFAS.transacoes(c, {});
    expect(ex.ok).toBe(false);
    expect(ex.contagens.falhas).toEqual(['Nubank/Matheus/Crédito: conferência abortada (acima_do_limite): sumiriam 5 de 5 lançamentos']);
  });
});
