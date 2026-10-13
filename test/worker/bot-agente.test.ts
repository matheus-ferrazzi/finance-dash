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
    expect(r.texto).toBe('🛒 Mercado: R$ 400,00 este mês.\n\n👉 https://p/gastos');
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

describe('resposta nunca começa com "bot" (revisão E1)', () => {
  it('texto do modelo começando com "bot" ganha um emoji na frente (o bot não se chama de volta)', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: 'Bot aqui: Mercado R$ 400,00.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.texto).toBe('🤖 Bot aqui: Mercado R$ 400,00.\n\n👉 https://p/gastos');
  });
});

describe('ajustes do teste em produção (E1)', () => {
  it('resposta do modelo sempre termina com o link do painel; link relativo escrito pelo modelo sai', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: '🛒 Mercado: R$ 400,00.\n🔗 Detalhes: /gastos', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g });
    expect(r.texto).toBe('🛒 Mercado: R$ 400,00.\n\n👉 https://p/gastos');
  });
  it('link completo já escrito pelo modelo não duplica', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: '🛒 Mercado: R$ 400,00.\n👉 https://p/gastos', toolCalls: [], modelo: 'm' },
    ]);
    expect((await responder(p, { ...base, groq: g })).texto).toBe('🛒 Mercado: R$ 400,00.\n\n👉 https://p/gastos');
  });
  it('simular, faturas e contas: sempre o texto montado (o modelo não pode omitir a ressalva)', async () => {
    const sim = { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: true, mesQueFura: null, aprofunda: 3000, link: '/simulador' };
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'simular_compra', args: '{"valor_total":3000,"parcelas":10}' }], modelo: 'm' },
      { content: '📺 R$ 300,00 por parcela, cabe ✅', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g, painel: async () => ({ ok: true, dados: sim }) });
    expect(r.texto).toContain('Aprofunda o pior mês');
    expect(r.texto.endsWith('👉 https://p/simulador')).toBe(true);
    expect(r.trava).toBe(false);
  });
});

describe('formato do WhatsApp (E1)', () => {
  it('**negrito** do modelo vira *negrito*', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: '🛒 Gasto com **Mercado**: **R$ 400,00**', toolCalls: [], modelo: 'm' },
    ]);
    expect((await responder(p, { ...base, groq: g })).texto).toBe('🛒 Gasto com *Mercado*: *R$ 400,00*\n\n👉 https://p/gastos');
  });
});

describe('ferramentas locais (E2)', () => {
  it('proposta vira a resposta (texto do sistema), sem passar pelo painel', async () => {
    const vistos: string[] = [];
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'propor_conta_avulsa', args: '{"nome":"Dentista","valor":150}' }], modelo: 'm' },
      { content: 'Pronto, criei.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g, painel: async (c: string) => { vistos.push(c); return { ok: true, dados: {} }; },
      locais: { propor_conta_avulsa: async () => ({ ok: true, dados: { proposta: '🟡 Pôr a conta avulsa X?' } }) } });
    expect(r.texto).toBe('🟡 Pôr a conta avulsa X?');
    expect(vistos).toEqual([]);
  });
  it('lista de candidatos vira a resposta', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'buscar_lancamentos', args: '{"texto":"fulano"}' }], modelo: 'm' },
      { content: 'Qual deles?', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g, locais: { buscar_lancamentos: async () => ({ ok: true, dados: { itens: [{ ref: 'L1' }, { ref: 'L2' }], lista: '🔎 Achei estes.' } }) } });
    expect(r.texto).toBe('🔎 Achei estes.');
  });
});

