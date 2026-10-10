import { describe, expect, it } from 'vitest';
import { linkPara, mesValido, podeIrParaMesSeguinte } from '../../src/lib/links';

describe('linkPara', () => {
  it('cada tela tem seu caminho', () => {
    expect(linkPara('inicio')).toBe('/');
    expect(linkPara('previsao')).toBe('/previsibilidade');
    expect(linkPara('contas')).toBe('/contas');
    expect(linkPara('buscar')).toBe('/buscar');
  });
  it('omite padrão: casal e mês atual', () => {
    expect(linkPara('contas', { resp: 'casal', mes: '2026-10' }, '2026-10')).toBe('/contas');
    expect(linkPara('contas', { resp: 'Ariane', mes: '2026-09' }, '2026-10')).toBe('/contas?resp=Ariane&mes=2026-09');
  });
  it('codifica acento e espaço', () => {
    expect(linkPara('gastos', { grupo: 'Comer fora' })).toBe('/gastos?grupo=Comer+fora');
    expect(linkPara('gastos', { grupo: 'Dívida e seguro' })).toBe('/gastos?grupo=D%C3%ADvida+e+seguro');
  });
  it('ordem fixa dos parâmetros e só os conhecidos', () => {
    expect(linkPara('faturas', { cartao: 'Nubank', resp: 'Matheus', valor: 10 } as any)).toBe('/faturas?resp=Matheus&cartao=Nubank');
  });
  it('mês inválido é ignorado', () => {
    expect(linkPara('contas', { mes: '2026-13' }, '2026-10')).toBe('/contas');
  });
});

describe('mês', () => {
  it('mesValido aceita AAAA-MM com mês 01..12', () => {
    expect(mesValido('2026-09')).toBe('2026-09');
    expect(mesValido('2026-13')).toBeNull();
    expect(mesValido('09/2026')).toBeNull();
    expect(mesValido(undefined)).toBeNull();
  });
  it('mês seguinte só em Contas e Previsão', () => {
    expect(podeIrParaMesSeguinte('/contas')).toBe(true);
    expect(podeIrParaMesSeguinte('/previsibilidade')).toBe(true);
    expect(podeIrParaMesSeguinte('/')).toBe(false);
    expect(podeIrParaMesSeguinte('/gastos')).toBe(false);
  });
});
