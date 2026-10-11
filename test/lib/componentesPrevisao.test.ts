import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ListaMeses } from '../../src/app/components/ListaMeses';
import { DetalheMes } from '../../src/app/components/DetalheMes';
import type { LinhaLista } from '../../src/lib/mesAMes';

const linhas: LinhaLista[] = [
  { tipo: 'passado', mes: '2026-09', sobra: 50, previsto: -100, saldoFim: 900, piorCaso: null },
  { tipo: 'atual', mes: '2026-10', sobra: -20, previsto: null, saldoFim: -880, piorCaso: null },
  ...Array.from({ length: 14 }, (_, i): LinhaLista => ({
    tipo: 'futuro', mes: `20${27 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, sobra: -1, previsto: null, saldoFim: -1, piorCaso: null,
  })),
];

describe('lista de meses', () => {
  it('cada mês (inclusive o atual) é link para o detalhe; dinheiro com "money"; 12 futuros e "ver até 24"', () => {
    const h = renderToStaticMarkup(createElement(ListaMeses, { linhas, resp: 'casal', mostrarTodos: false }));
    expect(h).toContain('href="/previsibilidade?mes=2026-09"');
    expect(h).toContain('href="/previsibilidade?mes=2026-10"');
    expect((h.match(/href="\/previsibilidade\?mes=202[78]-/g) ?? []).length).toBe(12);
    expect(h).toContain('ver até 24 meses');
    expect(h).toContain('href="/previsibilidade?todos=1"');
    expect(h).toContain('money');
    // no mês atual a projeção só tem o que falta acontecer: não chamar de "sobra do mês"
    expect(h).toMatch(/em andamento[\s\S]*?até o fim do mês/);
  });
  it('com todos, mostra os 14 futuros e some o botão; a pessoa vai no link', () => {
    const h = renderToStaticMarkup(createElement(ListaMeses, { linhas, resp: 'Ariane', mostrarTodos: true }));
    expect((h.match(/href="\/previsibilidade\?resp=Ariane&amp;mes=202[78]-/g) ?? []).length).toBe(14);
    expect(h).not.toContain('ver até 24 meses');
  });
});

describe('detalhe do mês', () => {
  const comum = { resp: 'casal' as const, anterior: '2026-12', seguinte: '2027-02' };
  it('mês futuro: linhas com total e itens; setas e voltar', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      ...comum, tipo: 'futuro', mes: '2027-01',
      futuro: { linhas: [{ chave: 'entra', titulo: 'Entra', total: 5000, itens: [{ nome: 'Salário A', valor: 5000, nota: 'dia 5' }] }], sobra: 300, saldoFim: 800 },
    }));
    expect(h).toContain('Entra');
    expect(h).toContain('Salário A');
    expect(h).toContain('Sobra do mês');
    expect(h).toContain('href="/previsibilidade?mes=2026-12"');
    expect(h).toContain('href="/previsibilidade?mes=2027-02"');
    expect(h).toContain('voltar à lista');
  });
  it('linha sem itens diz que nada está previsto', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      ...comum, tipo: 'futuro', mes: '2027-01',
      futuro: { linhas: [{ chave: 'entra', titulo: 'Entra', total: 0, itens: [] }], sobra: 0, saldoFim: 0 },
    }));
    expect(h).toContain('nenhuma receita prevista');
  });
  it('mês atual: já aconteceu × ainda falta e fecha com', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      ...comum, tipo: 'atual', mes: '2026-10',
      atual: { linhas: [{ chave: 'entra', titulo: 'Entra', jaAconteceu: 10, aindaFalta: 20 }], fechaCom: -5 },
    }));
    expect(h).toMatch(/Já aconteceu[\s\S]*Ainda falta[\s\S]*Fecha com/);
  });
  it('mês passado: previsto, real, diferença; primeiro da lista sem seta para trás; links de lançamentos', () => {
    const h = renderToStaticMarkup(createElement(DetalheMes, {
      ...comum, anterior: null, tipo: 'passado', mes: '2026-09',
      passado: { linhas: [{ chave: 'saldo', titulo: 'Sobra do mês', previsto: 20, real: 50, diferenca: 30 }], saldoFim: 5,
        conciliacao: { saldoInicio: 100, sobra: 50, transferencias: -145, saldoFim: 5 } },
    }));
    expect(h).toMatch(/Saldo no início[\s\S]*Sobra do mês[\s\S]*Transferências, aplicações e ajustes[\s\S]*Saldo no fim/);
    expect(h).toMatch(/Previsto[\s\S]*Real[\s\S]*Diferença/);
    expect(h).not.toContain('Mês anterior');
    expect(h).toContain('href="/gastos?mes=2026-09"');
  });
});

describe('simulador em tela própria', () => {
  it('não fala de gráfico (a tela não tem gráfico)', async () => {
    const { SimuladorCompra } = await import('../../src/app/components/SimuladorCompra');
    const sim = { valorParcela: 100, parcelas: 1, meses: [{ mes: '2026-10', mesLabel: 'out/26', saldo: -1 }], mesesVermelho: 1, ultimaParcela: 'out/26', saldoComCompra: [-1] } as any;
    const h = renderToStaticMarkup(createElement(SimuladorCompra, { valorStr: '100', setValorStr: () => {}, parcelasStr: '1', setParcelasStr: () => {}, resultado: sim, veredito: 'Atenção: x' }));
    expect(h).not.toContain('gráfico');
  });
});
