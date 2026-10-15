import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BlocoHome } from '../../src/app/components/BlocoHome';
import { LinhaDoMes } from '../../src/app/components/LinhaDoMes';

// o olho de esconder valores borra tudo que tem a classe "money" — só dinheiro, e todo dinheiro
describe('privacidade dos valores na home', () => {
  it('valor que não é dinheiro (nome de grupo, "3/5") não é borrado', () => {
    const h = renderToStaticMarkup(createElement(BlocoHome, { titulo: 't', valor: 'Casa', valorEhDinheiro: false }));
    expect(h).not.toContain('money');
  });
  it('valor em reais é borrado', () => {
    const h = renderToStaticMarkup(createElement(BlocoHome, { titulo: 't', valor: 'R$ 10,00' }));
    expect(h).toContain('money');
  });
  it('o rodapé "hoje R$ X" da linha do mês é borrado', () => {
    const serie = { pontos: [{ dia: 1, saldo: 5, futuro: false }, { dia: 2, saldo: 7, futuro: true }], fechamento: 7, passado: false };
    const h = renderToStaticMarkup(createElement(LinhaDoMes, { serie, titulo: 'Fecha', href: '/x' }));
    expect(h).toMatch(/hoje <span class="money">R\$/);
  });
});

describe('revisão final F2a: simulador com uma mensagem só', () => {
  it('com veredito novo, o aviso antigo ("Fica/Não fica no vermelho") não aparece', async () => {
    const { SimuladorCompra } = await import('../../src/app/components/SimuladorCompra');
    const resultado = { valorParcela: 100, parcelas: 1, meses: [{ label: 'agora', depois: -10 }], mesesVermelho: 1, ultimaParcela: 'x', saldoComCompra: [-10] };
    const h = renderToStaticMarkup(createElement(SimuladorCompra, { valorStr: '100', setValorStr: () => {}, parcelasStr: '1', setParcelasStr: () => {}, resultado, veredito: 'Não cabe: x' }));
    expect(h).toContain('Não cabe: x');
    expect(h).not.toMatch(/Fica no vermelho em|Não fica no vermelho/);
  });
});

// F1 (pendência): os pedaços da barra "Para onde vai" não eram links (só os nomes)
describe('barra dos grupos da home', () => {
  it('cada pedaço é um link para o grupo, com rótulo acessível', async () => {
    const { BarraGrupos } = await import('../../src/app/components/BarraGrupos');
    const h = renderToStaticMarkup(createElement(BarraGrupos, { grupos: [{ nome: 'Mercado', pct: 60, href: '/gastos?grupo=Mercado' }, { nome: 'Lazer', pct: 40, href: '/gastos?grupo=Lazer' }] }));
    expect(h.match(/<a /g)).toHaveLength(2);
    expect(h).toContain('href="/gastos?grupo=Mercado"');
    expect(h).toContain('aria-label="Mercado, 60%"');
  });
});
