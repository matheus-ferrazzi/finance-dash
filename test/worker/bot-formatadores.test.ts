import { describe, expect, it } from 'vitest';
import { caminhoDa, formatar, graficoDaFerramenta, NOMES_FERRAMENTAS, TOOLS } from '../../src/worker/bot/ferramentas';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ferramentas', () => {
  it('8 ferramentas, schema com nome e parâmetros', () => {
    expect(NOMES_FERRAMENTAS).toEqual(['situacao_mes', 'gasto_periodo', 'maiores_gastos', 'comparar', 'faturas', 'contas_do_mes', 'trilha', 'simular_compra', 'investimentos',
      'buscar_lancamentos', 'propor_categoria', 'propor_conta_avulsa', 'propor_gasto_dinheiro']);
    expect(TOOLS.every((t: any) => t.type === 'function' && t.function.parameters)).toBe(true);
  });
  it('caminho: query com período, pessoa ("eu" vira quem perguntou) e grupo; nome desconhecido → null', () => {
    expect(caminhoDa('gasto_periodo', { periodo: 'este_mes', pessoa: 'eu', grupo: 'Mercado' }, 'Ariane')).toBe('/api/bot/gasto?periodo=este_mes&pessoa=Ariane&grupo=Mercado');
    expect(caminhoDa('comparar', { periodo_a: 'este_mes', periodo_b: 'mes_passado' }, 'Matheus')).toBe('/api/bot/comparar?periodo=este_mes&periodo_b=mes_passado&pessoa=casal');
    expect(caminhoDa('simular_compra', { valor_total: 3000, parcelas: 10 }, 'Matheus')).toBe('/api/bot/simular?valor_total=3000&parcelas=10');
    expect(caminhoDa('trilha', {}, 'Matheus')).toBe('/api/bot/trilha');
    expect(caminhoDa('apagar_tudo', {}, 'Matheus')).toBeNull();
  });
});

describe('formatar (texto montado da trava)', () => {
  it('gasto_periodo', () => {
    expect(formatar('gasto_periodo', { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 450, itens: [{ nome: 'Mercado', valor: 400 }, { nome: 'Comer fora', valor: 50 }], link: '/gastos' }, 'https://p'))
      .toBe([`💰 Gasto em out/26 (casal): *${brl(450)}*`, `• Mercado: ${brl(400)}`, `• Comer fora: ${brl(50)}`, '', '👉 https://p/gastos'].join('\n'));
  });
  it('situacao_mes, simular_compra (cabe e não cabe), trilha', () => {
    expect(formatar('situacao_mes', { mesLabel: 'out/26', dapraGastarHoje: 50, ritmoAtualDia: 80, diasRestantes: 10, fechaCom: -500, saiDoVermelho: null, link: '/' }, 'https://p'))
      .toContain(`💸 Hoje dá pra gastar *${brl(50)}* no débito e PIX`);
    // N11: no último dia também (era sempre 0 e sumia); sem a linha do ritmo
    const ult = formatar('situacao_mes', { mesLabel: 'out/26', dapraGastarHoje: 70, ritmoAtualDia: 80, diasRestantes: 0, fechaCom: 100, saiDoVermelho: null, link: '/' }, 'https://p');
    expect(ult).toContain(`💸 Hoje dá pra gastar *${brl(70)}* no débito e PIX`);
    expect(ult).not.toContain('Ritmo');
    expect(formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: true, mesQueFura: null, aprofunda: 0, link: '/simulador' }, 'https://p'))
      .toContain('✅ Cabe');
    expect(formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: false, mesQueFura: 'jan/27', aprofunda: 900, link: '/simulador' }, 'https://p'))
      .toContain('❌ Não cabe: jan/27 vai para o vermelho');
    expect(formatar('trilha', { fase: 1, titulo: 'Sair das dívidas', proximoPasso: 'Pagar a fatura.', reserva: { aplicado: 100, meta: 1000 }, link: '/trilha' }, 'https://p'))
      .toContain('🧭 Fase 1 de 4 ▰▱▱▱: Sair das dívidas');
  });
  it('todo formatador termina com o link e não tem NaN', () => {
    const exemplos: Record<string, any> = {
      maiores_gastos: { periodo: 'hoje', pessoa: 'casal', grupo: null, itens: [{ data: '11/10', valor: 10, descricao: 'X', pessoa: 'Ariane' }], link: '/buscar' },
      comparar: { a: 'out/26', b: 'set/26', pessoa: 'casal', totalA: 10, totalB: 20, diferenca: -10, pct: -50, grupos: [{ nome: 'Mercado', a: 10, b: 20, diferenca: -10 }], link: '/gastos' },
      faturas: { itens: [{ banco: 'B', pessoa: 'Ariane', total: 100, vencimento: '15/10', situacao: 'a_vencer', falta: 100 }], total: 100, link: '/faturas' },
      contas_do_mes: { mesLabel: 'out/26', pagas: [{ nome: 'Luz', valor: 100 }], falta: [{ nome: 'Água', valor: 80, vence: 20 }], aConfirmar: [], totalFalta: 80, link: '/contas' },
    };
    for (const [n, d] of Object.entries(exemplos)) {
      const t = formatar(n, d, 'https://p');
      expect(t.endsWith(`👉 https://p${d.link}`)).toBe(true);
      expect(t).not.toMatch(/NaN|undefined/);
    }
  });
});

