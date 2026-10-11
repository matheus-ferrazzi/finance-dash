import { describe, expect, it } from 'vitest';
import { validarRegra } from '../../src/lib/validation';

describe('validar regra de categoria', () => {
  it('tipo, lançamento e categoria obrigatórios e válidos', () => {
    expect(validarRegra({ tipo: 'x', idTransacao: 't', categoria: 'Groceries' })).toEqual({ ok: false, erro: 'Tipo de regra inválido.' });
    expect(validarRegra({ tipo: 'lancamento', idTransacao: '', categoria: 'Groceries' })).toEqual({ ok: false, erro: 'Lançamento não informado.' });
    expect(validarRegra({ tipo: 'lancamento', idTransacao: 't', categoria: 'Inventada' })).toEqual({ ok: false, erro: 'Categoria desconhecida.' });
    expect(validarRegra(null)).toEqual({ ok: false, erro: 'Tipo de regra inválido.' });
  });
  it('texto: normaliza e exige 3 letras', () => {
    expect(validarRegra({ tipo: 'texto', idTransacao: 't', texto: ' a b ', categoria: 'Groceries' })).toEqual({ ok: false, erro: 'O texto precisa de pelo menos 3 letras.' });
    expect(validarRegra({ tipo: 'texto', idTransacao: 't', texto: 'pão  doce', categoria: 'Groceries' })).toEqual({ ok: true, data: { tipo: 'texto', idTransacao: 't', texto: 'PAO DOCE', categoria: 'Groceries' } });
  });
});
