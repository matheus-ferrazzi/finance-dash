import { describe, expect, it } from 'vitest';
import { linkPara, mesValido, podeIrParaMesSeguinte, temSeletorDeMes } from '../../src/lib/links';

describe('linkPara', () => {
  it('cada tela tem seu caminho', () => {
    expect(linkPara('inicio')).toBe('/');
    expect(linkPara('previsao')).toBe('/previsibilidade');
    expect(linkPara('contas')).toBe('/contas');
    expect(linkPara('buscar')).toBe('/buscar');
    expect(linkPara('simulador', { resp: 'Ariane' })).toBe('/simulador?resp=Ariane');
    expect(linkPara('trilha')).toBe('/trilha');
    expect(linkPara('regras')).toBe('/regras');
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
    expect(linkPara('faturas', { cartao: 'Nubank:Ariane', ciclo: '2026-10' })).toBe('/faturas?cartao=Nubank%3AAriane&ciclo=2026-10');
    expect(linkPara('faturas', { ciclo: '2026-1' })).toBe('/faturas');
    expect(linkPara('faturas', { ciclo: 'fechada' })).toBe('/faturas?ciclo=fechada');
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

describe('revisão final: mês e filtros na navegação', () => {
  it('mesNoLimite: home e Gastos param no mês atual; Contas e Previsão vão até o seguinte; inválido vira o atual', async () => {
    const { mesNoLimite } = await import('../../src/lib/links');
    expect(mesNoLimite('2026-11', '/', '2026-10')).toBe('2026-10');
    expect(mesNoLimite('2026-11', '/contas', '2026-10')).toBe('2026-11');
    expect(mesNoLimite('2026-12', '/contas', '2026-10')).toBe('2026-11');
    expect(mesNoLimite('2026-09', '/', '2026-10')).toBe('2026-09');
    expect(mesNoLimite('2026-13', '/contas', '2026-10')).toBe('2026-10');
    expect(mesNoLimite(null, '/gastos', '2026-10')).toBe('2026-10');
  });
  it('qsNavegacao: a barra leva só pessoa e mês, não os filtros da tela', async () => {
    const { qsNavegacao } = await import('../../src/lib/links');
    expect(qsNavegacao('resp=Ariane&mes=2026-09&grupo=Mercado&cartao=X&tipo=livre&p=7d')).toBe('resp=Ariane&mes=2026-09');
    expect(qsNavegacao('grupo=Mercado')).toBe('');
  });
});

describe('seletor de mês do topo', () => {
  it('some na Previsão (as setas do detalhe navegam) e no Simulador (não tem mês); fica no resto', () => {
    expect(temSeletorDeMes('/previsibilidade')).toBe(false);
    expect(temSeletorDeMes('/simulador')).toBe(false);
    expect(temSeletorDeMes('/faturas')).toBe(false); // Onda 5: fatura é "agora"
    expect(temSeletorDeMes('/trilha')).toBe(false);
    expect(temSeletorDeMes('/regras')).toBe(false);
    expect(temSeletorDeMes('/gastos')).toBe(true);
    expect(temSeletorDeMes('/')).toBe(true);
    expect(temSeletorDeMes('/contas')).toBe(true);
  });
});

describe('filtros novos (N19)', () => {
  it('forma=debito e semana viram parâmetros; o resto do link igual', () => {
    expect(linkPara('gastos', { tipo: 'livre', forma: 'debito' }, '2026-10')).toBe('/gastos?tipo=livre&forma=debito');
    expect(linkPara('gastos', { semana: '2026-10-05' }, '2026-10')).toBe('/gastos?p=sem-2026-10-05');
  });
});