describe('gráfico da ferramenta', () => {
  it('gasto_periodo e comparar têm barras; o resto não', () => {
    expect(graficoDaFerramenta('gasto_periodo', { periodo: 'out/26', itens: [{ nome: 'Mercado', valor: 400 }] })).toContain('class="barra"');
    expect(graficoDaFerramenta('comparar', { a: 'out/26', b: 'set/26', grupos: [{ nome: 'Mercado', a: 10, b: 20, diferenca: -10 }] })).toContain('class="media"');
    expect(graficoDaFerramenta('trilha', {})).toBeNull();
  });
});

describe('faturas (N4: a última fechada de cada cartão, com situação)', () => {
  it('a pagar = o que falta das a vencer e em atraso; parcelada e paga aparecem com o rótulo', () => {
    const t = formatar('faturas', { itens: [
      { banco: 'A', pessoa: 'Ariane', total: 480, vencimento: '02/10', situacao: 'parcelada', falta: 0 },
      { banco: 'B', pessoa: 'Matheus', total: 800, vencimento: '20/10', situacao: 'a_vencer', falta: 500 },
      { banco: 'C', pessoa: 'Matheus', total: 300, vencimento: '04/10', situacao: 'atrasada', falta: 200 },
      { banco: 'D', pessoa: 'Ariane', total: 170, vencimento: '05/10', situacao: 'paga', falta: 0 },
    ], total: 700, link: '/faturas' }, 'https://p');
    expect(t).toContain(`💳 Faturas a pagar: *${brl(700)}*`);
    expect(t).toContain(`🔸 B (Matheus): falta ${brl(500)} de ${brl(800)}, vence 20/10`);
    expect(t).toContain(`🔴 C (Matheus): falta ${brl(200)} de ${brl(300)}, venceu 04/10 (em atraso)`);
    expect(t).toContain(`🧩 A (Ariane): ${brl(480)} de 02/10, parcelada`);
    expect(t).toContain(`✅ D (Ariane): ${brl(170)} de 05/10, paga`);
  });
  it('nada a pagar: frase própria', () => {
    expect(formatar('faturas', { itens: [{ banco: 'D', pessoa: 'Ariane', total: 10, vencimento: '05/10', situacao: 'paga', falta: 0 }], total: 0, link: '/faturas' }, 'https://p'))
      .toContain('💳 Nenhuma fatura a pagar agora');
  });
});

describe('percentual em pt-BR (E1)', () => {
  it('comparar mostra 35,2% e não 35.2%', () => {
    const t = formatar('comparar', { a: 'out/26', b: 'set/26', pessoa: 'casal', totalA: 135.2, totalB: 100, diferenca: 35.2, pct: 35.2, grupos: [], link: '/gastos' }, 'https://p');
    expect(t).toContain('🔺 35,2%');
  });
});

