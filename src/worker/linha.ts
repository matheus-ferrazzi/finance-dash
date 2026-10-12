import { corrigirCategoria } from './classificar';
import type { Conta, Lancamento, PluggyTransacao } from './tipos';
import { recalcular, type RegraPainel } from '../lib/categoriaPainel';

export function soDigitos(v: string | null | undefined): string | null {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length ? d : null;
}

/**
 * Uma transação da Pluggy vira uma linha de financas_lancamentos.
 * Os 11 primeiros campos seguem exatamente o Finance 2.0 (paridade);
 * o resto são os campos que o n8n descartava.
 */
export function montarLinha(t: PluggyTransacao, conta: Conta, docsCasal: ReadonlySet<string>, regras: readonly RegraPainel[] = []): Lancamento {
  const saida = t.type === 'DEBIT';
  const catCorr = corrigirCategoria(t.category, t.description);
  const cc = t.creditCardMetadata ?? null;
  const pd = t.paymentData ?? null;
  const contra = (saida ? pd?.receiver : pd?.payer) ?? null;
  const docPagador = soDigitos(pd?.payer?.documentNumber?.value);
  const docRecebedor = soDigitos(pd?.receiver?.documentNumber?.value);
  // F4: regras do painel mandam sobre a categoria do banco; a classe sai da categoria efetiva
  // (sem regra, igual a antes: classificar já trata categoria vazia como 'Outros')
  const categoriaBanco = catCorr || 'Outros';
  const efetiva = recalcular({
    id: t.id, descricao: t.description ?? '', contraparteDoc: soDigitos(contra?.documentNumber?.value),
    categoriaBanco, saida, forma: conta.forma, responsavel: conta.responsavel,
  }, regras);

  return {
    id_transacao: t.id,
    data_lancamento: t.date.split('T')[0],
    valor: Math.abs(t.amount),
    tipo_movimento: saida ? 'Saída' : 'Entrada',
    classe: efetiva.classe,
    descricao: t.description ?? '',
    categoria: efetiva.categoria,
    forma_pagamento: conta.forma,
    banco: conta.banco,
    responsavel: conta.responsavel,
    status_pluggy: t.status ?? null,
    account_id: t.accountId,
    parcela_numero: cc?.installmentNumber ?? null,
    parcela_total: cc?.totalInstallments ?? null,
    data_compra: cc?.purchaseDate ? cc.purchaseDate.slice(0, 10) : null,
    fatura_id: cc?.billId ?? null,
    fatura_prevista: cc?.billForecastDate ?? null,
    contraparte_nome: contra?.name ?? null,
    contraparte_doc: soDigitos(contra?.documentNumber?.value),
    loja_cnpj: soDigitos(t.merchant?.cnpj),
    loja_cnae: t.merchant?.cnae ?? null,
    categoria_id: t.categoryId ?? null,
    tipo_operacao: t.operationType ?? null,
    // dinheiro que só trocou de conta dentro do casal (inclui entre contas da mesma pessoa)
    transferencia_casal:
      docPagador !== null && docRecebedor !== null && docsCasal.has(docPagador) && docsCasal.has(docRecebedor),
    categoria_banco: categoriaBanco,
  };
}
