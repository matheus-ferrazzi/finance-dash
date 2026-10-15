import type {
  Conta, FaturaAtual, FaturaHistorico, Forma, Investimento, PluggyConta, PluggyFatura,
  PluggyInvestimento, PluggyItem, Saldo,
} from './tipos';

/** Porta do nó "Transformar Dados Fatura" (workflow Pluggy - Faturas Cartão de Crédito). */
export function montarFatura(account: PluggyConta, bills: readonly PluggyFatura[], conta: Conta, agoraIso: string): FaturaAtual {
  const creditData = account.creditData ?? {};
  const sorted = bills.slice().sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
  const bill: Partial<PluggyFatura> = sorted[0] ?? {};
  const usado = (creditData.creditLimit || 0) - (creditData.availableCreditLimit || 0);
  const bal = Math.abs(account.balance || 0);
  const valor = bal > 0 ? bal : usado > 0 ? Math.round(usado * 100) / 100 : 0;
  const venc = ((bill.dueDate || creditData.balanceDueDate || '') + '').slice(0, 10) || null;
  const fech = ((bill.billClosingDate || creditData.balanceCloseDate || '') + '').slice(0, 10) || null;
  const minimo = bill.minimumPaymentAmount || creditData.minimumPayment || 0;
  return {
    id_conta: account.id, banco: conta.banco, responsavel: conta.responsavel,
    limite_total: creditData.creditLimit || 0, limite_disponivel: creditData.availableCreditLimit || 0,
    valor_fatura_atual: valor, data_fechamento: fech, data_vencimento: venc,
    pagamento_minimo: minimo, atualizado_em: agoraIso,
  };
}

/** Novo: todas as faturas que a Pluggy devolve, com encargos e pagamentos. */
export function montarHistorico(accountId: string, bills: readonly PluggyFatura[]): FaturaHistorico[] {
  return bills.map((b) => ({
    id: b.id, account_id: accountId, vencimento: b.dueDate ? b.dueDate.slice(0, 10) : null,
    total: b.totalAmount ?? null, minimo: b.minimumPaymentAmount ?? null,
    encargos: b.financeCharges ?? [], pagamentos: b.payments ?? [],
  }));
}

/** Porta do nó "Transformar" (workflow Pluggy - Saldos das Contas). */
export function montarSaldo(a: PluggyConta, conta: Conta): Saldo {
  return {
    id_conta: a.id, banco: conta.banco, responsavel: conta.responsavel,
    tipo: a.subtype || a.type || null, saldo: Number(a.balance ?? 0), atualizado_pluggy: a.updatedAt || null,
  };
}

/** Porta do nó "Transformar Investimentos" (workflow Pluggy - Investimentos). */
export function montarInvestimento(inv: PluggyInvestimento, meta: { banco: string; responsavel: string }, agoraIso: string): Investimento {
  // valor atual: balance; se faltar, preço unitário * quantidade (nunca o preço unitário puro)
  const valorAtual = inv.balance != null ? inv.balance : (inv.value || 0) * (inv.quantity || 0);
  // principal aplicado: amountOriginal; senão amount; senão o valor atual
  const valorInvestido = inv.amountOriginal != null ? inv.amountOriginal : inv.amount != null ? inv.amount : valorAtual;
  // lucro: só o que a Pluggy informa
  const lucro = inv.amountProfit != null ? inv.amountProfit : 0;
  return {
    id_investimento: inv.id, item_id: inv.itemId, nome: inv.name || 'Sem nome', tipo: inv.type || 'Desconhecido',
    subtipo: inv.subtype || null, valor_investido: valorInvestido, valor_atual: valorAtual, lucro_acumulado: lucro,
    quantidade: inv.quantity || null, rentabilidade_anual: inv.annualRate || null,
    data_vencimento: inv.date ? inv.date.split('T')[0] : null,
    banco: meta.banco, responsavel: meta.responsavel, status: inv.status || null, atualizado_em: agoraIso,
  };
}

/** Item sem auto-sync configurado (nextAutoSyncAt nulo) e parado há mais de 26 h — caso do Inter em set/2026. */
export function precisaPedirAtualizacao(item: PluggyItem, agora: Date): boolean {
  if (item.nextAutoSyncAt) return false;
  if (!item.lastUpdatedAt) return true;
  // 20 h (era 26): com a checagem às 7h e às 13h, nenhum item passa de ~1 dia parado (auditoria 13/10)
  return agora.getTime() - new Date(item.lastUpdatedAt).getTime() > 20 * 3600 * 1000;
}

export function formaDoTipo(tipoPluggy: string): Forma | null {
  if (tipoPluggy === 'CREDIT') return 'Crédito';
  if (tipoPluggy === 'BANK') return 'Débito';
  return null;
}
