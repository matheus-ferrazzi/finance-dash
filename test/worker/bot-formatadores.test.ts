import { describe, expect, it } from 'vitest';
import { caminhoDa, formatar, graficoDaFerramenta, NOMES_FERRAMENTAS, TOOLS } from '../../src/worker/bot/ferramentas';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('ferramentas', () => {
  it('8 ferramentas, schema com nome e parâmetros', () => {
    expect(NOMES_FERRAMENTAS).toEqual(['situacao_mes', 'gasto_periodo', 'maiores_gastos', 'comparar', 'faturas', 'contas_do_mes', 'trilha', 'simular_compra']);
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
      .toContain(`💸 Hoje dá pra gastar *${brl(50)}*`);
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
      faturas: { itens: [{ banco: 'B', pessoa: 'Ariane', valor: 100, vencimento: '15/10', paga: false }], total: 100, link: '/faturas' },
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
