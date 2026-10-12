import { describe, expect, it } from 'vitest';
import { FALHA, responder, SEM_FERRAMENTA } from '../../src/worker/bot/agente';

const p = { id: 'X', pessoa: 'Ariane', texto: 'quanto gastei com mercado?' };
const gasto = { periodo: 'out/26', pessoa: 'casal', grupo: null, total: 450, itens: [{ nome: 'Mercado', valor: 400 }, { nome: 'Comer fora', valor: 50 }], link: '/gastos' };
const painel = async (c: string) => (c.startsWith('/api/bot/gasto') ? { ok: true, dados: gasto } : { ok: false, dados: { erro: 'x' } });
const groqRoteiro = (passos: any[]) => { let i = 0; const vistos: any[] = []; return { vistos, chat: async (msgs: any) => { vistos.push(msgs); return passos[i++]; } }; };
const base = { contexto: [], hoje: '2026-10-11', painelUrl: 'https://p', painel };

describe('agente', () => {
  it('chama a ferramenta e usa a resposta do modelo quando os R$ conferem; gráfico vem junto', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes","grupo":null}' }], modelo: 'm' },
      { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.texto).toBe('🛒 Mercado: R$ 400,00 este mês.');
    expect(r.trava).toBe(false);
    expect(r.ferramentas).toEqual([{ nome: 'gasto_periodo', args: { periodo: 'este_mes', grupo: null }, ok: true }]);
    expect(r.svg).toContain('class="barra"');
    expect(JSON.stringify(g.vistos[0])).toContain('Ariane');
    expect(JSON.stringify(g.vistos[0])).toContain('2026-10-11');
  });
  it('R$ inventado: trava troca pelo texto montado', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: 'Deu R$ 999,99.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.trava).toBe(true);
    expect(r.texto).toContain('💰 Gasto em out/26');
  });
  it('sem ferramenta: "ainda não sei"', async () => {
    const r = await responder(p, { ...base, groq: groqRoteiro([{ content: 'Vai chover amanhã.', toolCalls: [], modelo: 'm' }]) });
    expect(r.texto).toBe(SEM_FERRAMENTA);
    expect(r.semFerramenta).toBe(true);
  });
  it('Groq falhou: mensagem de falha e erro registrado', async () => {
    const r = await responder(p, { ...base, groq: { chat: async () => { throw new Error('Groq: m: HTTP 503'); } } });
    expect(r.texto).toBe(FALHA);
    expect(r.erro).toBe('Groq: m: HTTP 503');
  });
  it('no máximo 4 rodadas de ferramenta; depois usa o texto montado da última', async () => {
    const chamada = { content: null, toolCalls: [{ id: 'c', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' };
    const g = groqRoteiro([chamada, chamada, chamada, chamada, chamada]);
    const r = await responder(p, { ...base, groq: g });
    expect(g.vistos.length).toBe(4);
    expect(r.texto).toContain('💰 Gasto em out/26');
  });
  it('argumento inválido do modelo (JSON quebrado) não derruba: ferramenta com erro', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{periodo' }], modelo: 'm' },
      { content: 'Não consegui ver os dados.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.ferramentas[0].ok).toBe(false);
    expect(r.texto).toBe('Não consegui ver os dados.');
  });
});
