import { describe, expect, it } from 'vitest';
import { classificar, corrigirCategoria } from '../../src/worker/classificar';

describe('corrigirCategoria', () => {
  it('PlayStation parcelado vira Gaming, avulso vira Digital services', () => {
    expect(corrigirCategoria('Shopping', 'EBN *PLAYSTATION 2/3')).toBe('Gaming');
    expect(corrigirCategoria('Shopping', 'Ebn*Playstati')).toBe('Digital services');
  });
  it('iFood vira Food delivery, salvo se já for mercado ou farmácia', () => {
    expect(corrigirCategoria('Restaurants', 'IFD*IFOOD')).toBe('Food delivery');
    expect(corrigirCategoria('Groceries', 'ifood mercado')).toBe('Groceries');
  });
  it('regras por palavra', () => {
    expect(corrigirCategoria(null, 'KAZA RIBEIRO ALUGUEL')).toBe('Housing');
    expect(corrigirCategoria(null, 'DROGASIL 123')).toBe('Pharmacy');
    expect(corrigirCategoria(null, 'AUTO POSTO X')).toBe('Gas stations');
    expect(corrigirCategoria(null, 'Disney Plus')).toBe('Digital services');
    expect(corrigirCategoria(null, 'PAGAMENTO DARF')).toBe('Taxes');
    expect(corrigirCategoria(null, 'BARBEARIA DO ZE')).toBe('Wellness');
    expect(corrigirCategoria(null, 'UBER *TRIP')).toBe('Taxi and ride-hailing');
    expect(corrigirCategoria(null, 'Eventim *Eventim 3/3')).toBe('Tickets');
  });
  it('sem regra devolve a categoria original, inclusive nula', () => {
    expect(corrigirCategoria('Shopping', 'LOJA QUALQUER')).toBe('Shopping');
    expect(corrigirCategoria(null, 'LOJA QUALQUER')).toBeNull();
  });
});

describe('classificar', () => {
  it('pagamento de fatura', () => {
    expect(classificar('Credit card payment', 'x', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
    expect(classificar('Transfers', 'NU PAGAMENTOS SA', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
    expect(classificar('Transfers', 'PAGAMENTO DE FATURA', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
    expect(classificar('Shopping', 'PGTO CARTAO CREDITO', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
  });
  it('entrada no cartão: pagamento ou estorno', () => {
    expect(classificar('Shopping', 'Pagamento recebido', false, 'Crédito', 'Ariane')).toBe('pagamento_fatura');
    expect(classificar('Shopping', 'Estorno loja', false, 'Crédito', 'Ariane')).toBe('estorno');
  });
  it('movimentos internos e aportes', () => {
    expect(classificar('Transfers', 'APLICACAO RDB', true, 'Débito', 'Matheus')).toBe('transferencia_interna');
    expect(classificar('Same person transfer', 'x', true, 'Débito', 'Matheus')).toBe('transferencia_interna');
    expect(classificar('Investments', 'x', true, 'Débito', 'Matheus')).toBe('aporte');
  });
  it('receitas e impostos de investimento', () => {
    expect(classificar('Salary', 'x', false, 'Débito', 'Matheus')).toBe('receita');
    expect(classificar('Taxes on investments', 'x', true, 'Débito', 'Matheus')).toBe('despesa');
  });
  it('transferência entre o casal pelo nome', () => {
    expect(classificar('Transfer - PIX', 'Pix enviado Ariane Bitencourt', true, 'Débito', 'Matheus')).toBe('transferencia_interna');
    expect(classificar('Transfer - PIX', 'Pix recebido Matheus J', false, 'Débito', 'Ariane')).toBe('transferencia_interna');
    expect(classificar('Transfer - PIX', 'Pix enviado Fulano', true, 'Débito', 'Matheus')).toBe('despesa');
    expect(classificar('Transfer - PIX', 'Pix recebido Fulano', false, 'Débito', 'Matheus')).toBe('receita');
  });
  it('categoria nula vira Outros e cai em estorno; resto por direção', () => {
    expect(classificar(null, 'x', true, 'Débito', 'Matheus')).toBe('estorno');
    expect(classificar('Groceries', 'x', true, 'Débito', 'Matheus')).toBe('despesa');
    expect(classificar('Groceries', 'x', false, 'Débito', 'Matheus')).toBe('estorno');
  });
});
