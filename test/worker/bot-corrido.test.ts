import { describe, expect, it } from 'vitest';
import { explicacaoCorrida, frasePuxou } from '../../src/worker/bot/corrido';
import { explicacaoDaConta, type ContaDoMes } from '../../src/lib/previsao';

const conta: ContaDoMes = {
  saldoNasContas: 2000, aindaEntra: 5000, saiContas: 3000, saiCasa: 100, saiFaturas: 3000, sobraDiaADia: 900,
  diasContandoHoje: 25, dapraGastar: 36, gastoDoRitmo: 500, diasDoRitmo: 5, ritmoPorDia: 100, gastoNessePasso: 2500,
  nessePassoFechaEm: -1600, diaADiaPelaMedia: 3000, pelaMediaFechaEm: -2100,
};
const nbsp = (t: string) => t.replace(/ /g, ' ');

describe('explicação do diário em texto corrido', () => {
  it('sem 👉 nem rótulos; dois parágrafos (a sobra e para onde o mês vai) e o que puxou por último', () => {
    const puxou = frasePuxou({ linhas: [{ chave: 'LOJA A', valor: 300 }, { chave: 'LOJA B', valor: 120 }, { chave: 'LOJA C', valor: 80 }] });
    const t = nbsp(explicacaoCorrida(explicacaoDaConta(conta), puxou));
    expect(t).toBe([
      'Nas contas vocês têm R$ 2.000,00 e ainda entram R$ 5.000,00 este mês. Ainda saem R$ 3.000,00 de contas fixas, R$ 100,00 da casa e R$ 3.000,00 de faturas. '
        + 'Então sobram *R$ 900,00* para o dia a dia até o fim do mês. Divididos por 25 dias (contando hoje), dá R$ 36,00 por dia.',
      'Até agora o dia a dia (débito e PIX, fora casa e fixos) somou R$ 500,00 em 5 dias, R$ 100,00 por dia. '
        + 'Se continuar nesse passo (R$ 100,00 por dia), são R$ 2.500,00 em 25 dias (contando hoje) e o mês fecha em -R$ 1.600,00. '
        + 'Pelo jeito que vocês costumam gastar, o resto do mês ainda leva R$ 3.000,00 no dia a dia, e aí fecha em -R$ 2.100,00.',
      'O que mais pesou no dia a dia até agora: LOJA A (R$ 300,00), LOJA B (R$ 120,00) e LOJA C (R$ 80,00).',
    ].join('\n\n'));
    expect(t).not.toMatch(/👉|Origem:|Ritmo:|Nesse passo:|Pela média:/);
  });
  it('último dia, sobra negativa e nada mais entrando: só perde o rótulo', () => {
    const t = nbsp(explicacaoCorrida(explicacaoDaConta({ ...conta, aindaEntra: 0, saiContas: 0, saiCasa: 0, saiFaturas: 0, sobraDiaADia: -50, diasContandoHoje: 1 })));
    expect(t).toContain('Nas contas vocês têm R$ 2.000,00 e não entra mais nada este mês.');
    expect(t).toContain('Não falta pagar conta fixa, casa nem fatura este mês.');
    expect(t).toContain('A sobra não é positiva, então não dá pra gastar nada sem fechar no vermelho.');
    expect(t).not.toMatch(/: R\$|Dá pra gastar:/);
  });
  it('frase de formato desconhecido perde o rótulo e começa com maiúscula; sem ritmo, um parágrafo só', () => {
    expect(explicacaoCorrida(['Origem: nas contas tem R$ 1,00.', 'Outra coisa: algo.'])).toBe('Nas contas tem R$ 1,00. Algo.');
  });
});
