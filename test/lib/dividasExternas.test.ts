import { describe, expect, it } from 'vitest';
import { validarDividaExterna } from '../../src/lib/dividasExternas';

// 13/11 (plano realista): dívidas fora do banco, para a fase "nome limpo". Valores inventados.
describe('validarDividaExterna', () => {
  const ok = { credor: ' Banco X ', responsavel: 'Matheus', valor: '1.234,56', negativada: true, observacao: ' cartão antigo ' };

  it('aceita o cadastro, apara os textos e lê o valor em formato brasileiro', () => {
    expect(validarDividaExterna(ok)).toEqual({ ok: true, data: { credor: 'Banco X', responsavel: 'Matheus', valor: 1234.56, negativada: true, observacao: 'cartão antigo' } });
  });
  it('negativada vem marcada por padrão; observação vazia vira nula', () => {
    expect(validarDividaExterna({ credor: 'Loja', responsavel: 'Ariane', valor: 50 })).toEqual({ ok: true, data: { credor: 'Loja', responsavel: 'Ariane', valor: 50, negativada: true, observacao: null } });
  });
  it('recusa: sem credor, pessoa desconhecida, valor zero, negativo ou que não é número, texto longo demais', () => {
    expect(validarDividaExterna({ ...ok, credor: '  ' })).toEqual({ ok: false, erro: 'Diga para quem é a dívida.' });
    expect(validarDividaExterna({ ...ok, responsavel: 'casal' })).toEqual({ ok: false, erro: 'A dívida é do Matheus ou da Ariane.' });
    for (const valor of [0, -5, 'abc', '', null]) expect(validarDividaExterna({ ...ok, valor }), String(valor)).toEqual({ ok: false, erro: 'Valor inválido.' });
    expect(validarDividaExterna({ ...ok, credor: 'x'.repeat(81) })).toEqual({ ok: false, erro: 'Nome do credor muito longo.' });
    expect(validarDividaExterna(null)).toEqual({ ok: false, erro: 'Diga para quem é a dívida.' });
  });
});
