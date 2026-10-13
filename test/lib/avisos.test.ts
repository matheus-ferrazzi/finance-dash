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
  it('orçamento: avisa só no dia em que cruza 80% ou 100% (o maior cruzado)', () => {
    const o = (ateAnteontem: number, ateOntem: number) => ({ item: 'Delivery', emoji: '🛵', teto: 600, ateAnteontem, ateOntem });
    expect(avisosDoDia({ ...vazio, orcamento: [o(400, 500)] })).toEqual([{ tipo: 'orcamento', item: 'Delivery', emoji: '🛵', pct: 80, gasto: 500, teto: 600 }]);
    expect(avisosDoDia({ ...vazio, orcamento: [o(400, 650)] })).toEqual([{ tipo: 'orcamento', item: 'Delivery', emoji: '🛵', pct: 100, gasto: 650, teto: 600 }]);
    expect(avisosDoDia({ ...vazio, orcamento: [o(500, 550)] })).toEqual([]); // já estava acima de 80%: não repete
  });
  it('fora do padrão: no máximo 2, maiores primeiro', () => {
    const f = (descricao: string, valor: number) => ({ descricao, valor, categoria: 'Shopping', mediana: 50 });
    expect(avisosDoDia({ ...vazio, foraDoPadrao: [f('A', 300), f('B', 900), f('C', 400)] }).map((a: any) => a.descricao)).toEqual(['B', 'C']);
  });
});
