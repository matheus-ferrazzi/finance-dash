import { describe, expect, it } from 'vitest';
import { montarLinha, soDigitos } from '../../src/worker/linha';
import type { Conta, PluggyTransacao } from '../../src/worker/tipos';

const conta: Conta = {
  account_id: 'acc-1', item_id: 'item-1', banco: 'Nubank', responsavel: 'Matheus', forma: 'Crédito',
  coleta_transacoes: true, coleta_saldo: false, coleta_faturas: true, coleta_investimentos: false,
};

function tx(p: Partial<PluggyTransacao> = {}): PluggyTransacao {
  return { id: 't1', accountId: 'acc-1', date: '2026-09-10T03:00:00.000Z', description: 'LOJA X 2/5', amount: -120.5, type: 'DEBIT', status: 'POSTED', category: 'Shopping', ...p };
}

describe('soDigitos', () => {
  it('limpa pontuação e devolve null quando vazio', () => {
    expect(soDigitos('123.456.789-00')).toBe('12345678900');
    expect(soDigitos('')).toBeNull();
    expect(soDigitos(null)).toBeNull();
  });
});

describe('montarLinha', () => {
  it('17/10 (auditoria W1): data pelo dia de São Paulo — compra às 22h41 de 15/10 (01:41Z de 16/10) fica em 15/10', () => {
    expect(montarLinha(tx({ date: '2026-10-16T01:41:18.520Z' }), conta, new Set()).data_lancamento).toBe('2026-10-15');
    // virada de mês: 31/03 22:41 em SP não pode cair em abril
    expect(montarLinha(tx({ date: '2026-04-01T01:41:27.024Z' }), conta, new Set()).data_lancamento).toBe('2026-03-31');
    // "só a data" chega como 03:00Z (meia-noite em SP): mesmo dia
    expect(montarLinha(tx({ date: '2026-09-10T03:00:00.000Z' }), conta, new Set()).data_lancamento).toBe('2026-09-10');
    expect(montarLinha(tx({ date: '2026-09-10' }), conta, new Set()).data_lancamento).toBe('2026-09-10');
    // data da compra parcelada: mesma regra
    const cc = { creditCardMetadata: { purchaseDate: '2026-08-02T01:50:15.000Z', installmentNumber: 2, totalInstallments: 5 } } as any;
    expect(montarLinha(tx(cc), conta, new Set()).data_compra).toBe('2026-08-01');
    // meia-noite UTC exata também é "só a data" (parcela futura do Nubank: 00:00:00.001Z, mesmo dia do date 03:00Z)
    const futura = { creditCardMetadata: { purchaseDate: '2026-11-09T00:00:00.001Z', installmentNumber: 2, totalInstallments: 2 } } as any;
    expect(montarLinha(tx({ ...futura, date: '2026-11-09T03:00:00.000Z' }), conta, new Set()).data_compra).toBe('2026-11-09');
  });
  it('campos de paridade iguais ao Finance 2.0', () => {
    const l = montarLinha(tx(), conta, new Set());
    expect(l).toMatchObject({
      id_transacao: 't1', data_lancamento: '2026-09-10', valor: 120.5, tipo_movimento: 'Saída',
      classe: 'despesa', descricao: 'LOJA X 2/5', categoria: 'Shopping', forma_pagamento: 'Crédito',
      banco: 'Nubank', responsavel: 'Matheus', status_pluggy: 'POSTED', account_id: 'acc-1',
    });
  });
  it('categoria nula vira Outros; descrição nula vira vazia', () => {
    const l = montarLinha(tx({ category: null, description: null }), conta, new Set());
    expect(l.categoria).toBe('Outros');
    expect(l.descricao).toBe('');
  });
  it('campos novos do cartão e da loja', () => {
    const l = montarLinha(tx({
      categoryId: '05070000', operationType: 'CARTAO',
      creditCardMetadata: { installmentNumber: 2, totalInstallments: 5, purchaseDate: '2026-07-10T00:00:00Z', billId: 'b1', billForecastDate: '2026-10' },
      merchant: { cnpj: '12.345.678/0001-90', cnae: '4712100' },
    }), conta, new Set());
    expect(l).toMatchObject({
      parcela_numero: 2, parcela_total: 5, data_compra: '2026-07-10', fatura_id: 'b1', fatura_prevista: '2026-10',
      loja_cnpj: '12345678000190', loja_cnae: '4712100', categoria_id: '05070000', tipo_operacao: 'CARTAO',
    });
  });
  it('contraparte é o recebedor na saída e o pagador na entrada', () => {
    const paymentData = {
      payer: { name: 'Pagador', documentNumber: { value: '111.111.111-11' } },
      receiver: { name: 'Recebedor', documentNumber: { value: '222.222.222-22' } },
    };
    const saida = montarLinha(tx({ paymentData }), conta, new Set());
    expect([saida.contraparte_nome, saida.contraparte_doc]).toEqual(['Recebedor', '22222222222']);
    const entrada = montarLinha(tx({ paymentData, type: 'CREDIT', amount: 50 }), conta, new Set());
    expect([entrada.contraparte_nome, entrada.contraparte_doc]).toEqual(['Pagador', '11111111111']);
  });
  it('transferencia_casal só quando os dois documentos são dos titulares', () => {
    const paymentData = {
      payer: { documentNumber: { value: '111.111.111-11' } },
      receiver: { documentNumber: { value: '222.222.222-22' } },
    };
    const casal = new Set(['11111111111', '22222222222']);
    expect(montarLinha(tx({ paymentData }), conta, casal).transferencia_casal).toBe(true);
    expect(montarLinha(tx({ paymentData }), conta, new Set(['11111111111'])).transferencia_casal).toBe(false);
    expect(montarLinha(tx(), conta, casal).transferencia_casal).toBe(false);
  });
});

describe('montarLinha com regras do painel (F4)', () => {
  it('regra do painel: grava a categoria efetiva e a classe dela; categoria_banco guarda a do banco', () => {
    const l = montarLinha(tx({ category: 'Shopping', description: 'LOJA DO BICHO' }), { ...conta, forma: 'Débito' }, new Set(), [{ id: 1, tipo: 'texto', chave: 'BICHO', categoria: 'Investments' }]);
    expect(l.categoria_banco).toBe('Shopping');
    expect(l.categoria).toBe('Investments');
    expect(l.classe).toBe('aporte');
  });
  it('sem regra do painel: categoria = categoria_banco (nada muda na ingestão)', () => {
    const l = montarLinha(tx({ category: 'Shopping', description: 'LOJA X' }), conta, new Set());
    expect(l.categoria).toBe('Shopping');
    expect(l.categoria_banco).toBe('Shopping');
  });
});
