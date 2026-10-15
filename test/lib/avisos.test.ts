import { describe, expect, it } from 'vitest';
import { avisosDoDia } from '../../src/lib/avisos';

// Onda 2 (auditoria 13/10): alerta por exceção no diário — cheque especial, juros de atraso/rotativo, orçamento
// (o Bot 06 do Telegram) e gasto fora do padrão. Valores inventados.
const vazio = { saldos: [], encargos: [], orcamento: [], foraDoPadrao: [] };

describe('avisos do dia', () => {
  it('sem nada fora do normal: lista vazia', () => {
    expect(avisosDoDia(vazio)).toEqual([]);
  });
  it('conta no negativo (cheque especial); zero ou positivo não', () => {
    expect(avisosDoDia({ ...vazio, saldos: [{ banco: 'B1', responsavel: 'Ariane', saldo: -42.5 }, { banco: 'B2', responsavel: 'Matheus', saldo: 0 }] }))
      .toEqual([{ tipo: 'negativo', banco: 'B1', responsavel: 'Ariane', valor: -42.5 }]);
  });
  it('juros/encargos de atraso somados por cartão', () => {
    expect(avisosDoDia({ ...vazio, encargos: [{ banco: 'B1', responsavel: 'Matheus', valor: 6.5 }, { banco: 'B1', responsavel: 'Matheus', valor: 12 }] }))
      .toEqual([{ tipo: 'juros', banco: 'B1', responsavel: 'Matheus', valor: 18.5 }]);
  });
  it('orçamento saiu do diário (15/10): virou o alerta na hora do Zeca, uma vez por limite no mês', () => {
    const o = (ateAnteontem: number, ateOntem: number) => ({ item: 'Delivery', emoji: '🛵', teto: 600, ateAnteontem, ateOntem });
    expect(avisosDoDia({ ...vazio, orcamento: [o(400, 500), o(400, 650)] })).toEqual([]);
  });
  it('fora do padrão: no máximo 2, maiores primeiro', () => {
    const f = (descricao: string, valor: number) => ({ descricao, valor, categoria: 'Shopping', mediana: 50 });
    expect(avisosDoDia({ ...vazio, foraDoPadrao: [f('A', 300), f('B', 900), f('C', 400)] }).map((a: any) => a.descricao)).toEqual(['B', 'C']);
  });
});
