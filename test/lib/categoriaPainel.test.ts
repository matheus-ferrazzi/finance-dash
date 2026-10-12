import { describe, expect, it } from 'vitest';
import { categoriaEfetiva, nomeSemDocumento, normalizarTexto, recalcular, sugerirTexto, type RegraPainel } from '../../src/lib/categoriaPainel';

const l = { id: 't1', descricao: 'PIX Padaria Pão Doce 12/03', contraparteDoc: '11122233344', categoriaBanco: 'Shopping', saida: true, forma: 'Débito', responsavel: 'Ariane' };
const R = (id: number, tipo: RegraPainel['tipo'], chave: string, categoria: string): RegraPainel => ({ id, tipo, chave, categoria });

describe('texto da regra', () => {
  it('normaliza acento, caixa e espaços; a sugestão tira números, * e /', () => {
    expect(normalizarTexto('  Pão   doce ')).toBe('PAO DOCE');
    expect(sugerirTexto('IFD*Restaurante 123/45')).toBe('IFD RESTAURANTE');
  });
});

describe('precedência', () => {
  it('só este > pessoa > texto > banco', () => {
    const todas = [R(1, 'texto', 'PADARIA', 'Groceries'), R(2, 'doc', '11122233344', 'Eating out'), R(3, 'lancamento', 't1', 'Gifts')];
    expect(categoriaEfetiva(l, todas)).toEqual({ categoria: 'Gifts', origem: 'lancamento' });
    expect(categoriaEfetiva(l, todas.slice(0, 2))).toEqual({ categoria: 'Eating out', origem: 'doc' });
    expect(categoriaEfetiva(l, todas.slice(0, 1))).toEqual({ categoria: 'Groceries', origem: 'texto' });
    expect(categoriaEfetiva(l, [])).toEqual({ categoria: 'Shopping', origem: 'banco' });
  });
  it('texto: o mais longo ganha; empate de tamanho, a regra mais nova (id maior); acento não importa', () => {
    expect(categoriaEfetiva(l, [R(1, 'texto', 'PADARIA', 'Groceries'), R(2, 'texto', 'PADARIA PAO', 'Eating out')]).categoria).toBe('Eating out');
    expect(categoriaEfetiva(l, [R(9, 'texto', 'PADARIA', 'Groceries'), R(5, 'texto', 'PAO DOC', 'Eating out')]).categoria).toBe('Groceries');
  });
  it('a regra do painel manda mesmo com categoria do banco não vaga; documento vazio não casa', () => {
    expect(categoriaEfetiva({ ...l, categoriaBanco: 'Groceries' }, [R(1, 'texto', 'PADARIA', 'Pets')]).categoria).toBe('Pets');
    expect(categoriaEfetiva({ ...l, contraparteDoc: null }, [R(1, 'doc', '', 'Pets')]).origem).toBe('banco');
  });
});

describe('classe recalculada', () => {
  it('virar Investimentos muda a classe para aplicação; sem regra fica a classe da categoria do banco', () => {
    expect(recalcular(l, [R(1, 'lancamento', 't1', 'Investments')])).toEqual({ categoria: 'Investments', classe: 'aporte', origem: 'lancamento' });
    expect(recalcular(l, []).classe).toBe('despesa');
  });
});

describe('nome da contraparte sem documento', () => {
  it('tira CPF/CNPJ (com ou sem pontuação) do nome — razão social de MEI traz o CPF', () => {
    expect(nomeSemDocumento('FULANO DE TAL 12345678901')).toBe('FULANO DE TAL');
    expect(nomeSemDocumento('LOJA X LTDA 12.345.678/0001-90')).toBe('LOJA X LTDA');
    expect(nomeSemDocumento('123.456.789-01 FULANO')).toBe('FULANO');
    expect(nomeSemDocumento('PADARIA 24H')).toBe('PADARIA 24H');
    expect(nomeSemDocumento(null)).toBeNull();
    expect(nomeSemDocumento('12345678901')).toBeNull();
  });
});

