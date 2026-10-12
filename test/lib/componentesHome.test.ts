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
