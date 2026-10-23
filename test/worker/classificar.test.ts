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

describe('consórcio (B, 10/10/2026)', () => {
  const boleto = 'PAGAMENTO DE BOLETO OUTROS BANCOS   BRADESCO ADMINISTRADORA D';
  it('boleto da administradora de consórcio é despesa, não pagamento de fatura', () => {
    expect(classificar('Transfer - Bank Slip', boleto, true, 'Débito', 'Ariane')).toBe('despesa');
  });
  it('categoria Consortium', () => {
    expect(corrigirCategoria('Transfer - Bank Slip', boleto)).toBe('Consortium');
    expect(corrigirCategoria(null, 'PGTO CONSORCIO GRUPO 123')).toBe('Consortium');
  });
  it('fatura do cartão Bradesco continua pagamento de fatura', () => {
    expect(classificar('Credit card payment', 'GASTOS CARTAO DE CREDITO - DOCTO: 1', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
  });
});

describe('fatura do cartão paga por PIX QR Code (B, 10/10/2026)', () => {
  it('PIX QR para o banco que emite o cartão é pagamento de fatura, não despesa', () => {
    expect(classificar('Transfer - PIX', 'Pagamento de Pix QR Code BANCO SANTANDER (BRASIL) S.A.', true, 'Débito', 'Matheus')).toBe('pagamento_fatura');
  });
  it('PIX QR para loja continua despesa', () => {
    expect(classificar('Transfer - PIX', 'Pagamento de Pix QR Code LOJA EXEMPLO LTDA', true, 'Débito', 'Matheus')).toBe('despesa');
  });
});

// auditoria 17/10 (L6, L8), 22/10
describe('L6: só o primeiro nome do parceiro faz a transferência ser do casal', () => {
  it('família com o sobrenome dele não é conta do casal: Pix para a irmã é despesa', () => {
    expect(classificar('Transfers', 'Transferência enviada|Fulana Jacob Ferrazzi', true, 'Débito', 'Ariane')).toBe('despesa');
    expect(classificar('Transfer - PIX', 'Pix enviado Beltrano Bitencourt', true, 'Débito', 'Matheus')).toBe('despesa');
    // o parceiro continua sendo do casal
    expect(classificar('Transfer - PIX', 'Pix recebido Matheus J', false, 'Débito', 'Ariane')).toBe('transferencia_interna');
    expect(classificar('Transfer - PIX', 'Pix enviado Ariane Bitencourt', true, 'Débito', 'Matheus')).toBe('transferencia_interna');
  });
});
describe('L8: Pix devolvido é estorno, não receita', () => {
  it('entrada com devolvido/devolução no Pix abate o gasto', () => {
    expect(classificar('Transfer - PIX', 'PIX DEVOLVIDO   LOJA EXEMPLO LTDA', false, 'Débito', 'Ariane')).toBe('estorno');
    expect(classificar('Transfers', 'DEVOLUCAO PIX LOJA', false, 'Débito', 'Matheus')).toBe('estorno');
    expect(classificar('Transfer - PIX', 'Devolução de Pix', false, 'Débito', 'Matheus')).toBe('estorno');
    // saída com "devolvido" (devolver dinheiro a alguém) continua despesa
    expect(classificar('Transfer - PIX', 'PIX DEVOLVIDO A FULANO', true, 'Débito', 'Matheus')).toBe('despesa');
  });
});
