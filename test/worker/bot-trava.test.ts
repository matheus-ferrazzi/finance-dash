import { describe, expect, it } from 'vitest';
import { respostaConfere, valoresBRL } from '../../src/worker/bot/trava';

describe('valoresBRL', () => {
  it('lê R$ com milhar, centavos e sinal', () => {
    expect(valoresBRL('Gastaram R$ 1.234,56 e -R$ 50 e R$ -7,5; nada de 300 sem R$')).toEqual([1234.56, -50, -7.5]);
  });
});

describe('respostaConfere', () => {
  const res = [{ total: 1234.56, itens: [{ nome: 'Mercado', valor: 53.63 }] }];
  it('valor igual ou arredondado ao inteiro: confere; sinal ignorado', () => {
    expect(respostaConfere('🛒 Mercado: R$ 53,63 e total R$ 1.234,56', res)).toBe(true);
    expect(respostaConfere('Mercado deu R$ 54', res)).toBe(true);
    expect(respostaConfere('Faltou R$ 1.234,56', res)).toBe(true);
  });
  it('valor que não veio de ferramenta (soma, invenção): não confere', () => {
    expect(respostaConfere('Juntos dá R$ 1.288,19', res)).toBe(false);
  });
  it('27/10: as frases da explicação valem (R$ formatado com espaço fixo); dias não viram dinheiro', () => {
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const res = [{ explicacao: [`Sobra para o dia a dia até o fim do mês: ${brl(135.12)}.`, `Nesse passo: … fecha em ${brl(-818.33)}.`] }];
    expect(respostaConfere('👉 Sobram R$ 135,12; nesse passo fecha em -R$ 818,33', res)).toBe(true);
    expect(respostaConfere('👉 dá R$ 5 por dia', res)).toBe(false);
  });
  // 27/10 (produção): "o ritmo de R$ 190,69, se mantido, fecha em -R$ 72,86" — -72,86 é o pela média, não o nesse passo
  describe('os dois "fecha em"', () => {
    const res = [{ ritmoAtualDia: 190.69, fechaCom: -72.86283642657426, nessePassoFechaEm: -818.33 }];
    it('o pela média numa frase do ritmo, sem falar da média: não passa', () => {
      expect(respostaConfere('👉 O ritmo atual de gasto diário está em R$ 190,69, o que indica que, se mantido, o mês fechará em -R$ 72,86.', res)).toBe(false);
    });
    it('cada um com a base certa passa; o pela média sozinho (fecha-em de sempre) também', () => {
      expect(respostaConfere('👉 Se o ritmo de R$ 190,69 continuar, fecha em -R$ 818,33.', res)).toBe(true);
      expect(respostaConfere('👉 Pela média dos outros meses fecha em -R$ 72,86, bem melhor que no ritmo de agora.', res)).toBe(true);
      expect(respostaConfere('👉 Outubro fecha em -R$ 72,86.', res)).toBe(true);
    });
    it('o nesse passo sem falar do ritmo, ou numa frase da média: não passa', () => {
      expect(respostaConfere('👉 O mês fecha em -R$ 818,33.', res)).toBe(false);
      expect(respostaConfere('👉 Pela média fecha em -R$ 818,33.', res)).toBe(false);
    });
  });
  // 27/10 (produção): "*2371.8* – gasto total com Mercado" passou: a trava só olhava o que vinha com R$
  it('valor cru no formato americano (2371.8) não passa; milhar e porcentagem em pt-BR seguem valendo', () => {
    const res = [{ total: 2371.8, pct: 35.2 }];
    expect(respostaConfere('📊 *2371.8* – gasto total com Mercado no mês passado.', res)).toBe(false);
    expect(respostaConfere('📊 foram 2371.80 no mercado', res)).toBe(false);
    // produção, de novo: o ponto final logo depois do número escondia o valor cru
    expect(respostaConfere('📊 Origem: Mercado, período: mes_passado, total: 2371.8.', res)).toBe(false);
    expect(respostaConfere('📊 R$ 2.371,80 em 1.234 compras, 35,2% a mais', res)).toBe(true);
  });
  it('sem R$: confere', () => {
    expect(respostaConfere('Vocês estão na fase 1.', res)).toBe(true);
  });
});