describe('proposta nunca escondida (revisão E2)', () => {
  it('propor e depois outra ferramenta: a resposta é a proposta', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'propor_conta_avulsa', args: '{"nome":"X","valor":1}' }], modelo: 'm' },
      { content: null, toolCalls: [{ id: 'c2', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' },
      { content: 'Mercado R$ 400,00', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g, locais: { propor_conta_avulsa: async () => ({ ok: true, dados: { proposta: '🟡 PROPOSTA' } }) } });
    expect(r.texto).toBe('🟡 PROPOSTA');
  });
  it('rodadas esgotadas depois de propor: a resposta é a proposta', async () => {
    const chamada = { content: null, toolCalls: [{ id: 'c', nome: 'propor_conta_avulsa', args: '{"nome":"X","valor":1}' }], modelo: 'm' };
    const r = await responder(p, { ...base, groq: groqRoteiro([chamada, chamada, chamada, chamada]), locais: { propor_conta_avulsa: async () => ({ ok: true, dados: { proposta: '🟡 PROPOSTA' } }) } });
    expect(r.texto).toBe('🟡 PROPOSTA');
  });
});

describe('recusa de ação vira o motivo da ferramenta (E3)', () => {
  it('propor recusado e o modelo sem texto aproveitável: "⚠️ Não deu para lançar: <motivo>"', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'propor_gasto_dinheiro', args: '{"valor":5,"descricao":"x","categoria":"Groceries","data":"2026-10-13"}' }], modelo: 'm' },
      { content: '', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, groq: g, locais: { propor_gasto_dinheiro: async () => ({ ok: false, dados: { erro: 'data futura não vale: só de hoje até 30 dias atrás' } }) } });
    expect(r.texto).toBe('⚠️ Não deu para lançar: data futura não vale: só de hoje até 30 dias atrás.');
  });
  it('o prompt manda chamar a ferramenta mesmo com data/valor que pareçam inválidos', async () => {
    const g = groqRoteiro([{ content: 'x', toolCalls: [], modelo: 'm' }]);
    await responder(p, { ...base, groq: g });
    expect(JSON.stringify(g.vistos[0][0])).toContain('mesmo que a data ou o valor');
  });
});

describe('pendências do E1 (auditoria 13/10)', () => {
  // M3: no contexto o modelo não sabia quem tinha perguntado antes ("e eu?" de outra pessoa)
  it('M3: cada pergunta do contexto vai com o nome de quem perguntou', async () => {
    const g = groqRoteiro([{ content: 'x', toolCalls: [], modelo: 'm' }]);
    await responder(p, { ...base, groq: g, contexto: [{ pessoa: 'Matheus', pergunta: 'quanto gastei?', resposta: 'R$ 10' }] });
    expect(g.vistos[0][1]).toEqual({ role: 'user', content: 'Matheus: quanto gastei?' });
  });
  // M5: rodadas esgotadas não é "trava" (o modelo nem escreveu texto)
  it('M5: rodadas esgotadas responde com o dado montado sem marcar trava', async () => {
    const chamada = { content: null, toolCalls: [{ id: 'c', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' };
    const r = await responder(p, { ...base, groq: groqRoteiro([chamada, chamada, chamada, chamada]) });
    expect(r.texto).toContain('💰 Gasto em out/26');
    expect(r.trava).toBe(false);
  });
  // M6: com duas ferramentas e texto recusado, o fallback mostrava só a última
  it('M6: texto recusado com duas ferramentas: as duas montadas, um link só (o da última)', async () => {
    const fat = { itens: [{ banco: 'B', pessoa: 'Ariane', total: 100, vencimento: '15/10', situacao: 'a_vencer', falta: 100 }], total: 100, link: '/faturas' };
    const painel2 = async (c: string) => (c.startsWith('/api/bot/gasto') ? { ok: true, dados: gasto } : { ok: true, dados: fat });
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'a', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }, { id: 'b', nome: 'faturas', args: '{}' }], modelo: 'm' },
      { content: 'Deu R$ 999,99.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder(p, { ...base, painel: painel2, groq: g });
    expect(r.texto).toContain('💰 Gasto em out/26');
    expect(r.texto).toContain('💳 Faturas a pagar');
    expect(r.texto.match(/👉/g)).toHaveLength(1);
    expect(r.texto.endsWith('👉 https://p/faturas')).toBe(true);
  });
});
