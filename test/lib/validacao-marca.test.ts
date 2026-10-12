import { describe, expect, it } from 'vitest';
import { validarMarca, validarValor } from '../../src/lib/validation';

describe('validarMarca', () => {
  it('✓ numa conta fixa: mês e conta', () => {
    expect(validarMarca({ mes: '2026-10', contaId: 3, responsavel: 'Ariane' }))
      .toEqual({ ok: true, data: { mes: '2026-10', contaId: 3, responsavel: 'Ariane', nome: null, valor: null, pago: true } });
  });

  it('avulsa: nome e valor, com vírgula decimal aceita', () => {
    expect(validarMarca({ mes: '2026-10', nome: ' IPVA ', valor: '261,30', responsavel: 'Ariane' }))
      .toEqual({ ok: true, data: { mes: '2026-10', contaId: null, responsavel: 'Ariane', nome: 'IPVA', valor: 261.30, pago: true } });
  });

  it('tirar a conta do mês = pago false (só para conta fixa)', () => {
    expect(validarMarca({ mes: '2026-09', contaId: 3, responsavel: 'Ariane', pago: false }))
      .toMatchObject({ ok: true, data: { contaId: 3, pago: false } });
    expect(validarMarca({ mes: '2026-09', nome: 'X', valor: 10, responsavel: 'Ariane', pago: false }).ok).toBe(false);
  });

  it('recusa mês fora do formato, pessoa inválida, valor zero/absurdo e avulsa sem nome', () => {
    expect(validarMarca({ mes: '10/2026', contaId: 3, responsavel: 'Ariane' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-13', contaId: 3, responsavel: 'Ariane' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-10', contaId: 3, responsavel: 'casal' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-10', nome: 'X', valor: 0, responsavel: 'Ariane' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-10', nome: 'X', valor: 2_000_000, responsavel: 'Ariane' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-10', nome: '', valor: 10, responsavel: 'Ariane' }).ok).toBe(false);
    expect(validarMarca({ mes: '2026-10', contaId: 0, responsavel: 'Ariane' }).ok).toBe(false);
  });
});

describe('validarValor', () => {
  it('aceita número e texto em reais; recusa zero, negativo e absurdo', () => {
    expect(validarValor(1150)).toBe(1150);
    expect(validarValor('1.150,50')).toBe(1150.5);
    expect(validarValor('0')).toBeNull();
    expect(validarValor(-5)).toBeNull();
    expect(validarValor(2_000_000)).toBeNull();
    expect(validarValor('abc')).toBeNull();
  });
});