describe('ferramentas de ação (E2)', () => {
  it('schema tem as 3 novas; nenhuma ferramenta grava (nomes)', () => {
    expect(NOMES_FERRAMENTAS).toEqual(expect.arrayContaining(['buscar_lancamentos', 'propor_categoria', 'propor_conta_avulsa']));
    expect(NOMES_FERRAMENTAS.some((n) => /executar|gravar|salvar|desfaz/i.test(n))).toBe(false);
  });
  it('propor_categoria só aceita categoria da lista (enum) e escopo este|pessoa|texto', () => {
    const t: any = TOOLS.find((x: any) => x.function.name === 'propor_categoria');
    expect(t.function.parameters.properties.escopo.enum).toEqual(['este', 'pessoa', 'texto']);
    expect(t.function.parameters.properties.categoria.enum).toContain('Groceries');
  });
});

describe('💵 nas respostas de gasto (E3)', () => {
  it('gasto_periodo mostra quanto foi em dinheiro', () => {
    const t = formatar('gasto_periodo', { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 370, totalDinheiro: 70, itens: [{ nome: 'Mercado', valor: 350, dinheiro: 50 }, { nome: 'Lazer', valor: 20, dinheiro: 0 }], link: '/gastos' }, 'https://p');
    expect(t).toContain(`💰 Gasto em out/26 (casal): *${brl(370)}* (💵 ${brl(70)})`);
    expect(t).toContain(`• Mercado: ${brl(350)} (💵 ${brl(50)})`);
    expect(t).toContain(`• Lazer: ${brl(20)}\n`);
  });
  it('schema tem propor_gasto_dinheiro com categoria em enum', () => {
    const t: any = TOOLS.find((x: any) => x.function.name === 'propor_gasto_dinheiro');
    expect(t.function.parameters.properties.categoria.enum).toContain('Groceries');
    expect(t.function.parameters.required).toEqual(['valor', 'descricao', 'categoria']);
  });
});

describe('revisão E3: categorias do gasto em dinheiro', () => {
  it('o enum só tem categorias de gasto (sem fatura, salário, investimento)', () => {
    const t: any = TOOLS.find((x: any) => x.function.name === 'propor_gasto_dinheiro');
    const e: string[] = t.function.parameters.properties.categoria.enum;
    expect(e).toContain('Groceries');
    expect(e.some((c) => ['Credit card payment', 'Salary', 'Investments', 'Income'].includes(c))).toBe(false);
  });
});

describe('investimentos (S6: substitui o Bot 04)', () => {
  it('total, por tipo e maiores, com link', () => {
    const t = formatar('investimentos', { total: 2216, porTipo: [{ tipo: 'Renda fixa', total: 1500 }, { tipo: 'Ações', total: 716 }],
      maiores: [{ nome: 'CDB X', valor: 1000 }], link: '/investimentos' }, 'https://p');
    expect(t).toContain(`💼 Investimentos: *${brl(2216)}*`);
    expect(t).toContain(`• Renda fixa: ${brl(1500)}`);
    expect(t).toContain(`🔝 CDB X: ${brl(1000)}`);
    expect(t.endsWith('👉 https://p/investimentos')).toBe(true);
  });
  it('a ferramenta existe e chama a rota', () => {
    expect(NOMES_FERRAMENTAS).toContain('investimentos');
    expect(caminhoDa('investimentos', {}, 'Matheus')).toBe('/api/bot/investimentos');
  });
});

// E1-M8: o simular dizia só o pior caso; quando provável e pior caso discordam, a resposta diz os dois
describe('simular com os dois cenários', () => {
  it('provável cabe e pior caso não: as duas linhas', () => {
    const t = formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: false, mesQueFura: 'jan/27', aprofunda: 0, cabeProvavel: true, link: '/simulador' }, 'https://p');
    expect(t).toContain('✅ Pelo número provável, cabe');
    expect(t).toContain('❌ Pelo pior caso, jan/27 vai para o vermelho');
  });
  it('os dois concordam: uma linha só, como antes', () => {
    const t = formatar('simular_compra', { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: true, mesQueFura: null, aprofunda: 0, cabeProvavel: true, link: '/simulador' }, 'https://p');
    expect(t).toContain('✅ Cabe');
    expect(t).not.toContain('provável');
  });
});
