import { expect, it } from 'vitest';
import { escolherGrupos, ferramentasDe } from '../../src/worker/bot/escolha';

// 27/10: perguntas inventadas (o histórico real não entra no repositório)
const P = (texto: string, citada?: string) => ({ id: 'x', pessoa: 'Matheus', texto, ...(citada ? { citada } : {}) });
const g = (texto: string, citada?: string, ctx: string[] = []) => [...escolherGrupos(P(texto, citada), ctx.map((pergunta) => ({ pergunta })))].sort();

it('base sempre; sem palavra de outro grupo, só base', () => expect(g('quanto gastei com mercado mes passado?')).toEqual(['base']));
it('correção e lançamento: propostas', () => {
  expect(g('muda o pix da padaria pra mercado')).toContain('propostas');
  expect(g('paguei 30 em dinheiro na feira')).toContain('propostas');
  expect(g('quero o L3')).toContain('propostas');
});
it('citada sem palavra-chave: mensagens', () => expect(g('e isso?', '🔴 *Mês no vermelho*')).toContain('mensagens'));
it('explica o diário: mensagens', () => expect(g('me explica o diário')).toContain('mensagens'));
it('a última pergunta do contexto conta ("e pra mercado?" depois de uma correção)', () =>
  expect(g('e pra mercado?', undefined, ['corrige aquele pix'])).toContain('propostas'));
it('compra e patrimônio', () => {
  expect(g('cabe uma tv de 3000 em 10x?')).toContain('compra');
  expect(g('quanto tem investido?')).toContain('patrimonio');
});
it('ferramentasDe: base tem as 6 da base, na ordem de TOOLS', () =>
  expect(ferramentasDe(new Set(['base'])).map((t: any) => t.function.name)).toEqual(['situacao_mes', 'gasto_periodo', 'maiores_gastos', 'comparar', 'faturas', 'contas_do_mes']));
it('pôr ou adicionar uma conta: propostas (no histórico, "põe X reais nas contas" dependia da refeita)', () => {
  expect(g('põe 50 reais de dentista nas contas')).toContain('propostas');
  expect(g('adiciona o IPVA nas contas do mês')).toContain('propostas');
  expect(g('bota 80 de luz pra novembro')).toContain('propostas');
});
