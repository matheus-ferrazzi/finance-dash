import { describe, expect, it } from 'vitest';
import { situacaoFatura, totalAPagar } from '../../src/lib/faturas';

// auditoria 13/10 (N4): a fatura é a do histórico (a última fechada), não o saldo devedor do cartão
describe('situação da última fatura fechada', () => {
  it('paga inteira (com centavos de folga) ou fatura zerada: paga, nada falta', () => {
    expect(situacaoFatura({ total: 170, pago: 170, parcelado: 0, vencimento: '2026-10-05' }, '2026-10-13')).toEqual({ situacao: 'paga', falta: 0 });
    expect(situacaoFatura({ total: 0, pago: 0, parcelado: 0, vencimento: '2026-11-10' }, '2026-10-13')).toEqual({ situacao: 'paga', falta: 0 });
    expect(situacaoFatura({ total: 100.004, pago: 100, parcelado: 0, vencimento: '2026-10-05' }, '2026-10-13').situacao).toBe('paga');
  });
  it('vence hoje ou depois e não foi paga inteira: a vencer, falta o que não foi pago', () => {
    expect(situacaoFatura({ total: 800, pago: 300, parcelado: 0, vencimento: '2026-10-13' }, '2026-10-13')).toEqual({ situacao: 'a_vencer', falta: 500 });
  });
  it('venceu e o resto virou parcelamento: parcelada, nada a pagar agora (as parcelas vêm nas próximas)', () => {
    expect(situacaoFatura({ total: 480, pago: 200, parcelado: 280, vencimento: '2026-10-02' }, '2026-10-13')).toEqual({ situacao: 'parcelada', falta: 0 });
  });
  it('venceu sem pagar tudo e sem parcelamento: atrasada (rotativo), falta o resto', () => {
    expect(situacaoFatura({ total: 300, pago: 100, parcelado: 0, vencimento: '2026-10-02' }, '2026-10-13')).toEqual({ situacao: 'atrasada', falta: 200 });
  });
});

describe('total a pagar', () => {
  it('soma o que falta das a vencer e das atrasadas; parcelada e paga não entram', () => {
    expect(totalAPagar([
      { situacao: 'a_vencer', falta: 500 }, { situacao: 'atrasada', falta: 200 },
      { situacao: 'parcelada', falta: 0 }, { situacao: 'paga', falta: 0 },
    ])).toBe(700);
  });
});
