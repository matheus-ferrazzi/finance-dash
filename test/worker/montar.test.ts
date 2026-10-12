import { describe, expect, it } from 'vitest';
import {
  formaDoTipo, montarFatura, montarHistorico, montarInvestimento, montarSaldo, precisaPedirAtualizacao,
} from '../../src/worker/montar';
import type { Conta } from '../../src/worker/tipos';

const conta: Conta = {
  account_id: 'acc', item_id: 'item', banco: 'Nubank', responsavel: 'Ariane', forma: 'Crédito',
  coleta_transacoes: true, coleta_saldo: false, coleta_faturas: true, coleta_investimentos: false,
};
const AGORA = '2026-10-09T12:00:00.000Z';

describe('montarFatura (porta do workflow de faturas)', () => {
  it('pega a fatura de vencimento mais recente e o saldo da conta', () => {
    const f = montarFatura(
      { id: 'acc', itemId: 'item', type: 'CREDIT', balance: -1234.5, creditData: { creditLimit: 5000, availableCreditLimit: 3000 } },
      [
        { id: 'b1', dueDate: '2026-09-10T00:00:00Z', minimumPaymentAmount: 100 },
        { id: 'b2', dueDate: '2026-10-10T00:00:00Z', billClosingDate: '2026-10-03', minimumPaymentAmount: 200 },
      ],
      conta, AGORA,
    );
    expect(f).toEqual({
      id_conta: 'acc', banco: 'Nubank', responsavel: 'Ariane', limite_total: 5000, limite_disponivel: 3000,
      valor_fatura_atual: 1234.5, data_fechamento: '2026-10-03', data_vencimento: '2026-10-10',
      pagamento_minimo: 200, atualizado_em: AGORA,
    });
  });
  it('sem saldo usa o limite usado; sem fatura usa creditData', () => {
    const f = montarFatura(
      { id: 'acc', itemId: 'item', type: 'CREDIT', balance: 0, creditData: { creditLimit: 1000, availableCreditLimit: 899.99, balanceDueDate: '2026-11-05', minimumPayment: 50 } },
      [], conta, AGORA,
    );
    expect([f.valor_fatura_atual, f.data_vencimento, f.data_fechamento, f.pagamento_minimo]).toEqual([100.01, '2026-11-05', null, 50]);
  });
});

describe('montarHistorico', () => {
  it('todas as faturas, com encargos e pagamentos', () => {
    expect(montarHistorico('acc', [{ id: 'b1', dueDate: '2026-09-10T00:00:00Z', totalAmount: 500, financeCharges: [{ type: 'IOF' }] }]))
      .toEqual([{ id: 'b1', account_id: 'acc', vencimento: '2026-09-10', total: 500, minimo: null, encargos: [{ type: 'IOF' }], pagamentos: [] }]);
  });
});

describe('montarSaldo', () => {
  it('porta do workflow de saldos', () => {
    expect(montarSaldo({ id: 'acc', itemId: 'i', type: 'BANK', subtype: 'CHECKING_ACCOUNT', balance: 42.1, updatedAt: '2026-10-09T01:00:00Z' }, { ...conta, forma: 'Débito' }))
      .toEqual({ id_conta: 'acc', banco: 'Nubank', responsavel: 'Ariane', tipo: 'CHECKING_ACCOUNT', saldo: 42.1, atualizado_pluggy: '2026-10-09T01:00:00Z' });
  });
});

describe('montarInvestimento (porta do workflow de investimentos)', () => {
  it('valor atual = balance; investido = amountOriginal; lucro só o informado', () => {
    const i = montarInvestimento({ id: 'inv', itemId: 'item', name: 'CDB', type: 'FIXED_INCOME', balance: 1100, amountOriginal: 1000, amountProfit: 100, date: '2027-01-01T00:00:00Z' }, { banco: 'Inter', responsavel: 'Matheus' }, AGORA);
    expect(i).toMatchObject({ valor_atual: 1100, valor_investido: 1000, lucro_acumulado: 100, data_vencimento: '2027-01-01', nome: 'CDB' });
  });
  it('sem balance usa value * quantity; sem lucro informado é 0', () => {
    const i = montarInvestimento({ id: 'inv', itemId: 'item', value: 10, quantity: 3 }, { banco: 'Inter', responsavel: 'Matheus' }, AGORA);
    expect(i).toMatchObject({ valor_atual: 30, valor_investido: 30, lucro_acumulado: 0, nome: 'Sem nome', tipo: 'Desconhecido' });
  });
});

describe('precisaPedirAtualizacao', () => {
  const agora = new Date('2026-10-09T16:00:00Z');
  it('só item sem auto-sync e parado há mais de 26 h', () => {
    expect(precisaPedirAtualizacao({ id: 'i', nextAutoSyncAt: null, lastUpdatedAt: '2026-09-16T00:11:00Z' }, agora)).toBe(true);
    expect(precisaPedirAtualizacao({ id: 'i', nextAutoSyncAt: null, lastUpdatedAt: '2026-10-09T00:00:00Z' }, agora)).toBe(false);
    expect(precisaPedirAtualizacao({ id: 'i', nextAutoSyncAt: '2026-10-10T00:00:00Z', lastUpdatedAt: '2026-09-01T00:00:00Z' }, agora)).toBe(false);
  });
});

describe('formaDoTipo', () => {
  it('CREDIT → Crédito, BANK → Débito, resto → null', () => {
    expect([formaDoTipo('CREDIT'), formaDoTipo('BANK'), formaDoTipo('INVESTMENT')]).toEqual(['Crédito', 'Débito', null]);
  });
});
