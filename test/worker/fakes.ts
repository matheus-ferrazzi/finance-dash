import type { PluggyApi } from '../../src/worker/pluggy';
import type { Repo } from '../../src/worker/repositorio';
import type { LinhaBanco } from '../../src/worker/reconciliar';
import type { Conta, Execucao, PluggyConta, PluggyItem, PluggyTransacao } from '../../src/worker/tipos';

export function contaFake(p: Partial<Conta> = {}): Conta {
  return {
    account_id: 'acc-1', item_id: 'item-1', banco: 'Nubank', responsavel: 'Matheus', forma: 'Crédito',
    coleta_transacoes: true, coleta_saldo: false, coleta_faturas: true, coleta_investimentos: false, ...p,
  };
}

export function txFake(id: string, date = '2026-09-20', p: Partial<PluggyTransacao> = {}): PluggyTransacao {
  return { id, accountId: 'acc-1', date: `${date}T03:00:00.000Z`, description: 'LOJA', amount: -10, type: 'DEBIT', status: 'POSTED', category: 'Shopping', ...p };
}

export class PluggyFake implements PluggyApi {
  txs = new Map<string, PluggyTransacao[] | Error>();
  itens = new Map<string, PluggyItem>();
  contasPorItem = new Map<string, PluggyConta[]>();
  atualizados: string[] = [];
  async conta(id: string): Promise<PluggyConta> { return { id, itemId: 'item-1', type: 'CREDIT', balance: -50, creditData: { creditLimit: 100, availableCreditLimit: 50 } }; }
  async contasDoItem(itemId: string) { return this.contasPorItem.get(itemId) ?? []; }
  async transacoes(accountId: string) {
    const r = this.txs.get(accountId) ?? [];
    if (r instanceof Error) throw r;
    return r;
  }
  async faturas() { return [{ id: 'b1', dueDate: '2026-10-10T00:00:00Z', totalAmount: 50 }]; }
  async investimentos(itemId: string) { return [{ id: `inv-${itemId}`, itemId, balance: 10 }]; }
  async item(itemId: string) { return this.itens.get(itemId) ?? { id: itemId, lastUpdatedAt: '2026-10-09T00:00:00Z', nextAutoSyncAt: '2026-10-10T00:00:00Z' }; }
  async documentoTitular() { return '11111111111'; }
  async atualizarItem(itemId: string) { this.atualizados.push(itemId); }
}

export class RepoFake implements Repo {
  contas: Conta[] = [contaFake()];
  banco = new Map<string, LinhaBanco>();
  chamadas: string[] = [];
  execucoes: Execucao[] = [];
  aplicado: { linhas: string[]; remover: string[] }[] = [];
  desligadas: string[] = [];
  async contasAtivas() { return this.contas; }
  async idsRegistrados() { return new Set([...this.contas.map((c) => c.account_id), ...this.desligadas]); }
  async definirItemDaConta(a: string, i: string) { this.chamadas.push(`definirItem ${a} ${i}`); }
  async inserirConta(c: Conta) { this.chamadas.push(`inserirConta ${c.account_id} ${c.forma}`); }
  async lancamentosDaConta() { return new Map(this.banco); }
  async gravarCruas(t: readonly PluggyTransacao[]) { this.chamadas.push(`gravarCruas ${t.length}`); }
  async aplicarConta(l: readonly { id_transacao: string }[], r: readonly string[]) {
    this.chamadas.push('aplicarConta');
    this.aplicado.push({ linhas: l.map((x) => x.id_transacao), remover: [...r] });
  }
  async upsertFatura() { this.chamadas.push('upsertFatura'); }
  async upsertFaturasHistorico() { this.chamadas.push('upsertFaturasHistorico'); }
  async upsertSaldo() { this.chamadas.push('upsertSaldo'); }
  async upsertInvestimento() { this.chamadas.push('upsertInvestimento'); }
  async upsertItem(id: string) { this.chamadas.push(`upsertItem ${id}`); }
  async registrarSync(b: string, r: string) { this.chamadas.push(`registrarSync ${b} ${r}`); }
  async registrarExecucao(e: Execucao) { this.execucoes.push(e); }
}

export function linhaBancoFake(id: string, data = '2026-09-20'): LinhaBanco {
  return {
    id_transacao: id, data_lancamento: data, valor: 10, tipo_movimento: 'Saída', classe: 'despesa', descricao: 'LOJA',
    categoria: 'Shopping', forma_pagamento: 'Crédito', banco: 'Nubank', responsavel: 'Matheus', status_pluggy: 'POSTED',
  };
}
