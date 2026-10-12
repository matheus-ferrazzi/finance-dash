// Tipos da Pluggy (só os campos que o worker usa) e do domínio.

export type Forma = 'Crédito' | 'Débito';
export type Modo = 'sombra' | 'real' | 'dry-run';

export interface Conta {
  account_id: string;
  item_id: string | null;
  banco: string;
  responsavel: string;
  forma: Forma;
  coleta_transacoes: boolean;
  coleta_saldo: boolean;
  coleta_faturas: boolean;
  coleta_investimentos: boolean;
}

export interface PluggyDocumento { type?: string | null; value?: string | null }
export interface PluggyParte { name?: string | null; documentNumber?: PluggyDocumento | null }

export interface PluggyTransacao {
  id: string;
  accountId: string;
  date: string;
  description: string | null;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  status?: string | null;
  category?: string | null;
  categoryId?: string | null;
  operationType?: string | null;
  creditCardMetadata?: {
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseDate?: string | null;
    billId?: string | null;
    billForecastDate?: string | null;
  } | null;
  merchant?: { cnpj?: string | null; cnae?: string | null } | null;
  paymentData?: { payer?: PluggyParte | null; receiver?: PluggyParte | null } | null;
}

export interface PluggyCreditData {
  creditLimit?: number | null;
  availableCreditLimit?: number | null;
  balanceDueDate?: string | null;
  balanceCloseDate?: string | null;
  minimumPayment?: number | null;
}

export interface PluggyConta {
  id: string;
  itemId: string;
  type: string;
  subtype?: string | null;
  balance?: number | null;
  updatedAt?: string | null;
  creditData?: PluggyCreditData | null;
}

export interface PluggyFatura {
  id: string;
  dueDate?: string | null;
  billClosingDate?: string | null;
  totalAmount?: number | null;
  minimumPaymentAmount?: number | null;
  financeCharges?: unknown[] | null;
  payments?: unknown[] | null;
}

export interface PluggyInvestimento {
  id: string;
  itemId: string;
  name?: string | null;
  type?: string | null;
  subtype?: string | null;
  balance?: number | null;
  value?: number | null;
  quantity?: number | null;
  amount?: number | null;
  amountOriginal?: number | null;
  amountProfit?: number | null;
  annualRate?: number | null;
  date?: string | null;
  status?: string | null;
}

export interface PluggyItem {
  id: string;
  status?: string | null;
  executionStatus?: string | null;
  lastUpdatedAt?: string | null;
  nextAutoSyncAt?: string | null;
  consentExpiresAt?: string | null;
}

export interface Lancamento {
  id_transacao: string;
  data_lancamento: string;
  valor: number;
  tipo_movimento: 'Saída' | 'Entrada';
  classe: string;
  descricao: string;
  categoria: string;
  forma_pagamento: string;
  banco: string;
  responsavel: string;
  status_pluggy: string | null;
  account_id: string;
  parcela_numero: number | null;
  parcela_total: number | null;
  data_compra: string | null;
  fatura_id: string | null;
  fatura_prevista: string | null;
  contraparte_nome: string | null;
  contraparte_doc: string | null;
  loja_cnpj: string | null;
  loja_cnae: string | null;
  categoria_id: string | null;
  tipo_operacao: string | null;
  transferencia_casal: boolean;
}

export interface FaturaAtual {
  id_conta: string;
  banco: string;
  responsavel: string;
  limite_total: number;
  limite_disponivel: number;
  valor_fatura_atual: number;
  data_fechamento: string | null;
  data_vencimento: string | null;
  pagamento_minimo: number;
  atualizado_em: string;
}

export interface FaturaHistorico {
  id: string;
  account_id: string;
  vencimento: string | null;
  total: number | null;
  minimo: number | null;
  encargos: unknown[];
  pagamentos: unknown[];
}

export interface Saldo {
  id_conta: string;
  banco: string;
  responsavel: string;
  tipo: string | null;
  saldo: number;
  atualizado_pluggy: string | null;
}

export interface Investimento {
  id_investimento: string;
  item_id: string;
  nome: string;
  tipo: string;
  subtipo: string | null;
  valor_investido: number;
  valor_atual: number;
  lucro_acumulado: number;
  quantidade: number | null;
  rentabilidade_anual: number | null;
  data_vencimento: string | null;
  banco: string;
  responsavel: string;
  status: string | null;
  atualizado_em: string;
}

export interface Execucao {
  tarefa: string;
  modo: Modo;
  inicio: string;
  fim: string;
  ok: boolean;
  contagens: Record<string, unknown>;
  erro: string | null;
}
