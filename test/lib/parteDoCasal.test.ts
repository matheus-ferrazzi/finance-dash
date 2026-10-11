import { describe, expect, it } from 'vitest';
import { aplicarParteDoCasal, type CompromissoManual } from '../../src/lib/previsao';

const c = (id: number, categoria: string, valor: number, responsavel = 'casal'): CompromissoManual =>
  ({ id, nome: `c${id}`, categoria, valor, responsavel, dataInicio: '2026-01-01', mesesTotais: null, observacao: null, dataFim: null });

describe('parte do casal na visão individual', () => {
  const lista = [c(1, 'Housing', 2000), c(2, 'Water', 100), c(3, 'Telecommunications', 300), c(4, 'Gym', 80, 'Ariane')];
  const partes = { Housing: 0, Water: 1, Telecommunications: 0.5 };

  it('compromisso do casal entra com a parte que a pessoa paga da categoria; o da própria pessoa entra inteiro', () => {
    const r = aplicarParteDoCasal(lista, 'Ariane', partes);
    expect(r.map((x) => [x.categoria, x.valor, x.parte])).toEqual([
      ['Housing', 0, 0], ['Water', 100, 1], ['Telecommunications', 150, 0.5], ['Gym', 80, undefined],
    ]);
  });
  it('categoria sem histórico de ninguém: meio a meio', () => {
    expect(aplicarParteDoCasal([c(5, 'Gas', 90)], 'Matheus', {})[0]).toMatchObject({ valor: 45, parte: 0.5 });
  });
  it('visão do casal não muda nada', () => {
    expect(aplicarParteDoCasal(lista, 'casal', partes)).toEqual(lista);
  });
  it('não altera a lista original (o cadastro continua com o valor cheio)', () => {
    aplicarParteDoCasal(lista, 'Ariane', partes);
    expect(lista[0].valor).toBe(2000);
  });
});