describe('trava: revisão E1', () => {
  it('número grande sem separador de milhar é lido inteiro', () => {
    expect(valoresBRL('R$ 12345 e R$1234,56 e R$ 1.500')).toEqual([12345, 1234.56, 1500]);
  });
  it('sinal: resultado negativo dito como positivo sem "-"/negativo/vermelho na linha não confere', () => {
    const res = [{ fechaCom: -1500 }];
    expect(respostaConfere('📈 out/26 fecha com sobra de R$ 1.500', res)).toBe(false);
    expect(respostaConfere('📉 out/26 fecha em -R$ 1.500', res)).toBe(true);
    expect(respostaConfere('📉 fecha no vermelho em R$ 1.500', res)).toBe(true);
    expect(respostaConfere('Sobra de R$ 200', [{ total: -200 }])).toBe(false);
  });
  it('só campos de dinheiro valem como R$ (parcelas, fase, dias, pct não)', () => {
    expect(respostaConfere('Parcela de R$ 10', [{ parcelas: 10, fase: 1, diasRestantes: 10, pct: 10 }])).toBe(false);
    expect(respostaConfere('Parcela de R$ 300', [{ parcelas: 10, parcela: 300 }])).toBe(true);
  });
  it('R$ dentro de texto da ferramenta vale (próximo passo da trilha)', () => {
    expect(respostaConfere('➡️ Aplicar R$ 1.975,00 por mês', [{ proximoPasso: 'Aplicar R$ 1.975,00/mês completa a reserva.' }])).toBe(true);
  });
  it('percentual tem que vir de um pct da ferramenta', () => {
    expect(respostaConfere('🔺 subiu 30%', [{ pct: 14.3 }])).toBe(false);
    expect(respostaConfere('🔺 subiu 14,3%', [{ pct: 14.3 }])).toBe(true);
    expect(respostaConfere('🔻 caiu 14%', [{ pct: -14.3 }])).toBe(true);
  });
});

describe('trava (E3)', () => {
  it('campos de dinheiro do E3 valem como R$', () => {
    expect(respostaConfere('💵 R$ 70,00 em dinheiro', [{ totalDinheiro: 70 }])).toBe(true);
    expect(respostaConfere('💵 R$ 50,00', [{ itens: [{ dinheiro: 50 }] }])).toBe(true);
  });
});

// 28/10 (produção): "*1.086,14* foi o gasto total com comer fora" — valor sem R$ não passava por conferência nenhuma
describe('valor em reais escrito sem R$', () => {
  const res = [{ total: 1086.14, itens: [{ nome: 'Restaurante', valor: 681.99 }, { nome: 'Delivery', valor: 362.45 }], pct: 35.2 }];
  it('vale se veio da ferramenta', () => {
    expect(respostaConfere('📊 *1.086,14* no mês.\n🍽️ Restaurante *681,99*, Delivery *362,45*.', res)).toBe(true);
  });
  it('inventado ou somado: não passa', () => {
    expect(respostaConfere('📊 *1.086,15* no mês.', res)).toBe(false);
    expect(respostaConfere('🍽️ juntos dá 1.044,44', res)).toBe(false);
  });
  it('porcentagem, inteiros (dias, parcelas, milhar sem centavos) e datas seguem livres', () => {
    expect(respostaConfere('🔺 35,2% a mais, em 1.234 compras, 10 parcelas, 5 dias, até 28/10.', res)).toBe(true);
  });
  it('sinal e rótulo valem como no R$', () => {
    const r2 = [{ ritmoAtualDia: 190.69, fechaCom: -72.86, nessePassoFechaEm: -818.33 }];
    expect(respostaConfere('👉 O mês fecha em -818,33.', r2)).toBe(false);
    expect(respostaConfere('👉 Se o ritmo continuar, fecha em -818,33.', r2)).toBe(true);
    expect(respostaConfere('👉 Sobra de 72,86 no fim do mês.', r2)).toBe(false);
  });
});

// 28/10 (conjunto de perguntas da fase 3)
describe('trava: rodada 2 do conjunto', () => {
  it('a dívida antiga paga (campo divida) é dinheiro', () => {
    expect(respostaConfere('🏦 R$ 1.845,17 pagando dívida antiga', [{ total: 10, divida: 1845.17 }])).toBe(true);
  });
  it('milhar com espaço (R$ 12 524,69) é lido inteiro', () => {
    expect(respostaConfere('📊 R$ 12 524,69 contra R$ 9 977,79', [{ totalA: 12524.69, totalB: 9977.79 }])).toBe(true);
    expect(respostaConfere('📊 R$ 12 524,69', [{ totalA: 12.0 }])).toBe(false);
  });
});

// 28/10 (rodada 3): "fechará em R$ ‑6,66" com hífen não separável (U+2011) barrava um valor certo
it('trava: hífen não separável, sinal de menos e travessão contam como menos', () => {
  const res = [{ fechaCom: -6.66, nessePassoFechaEm: -555.55 }];
  expect(respostaConfere('👉 Pela média dos meses, fecha em R$ ‑6,66.', res)).toBe(true);
  expect(respostaConfere('👉 No ritmo de agora fecha em −R$ 555,55.', res)).toBe(true);
  expect(respostaConfere('👉 No ritmo de agora fecha em –R$ 555,55.', res)).toBe(true);
});

it('trava: "déficit de R$ 89,16" vale para o valor negativo', () => {
  expect(respostaConfere('📉 Pela média, um déficit de R$ 89,16.', [{ fechaCom: -89.16 }])).toBe(true);
});
