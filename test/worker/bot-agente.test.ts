import { describe, expect, it } from 'vitest';
import { FALHA, responder, SEGURA, SEM_FERRAMENTA, textoEspera, textoLimite } from '../../src/worker/bot/agente';
import { LimiteGroq } from '../../src/worker/bot/groq';

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
  it('27/10: soma os tokens de todas as rodadas', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm', tokens: 3000 },
      { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 3500 },
    ]);
    expect((await responder(p, { ...base, groq: g })).tokens).toBe(6500);
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
    // 27/10: dois passos — sem ferramenta, o agente refaz uma vez com todas (fase 1)
    const r = await responder(p, { ...base, groq: groqRoteiro([{ content: 'Vai chover amanhã.', toolCalls: [], modelo: 'm' }, { content: 'Vai chover amanhã.', toolCalls: [], modelo: 'm' }]) });
    expect(r.texto).toBe(SEM_FERRAMENTA);
    expect(r.semFerramenta).toBe(true);
  });
  it('Groq falhou: mensagem de falha e erro registrado', async () => {
    const r = await responder(p, { ...base, groq: { chat: async () => { throw new Error('Groq: m: HTTP 503'); } } });
    expect(r.texto).toBe(FALHA);
    expect(r.erro).toBe('Groq: m: HTTP 503');
  });
  // 28/10 (fase 3): 6 rodadas (situação, consulta, cálculo e resposta)
  it('no máximo 6 rodadas de ferramenta; depois usa o texto montado da última', async () => {
    const chamada = { content: null, toolCalls: [{ id: 'c', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm' };
    const g = groqRoteiro([chamada, chamada, chamada, chamada, chamada, chamada, chamada]);
    const r = await responder(p, { ...base, groq: g });
    expect(g.vistos.length).toBe(6);
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
    const r = await responder(p, { ...base, groq: groqRoteiro([chamada, chamada, chamada, chamada, chamada, chamada]), locais: { propor_conta_avulsa: async () => ({ ok: true, dados: { proposta: '🟡 PROPOSTA' } }) } });
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
    // 27/10: a regra de proposta vai com o pedido de lançar ou mudar (escolha.ts), não com uma pergunta de gasto
    const g = groqRoteiro([{ content: 'x', toolCalls: [], modelo: 'm' }]);
    await responder({ ...p, texto: 'lança 30 de feira em dinheiro amanhã' }, { ...base, groq: g });
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
    const r = await responder(p, { ...base, groq: groqRoteiro([chamada, chamada, chamada, chamada, chamada, chamada]) });
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

// 22/10: explicar uma mensagem citada — os números dela valem como dado conferido (sem ferramenta); número que não
// está nela continua barrado
describe('mensagem citada', () => {
  const citada = '🔴 Ritmo de R$ 162,25/dia, acima do que cabe: nesse passo fecha em *-R$ 122,22*';
  const pc = { id: 'X', pessoa: 'Matheus', texto: 'por que vermelho?', citada };
  it('explica com os números da mensagem, sem ferramenta', async () => {
    const g = groqRoteiro([{ content: '🔴 Vocês gastam R$ 162,25 por dia; nesse passo o mês fecha em -R$ 122,22.', toolCalls: [], modelo: 'm' }]);
    const r = await responder(pc, { ...base, groq: g });
    expect(r.texto).toBe('🔴 Vocês gastam R$ 162,25 por dia; nesse passo o mês fecha em -R$ 122,22.');
    expect(r.semFerramenta).toBe(false);
    // o texto citado vai para o modelo junto com a pergunta
    expect(JSON.stringify(g.vistos[0].at(-1))).toContain('nesse passo fecha em');
  });
  it('número que não está na mensagem nem em ferramenta: não passa', async () => {
    const r = await responder(pc, { ...base, groq: groqRoteiro([{ content: '🔴 Vocês gastaram R$ 999,00.', toolCalls: [], modelo: 'm' }]) });
    expect(r.texto).not.toContain('999');
  });
});

// 27/10: com só o texto citado o modelo explicava sem conta (e sem chamar ferramenta): a conta vai junto, antes dele
describe('mensagem citada com a conta', () => {
  const diario = '🔴 *Mês no vermelho* · out/26 fecha em -R$ 70,39\n\n☀️ *Bom dia!*\n\n💸 Hoje dá pra gastar *R$ 27,52* no débito e PIX';
  const explicacao = ['Origem: nas contas tem R$ 137,60 e não entra mais nada este mês.', 'Sobra para o dia a dia até o fim do mês: R$ 137,60.'];
  const pc = { id: 'X', pessoa: 'Matheus', texto: 'por que tá no vermelho?', citada: diario.replace(/\*/g, '') };
  const locais = (m: object) => ({ mensagens_do_zeca: async () => ({ ok: true, dados: { mensagens: [m] } }) });
  it('diário com a conta guardada: a conta daquela hora vai com a pergunta e os números dela valem', async () => {
    const g = groqRoteiro([{ content: '👉 Nas contas tem R$ 137,60; dá R$ 27,52 por dia.', toolCalls: [], modelo: 'm' }]);
    const r = await responder(pc, { ...base, groq: g, locais: locais({ tipo: 'diario', quando: '27/10 08:00', texto: diario, explicacao }) });
    expect(r.texto).toBe('👉 Nas contas tem R$ 137,60; dá R$ 27,52 por dia.');
    const enviado = JSON.stringify(g.vistos[0].at(-1));
    expect(enviado).toContain('Conta desta mensagem');
    expect(enviado).toContain('nas contas tem R$ 137,60');
  });
  it('diário sem a conta (de antes): a conta de agora, e número da mensagem (outra hora) não passa', async () => {
    const vistos: string[] = [];
    const painel = async (c: string) => { vistos.push(c); return { ok: true, dados: { explicacao } }; };
    const g = groqRoteiro([{ content: '👉 Dá R$ 27,52 por dia.', toolCalls: [], modelo: 'm' }]);
    const r = await responder(pc, { ...base, groq: g, painel, locais: locais({ tipo: 'diario', quando: '27/10 08:00', texto: diario }) });
    // 28/10 (fase 3): no vermelho, o código também busca o que puxou o ritmo
    expect(vistos).toEqual(['/api/bot/situacao', '/api/bot/consulta?o_que=dia_a_dia&periodo=este_mes&agrupar=loja&limite=3']);
    expect(JSON.stringify(g.vistos[0].at(-1))).toContain('Conta de AGORA');
    expect(r.trava).toBe(true);
    expect(r.texto).toBe(explicacao.map((l) => `👉 ${l}`).join('\n'));
  });
  it('situacao_mes com um "fecha em" no lugar do outro: barrado, responde com as frases prontas e o link', async () => {
    const sit = { fechaCom: -72.86, nessePassoFechaEm: -818.33, ritmoAtualDia: 190.69, dapraGastarHoje: 27.02, diasRestantes: 4, mesLabel: 'out/26', link: '/',
      explicacao: ['Nesse passo: … fecha em -R$ 818,33.', 'Pela média: … fecha em -R$ 72,86.'] };
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'situacao_mes', args: '{}' }], modelo: 'm' },
      { content: '👉 O ritmo de R$ 190,69, se mantido, fecha em -R$ 72,86.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ id: 'X', pessoa: 'Matheus', texto: 'por que só dá isso?' }, { ...base, groq: g, painel: async () => ({ ok: true, dados: sit }) });
    expect(r.trava).toBe(true);
    expect(r.texto).toBe('👉 Nesse passo: … fecha em -R$ 818,33.\n👉 Pela média: … fecha em -R$ 72,86.\n\n👉 https://p/');
  });
  it('mensagem que não é o diário: sem conta, explica com o texto dela', async () => {
    const meta = '🟡 *Meta de gastos quase no limite* · 83% usados';
    const g = groqRoteiro([{ content: '👉 Já foram 83% da meta.', toolCalls: [], modelo: 'm' }]);
    const r = await responder({ ...pc, citada: meta }, { ...base, groq: g, painel: async () => { throw new Error('não deveria'); },
      locais: locais({ tipo: 'meta', quando: '27/10 09:00', texto: meta }) });
    expect(r.texto).toBe('👉 Já foram 83% da meta.');
    expect(JSON.stringify(g.vistos[0].at(-1))).not.toContain('Conta');
  });
});

describe('27/10: ferramentas e prompt pela pergunta (fase 1)', () => {
  it('pergunta de gasto não leva as ferramentas de proposta nem o bloco de mensagens', async () => {
    const vistas: any[] = [];
    const g = { chat: async (msgs: any, tools: any) => { vistas.push({ msgs, tools }); return { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 0 }; } };
    await responder(p, { ...base, groq: g });
    expect(vistas[0].tools.map((t: any) => t.function.name)).not.toContain('propor_categoria');
    expect(vistas[0].msgs[0].content).not.toContain('Mensagem citada');
  });
});

describe('27/10: sem ferramenta no conjunto reduzido, refaz com tudo (fase 1)', () => {
  it('refaz com tudo e responde; tokens das duas somam', async () => {
    const vistas: string[][] = [];
    const passos = [
      { content: 'não sei', toolCalls: [], modelo: 'm', tokens: 100 },
      { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm', tokens: 200 },
      { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 300 },
    ];
    let i = 0;
    const g = { chat: async (_m: any, tools: any) => { vistas.push(tools.map((t: any) => t.function.name)); return passos[i++]; } };
    const r = await responder({ ...p, texto: 'aquele pix do fulano é mercado' }, { ...base, groq: g });
    expect(vistas[0]).not.toContain('propor_categoria');
    expect(vistas[1]).toContain('propor_categoria');
    expect(r.texto).toContain('R$ 400,00');
    expect(r.tokens).toBe(600);
  });
  it('a refeita com tudo também sem ferramenta: SEM_FERRAMENTA, sem terceira chamada', async () => {
    let n = 0;
    const g = { chat: async () => { n++; return { content: 'não sei', toolCalls: [], modelo: 'm', tokens: 0 }; } };
    expect((await responder({ ...p, texto: 'qual a capital da França?' }, { ...base, groq: g })).texto).toBe(SEM_FERRAMENTA);
    expect(n).toBe(2);
  });
});

// 28/10 (fase 2): a espera da cota passa pelo agente
describe('fase 2: espera e limite do Groq', () => {
  it('esperas de várias rodadas somam em esperaMs e cada uma chega ao aoEsperar', async () => {
    const passos = [
      { espera: 15000, r: { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm', tokens: 0 } },
      { espera: 5000, r: { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 0 } },
    ];
    const g = { chat: async (_m: any, _t: any, o?: { aoEsperar?: (ms: number) => void }) => { const x = passos.shift()!; o?.aoEsperar?.(x.espera); return x.r; } };
    const avisos: number[] = [];
    const r = await responder(p, { ...base, groq: g, aoEsperar: (ms) => avisos.push(ms) });
    expect([r.esperaMs, avisos, r.erro]).toEqual([20000, [15000, 5000], null]);
  });
  it('LimiteGroq vira o texto do limite, com erro registrado e sem a refeita', async () => {
    let chamadas = 0;
    const g = { chat: async () => { chamadas++; throw new LimiteGroq(true, 1_801_000); } };
    const r = await responder({ ...p, texto: 'oi tudo bem' }, { ...base, groq: g as any });
    expect(r.texto).toBe(textoLimite(new LimiteGroq(true, 1_801_000)));
    expect(r.texto).toContain('31 minutos');
    expect(r.erro).toMatch(/^limite do Groq/);
    expect(chamadas).toBe(1);
  });
  it('textoEspera e textoLimite', () => {
    expect(textoEspera(15_000)).toBe('⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de 1 minuto.');
    expect(textoEspera(150_000)).toBe('⏳ Estou no limite do serviço de respostas agora. Respondo em cerca de 3 minutos.');
    expect(textoLimite(new LimiteGroq(false, 721_000))).toBe('⚠️ O serviço de respostas está no limite e só libera daqui a cerca de 13 minutos. Manda a pergunta de novo depois disso.');
    expect(textoLimite(new LimiteGroq(true, 7_200_000))).toBe('⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo daqui a cerca de 2 horas.');
    expect(textoLimite(new LimiteGroq(true, null))).toBe('⚠️ Cheguei ao limite diário do serviço de respostas. Manda a pergunta de novo mais tarde.');
  });
});

// 28/10 (fase 3): o analista consulta, calcula e escreve com os números das duas
describe('fase 3: analista', () => {
  it('consultar → calcular → texto com o resultado: passa na trava; prompt de analista', async () => {
    const consulta = { regra: 'dia a dia: débito e PIX', periodo: 'out/26', pessoa: 'casal', total: 3333.15, totalDinheiro: 0, qtd: 40, linhas: [{ chave: 'MERCADO A', valor: 900, qtd: 3 }], cortadas: 0 };
    const pnl = async (c: string) => (c.startsWith('/api/bot/consulta') ? { ok: true, dados: consulta } : { ok: false, dados: { erro: 'x' } });
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'consultar', args: '{"o_que":"dia_a_dia","periodo":"este_mes","agrupar":"loja"}' }], modelo: 'm' },
      { content: null, toolCalls: [{ id: 'c2', nome: 'calcular', args: '{"expressao":"3333.15 / 27"}' }], modelo: 'm' },
      { content: '🔥 O dia a dia somou R$ 3.333,15, R$ 123,45 por dia; o maior foi MERCADO A com R$ 900,00.', toolCalls: [], modelo: 'm' },
    ]);
    const { criarLocais } = await import('../../src/worker/bot/locais');
    const locais = criarLocais({ pessoa: 'Ariane', hoje: '2026-10-28', refs: new Map(), painel: pnl, painelPost: pnl, acoes: { criar: async () => 1 } });
    const r = await responder({ ...p, texto: 'pq o ritmo está alto?' }, { ...base, painel: pnl, groq: g, locais });
    expect(r.trava).toBe(false);
    expect(r.texto).toContain('R$ 123,45');
    expect(r.ferramentas.map((f) => f.nome)).toEqual(['consultar', 'calcular']);
    const sistema = String(g.vistos[0][0].content);
    expect(sistema).toContain('calcular');
    expect(sistema).toContain('dia_a_dia');
    expect(sistema).not.toContain('copie as frases');
    expect(sistema).toContain('até 12 linhas');
  });
});

// 28/10 (fase 3): resposta com número passa pelo conferente; reprovou duas vezes, vai a segura
describe('fase 3: conferente no agente', () => {
  const chamaGasto = { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm1', tokens: 10 };
  const texto = (t: string) => ({ content: t, toolCalls: [], modelo: 'm1', tokens: 10 });
  const conferirRoteiro = (vs: { aprovado: boolean; problemas?: string[] }[]) => {
    const vistos: any[] = [];
    return { vistos, fn: async (x: any) => { vistos.push(x); const v = vs.shift()!; return { aprovado: v.aprovado, problemas: v.problemas ?? [], tokens: 50, esperaMs: 0, modelo: 'm2' }; } };
  };
  const deps = (g: any, c: any) => ({ ...base, groq: g, conferir: c.fn, modelos: ['m1', 'm2'] });

  it('aprovado de primeira', async () => {
    const c = conferirRoteiro([{ aprovado: true }]);
    const r = await responder(p, deps(groqRoteiro([chamaGasto, texto('🛒 Mercado: R$ 400,00 este mês.')]), c));
    expect([r.conferencia, r.texto.startsWith('🛒 Mercado: R$ 400,00'), c.vistos.length, r.tokensConferente]).toEqual(['aprovada', true, 1, 50]);
    expect(c.vistos[0].modelos).toEqual(['m2']);
    expect(c.vistos[0].dados).toEqual([gasto]);
  });
  it('reprovado e reescrito: aprovado na reescrita', async () => {
    const c = conferirRoteiro([{ aprovado: false, problemas: ['o total é do casal, não da Ariane'] }, { aprovado: true }]);
    const g = groqRoteiro([chamaGasto, texto('🛒 Você gastou R$ 400,00 no mercado.'), texto('🛒 O casal gastou R$ 400,00 no mercado.')]);
    const r = await responder(p, deps(g, c));
    expect(r.conferencia).toBe('reescrita');
    expect(r.texto).toContain('O casal gastou');
    expect(r.problemas).toEqual(['o total é do casal, não da Ariane']);
    expect(JSON.stringify(g.vistos[2])).toContain('o total é do casal');
  });
  it('reprovado duas vezes: a segura, nunca o texto reprovado', async () => {
    const c = conferirRoteiro([{ aprovado: false, problemas: ['a'] }, { aprovado: false, problemas: ['b'] }]);
    const r = await responder(p, deps(groqRoteiro([chamaGasto, texto('🛒 R$ 400,00 é tudo do mês.'), texto('🛒 R$ 400,00 no mês todo.')]), c));
    expect(r.conferencia).toBe('segura');
    expect(r.texto.startsWith(SEGURA)).toBe(true);
    expect(r.texto).toContain('💰 Gasto em out/26');
    expect(r.texto).not.toContain('é tudo do mês');
    expect(r.problemas).toEqual(['a', 'b']);
    expect(r.erro).toBeNull();
  });
  it('reescrita que fura a trava: segura, sem segunda conferência', async () => {
    const c = conferirRoteiro([{ aprovado: false, problemas: ['a'] }]);
    const r = await responder(p, deps(groqRoteiro([chamaGasto, texto('🛒 R$ 400,00.'), texto('🛒 R$ 999,99.')]), c));
    expect([r.conferencia, c.vistos.length]).toEqual(['segura', 1]);
  });
  it('sem número ou texto do sistema: não confere', async () => {
    const c = conferirRoteiro([]);
    const g = groqRoteiro([{ content: null, toolCalls: [{ id: 'c1', nome: 'trilha', args: '{}' }], modelo: 'm1' }, texto('🧭 Vocês estão na fase de sobrar.')]);
    const pnl = async () => ({ ok: true, dados: { fase: 2, titulo: 'Sobrar', proximoPasso: 'x', reserva: { aplicado: 0, meta: 0 } } });
    const r = await responder({ ...p, texto: 'em que fase estamos?' }, { ...deps(g, c), painel: pnl });
    expect([r.conferencia, c.vistos.length]).toEqual([null, 0]);
    const r2 = await responder({ ...p, texto: 'põe 50 de dentista nas contas' }, { ...deps(groqRoteiro([
      { content: null, toolCalls: [{ id: 'c', nome: 'propor_conta_avulsa', args: '{"nome":"Dentista","valor":50}' }], modelo: 'm1' }, texto('ok R$ 50,00')]), c),
      locais: { propor_conta_avulsa: async () => ({ ok: true, dados: { proposta: '🟡 PROPOSTA R$ 50,00' } }) } });
    expect([r2.texto, c.vistos.length]).toEqual(['🟡 PROPOSTA R$ 50,00', 0]);
  });
  it('mensagem citada sem ferramenta: o conferente recebe o texto citado', async () => {
    const c = conferirRoteiro([{ aprovado: true }]);
    const citada = '🔴 Nesse passo fecha em -R$ 818,33';
    const r = await responder({ ...p, texto: 'por quê?', citada }, deps(groqRoteiro([texto('👉 Nesse passo, no ritmo de agora, fecha em -R$ 818,33.')]), c));
    expect(r.conferencia).toBe('aprovada');
    expect(JSON.stringify(c.vistos[0].dados)).toContain('818,33');
  });
  // revisão: sem conferente não há problema para corrigir — reescrever só gastaria cota na hora em que ela falta
  it('conferente indisponível: a segura direto, sem reescrita e sem erro', async () => {
    const c = conferirRoteiro([{ aprovado: false, problemas: ['conferente indisponível'] }]);
    const g = groqRoteiro([chamaGasto, texto('🛒 R$ 400,00.'), texto('🛒 R$ 400,00.')]);
    const r = await responder(p, deps(g, c));
    expect([r.conferencia, r.erro, g.vistos.length, c.vistos.length]).toEqual(['segura', null, 2, 1]);
    expect(r.texto.startsWith(SEGURA)).toBe(true);
  });
});

// 28/10 (fase 3, conjunto de 20 perguntas em produção): o que reprovou
describe('fase 3: correções do conjunto de perguntas', () => {
  const diario = '🔴 Mês no vermelho · out/26 fecha em -R$ 70,39';
  const explicacao = ['Origem: nas contas tem R$ 137,60 e não entra mais nada este mês.', 'Sobra para o dia a dia até o fim do mês: R$ 137,60.'];
  it('citada + calcular + texto barrado: a conta da mensagem, nunca "Não sei responder isso"; o texto barrado fica nos problemas', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'calcular', args: '{"expressao":"137.6 / 5"}' }], modelo: 'm' },
      { content: '👉 Sobram R$ 999,99.', toolCalls: [], modelo: 'm' },
    ]);
    const { criarLocais } = await import('../../src/worker/bot/locais');
    const locais = { ...criarLocais({ pessoa: 'Matheus', hoje: '2026-10-28', refs: new Map(), painel, painelPost: painel, acoes: { criar: async () => 1 } }),
      mensagens_do_zeca: async () => ({ ok: true, dados: { mensagens: [{ tipo: 'diario', quando: '28/10 08:00', texto: diario, explicacao }] } }) };
    const r = await responder({ id: 'X', pessoa: 'Matheus', texto: 'por quê?', citada: diario }, { ...base, groq: g, locais });
    expect(r.texto).toBe(explicacao.map((l) => `👉 ${l}`).join('\n'));
    expect(r.trava).toBe(true);
    expect(r.problemas).toEqual(['trava barrou: 👉 Sobram R$ 999,99.']);
  });
  it('compra + situação, texto barrado: o montado das duas (a resposta da compra não some)', async () => {
    const sim = { valorTotal: 3000, parcelas: 10, parcela: 300, cabe: false, cabeProvavel: false, mesQueFura: 'nov/26', aprofunda: 300, link: '/previsibilidade' };
    const sit = { fechaCom: -6.66, dapraGastarHoje: 22.22, ritmoAtualDia: 123.45, diasRestantes: 3, mesLabel: 'out/26', link: '/', explicacao: ['Origem: R$ 99,90.'] };
    const pnl = async (c: string) => ({ ok: true, dados: c.startsWith('/api/bot/simular') ? sim : sit });
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'a', nome: 'simular_compra', args: '{"valor_total":3000,"parcelas":10}' }, { id: 'b', nome: 'situacao_mes', args: '{}' }], modelo: 'm' },
      { content: '📉 Não cabe: R$ 999,99.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ ...p, texto: 'dá pra comprar uma TV de 3 mil em 10x?' }, { ...base, painel: pnl, groq: g });
    expect(r.texto).toContain('🛒 Compra de');
    expect(r.texto).toContain('nov/26');
  });
  it('prompt: sem nome de ferramenta na resposta; a "Origem" não é regra de toda resposta', async () => {
    const g = groqRoteiro([{ content: 'oi', toolCalls: [], modelo: 'm' }, { content: 'oi', toolCalls: [], modelo: 'm' }]);
    await responder(p, { ...base, groq: g });
    const sistema = String(g.vistos[0][0].content);
    expect(sistema).toContain('Não escreva nomes de ferramentas');
    expect(sistema).not.toContain('Comece pela "Origem"');
    expect(sistema).toContain('Use o mínimo de ferramentas');
  });
});

describe('fase 3: rodada 2 do conjunto', () => {
  it('explicar o diário com o texto barrado: a conta guardada do diário mais recente, não a lista de mensagens', async () => {
    const explicacao = ['Origem: nas contas tem R$ 137,60.', 'Sobra para o dia a dia até o fim do mês: R$ 137,60.'];
    const ms = [
      { tipo: 'diario', quando: '27/10 08:00', texto: 'velho', explicacao: ['Origem: nas contas tem R$ 1,00.'] },
      { tipo: 'meta', quando: '27/10 09:00', texto: 'meta' },
      { tipo: 'diario', quando: '28/10 08:00', texto: 'novo', explicacao },
    ];
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'mensagens_do_zeca', args: '{}' }], modelo: 'm' },
      { content: '👉 123,45 × 4 = 493,80', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ ...p, texto: 'me explica o diário de hoje' }, { ...base, groq: g, locais: { mensagens_do_zeca: async () => ({ ok: true, dados: { mensagens: ms } }) } });
    expect(r.texto).toBe(explicacao.map((l) => `👉 ${l}`).join('\n'));
    expect(r.trava).toBe(true);
  });
  it('prompt: no vermelho ou ritmo alto, buscar o que puxou o ritmo é obrigatório', async () => {
    const g = groqRoteiro([{ content: 'oi', toolCalls: [], modelo: 'm' }, { content: 'oi', toolCalls: [], modelo: 'm' }]);
    await responder(p, { ...base, groq: g });
    const sistema = String(g.vistos[0][0].content);
    expect(sistema).toContain('quais gastos puxaram o ritmo');
    expect(sistema).toContain('R$ 1.234,56');
  });
});

it('fase 3: "o último alerta" barrado não vira a conta do diário', async () => {
  const ms = [{ tipo: 'diario', quando: '28/10 08:00', texto: 'd', explicacao: ['Origem: R$ 1,00.'] }, { tipo: 'alerta-meta', quando: '28/10 08:05', texto: '🔴 Meta estourada · R$ 10,00 acima' }];
  const g = groqRoteiro([
    { content: null, toolCalls: [{ id: 'c1', nome: 'mensagens_do_zeca', args: '{}' }], modelo: 'm' },
    { content: '👉 R$ 999,99', toolCalls: [], modelo: 'm' },
  ]);
  const r = await responder({ ...p, texto: 'me explica o ultimo alerta' }, { ...base, groq: g, locais: { mensagens_do_zeca: async () => ({ ok: true, dados: { mensagens: ms } }) } });
  expect(r.texto).not.toContain('Origem: R$ 1,00');
  expect(r.texto).toContain('O que mandei');
});

// 28/10 (rodada 3): o modelo não buscava o que puxou o ritmo nem com a regra obrigatória — o código busca e entrega
describe('fase 3: o porquê do vermelho vem do código', () => {
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sit = { fechaCom: -6.66, nessePassoFechaEm: -555.55, ritmoAtualDia: 123.45, dapraGastarHoje: 22.22, diasRestantes: 3, mesLabel: 'out/26', link: '/',
    explicacao: ['Origem: nas contas tem R$ 99,90.', 'Ritmo: R$ 123,45 por dia.'] };
  const cons = { regra: 'dia a dia', periodo: 'out/26', pessoa: 'casal', total: 3333.15, totalDinheiro: 0, qtd: 40, cortadas: 10,
    linhas: [{ chave: 'MERCADO A', valor: 900, qtd: 3 }, { chave: 'POSTO B', valor: 400, qtd: 2 }, { chave: 'LOJA C', valor: 300, qtd: 1 }] };
  const linha = `👉 O que mais puxou o ritmo do dia a dia este mês: MERCADO A (${brl(900)}), POSTO B (${brl(400)}) e LOJA C (${brl(300)}).`;
  const painelR = (vistos: string[]) => async (c: string) => {
    vistos.push(c);
    if (c.startsWith('/api/bot/consulta')) return { ok: true, dados: cons };
    if (c.startsWith('/api/bot/situacao')) return { ok: true, dados: sit };
    return { ok: false, dados: { erro: 'x' } };
  };
  it('pergunta do vermelho: o código consulta o dia a dia, entrega ao modelo e, barrado, a conta vem com o que puxou', async () => {
    const vistos: string[] = [];
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'situacao_mes', args: '{}' }], modelo: 'm' },
      { content: '😕 Se mantiver o ritmo fecha em -R$ 6,66.', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ ...p, texto: 'pq estamos caminhando para o vermelho?' }, { ...base, painel: painelR(vistos), groq: g });
    expect(vistos[0]).toBe('/api/bot/consulta?o_que=dia_a_dia&periodo=este_mes&agrupar=loja&limite=3');
    expect(JSON.stringify(g.vistos[0].find((m: any) => m.role === 'user'))).toContain('MERCADO A');
    expect(r.texto).toBe(`${sit.explicacao.map((l) => `👉 ${l}`).join('\n')}\n${linha}\n\n👉 https://p/`);
    expect(r.trava).toBe(true);
  });
  it('o modelo pode citar os gastos que puxaram (passam na trava)', async () => {
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'situacao_mes', args: '{}' }], modelo: 'm' },
      { content: '🔥 O ritmo está em R$ 123,45 por dia; o que mais puxou foi MERCADO A (R$ 900,00).', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ ...p, texto: 'por que o ritmo tá alto?' }, { ...base, painel: painelR([]), groq: g });
    expect(r.trava).toBe(false);
    expect(r.texto).toContain('MERCADO A (R$ 900,00)');
  });
  it('citando o diário, sem ferramenta e barrado: a conta da mensagem e o que puxou', async () => {
    const diario = '🔴 Mês no vermelho · out/26 fecha em -R$ 70,39';
    const explicacao = ['Origem: nas contas tem R$ 137,60.'];
    const g = groqRoteiro([{ content: '👉 Sobram R$ 999,99.', toolCalls: [], modelo: 'm' }]);
    const r = await responder({ id: 'X', pessoa: 'Matheus', texto: 'por quê?', citada: diario },
      { ...base, painel: painelR([]), groq: g, locais: { mensagens_do_zeca: async () => ({ ok: true, dados: { mensagens: [{ tipo: 'diario', quando: '28/10 08:00', texto: diario, explicacao }] } }) } });
    expect(r.texto).toBe(`👉 Origem: nas contas tem R$ 137,60.\n${linha}`);
  });
  it('pergunta que não é do vermelho: nenhuma consulta extra; consulta que falha: segue como antes', async () => {
    const vistos: string[] = [];
    await responder(p, { ...base, painel: painelR(vistos), groq: groqRoteiro([{ content: 'oi', toolCalls: [], modelo: 'm' }, { content: 'oi', toolCalls: [], modelo: 'm' }]) });
    expect(vistos).toEqual([]);
    const falha = async (c: string) => (c.startsWith('/api/bot/situacao') ? { ok: true, dados: sit } : { ok: false, dados: { erro: 'x' } });
    const g = groqRoteiro([
      { content: null, toolCalls: [{ id: 'c1', nome: 'situacao_mes', args: '{}' }], modelo: 'm' },
      { content: '😕 R$ 999,99', toolCalls: [], modelo: 'm' },
    ]);
    const r = await responder({ ...p, texto: 'pq tá no vermelho?' }, { ...base, painel: falha, groq: g });
    expect(r.texto).toBe(`${sit.explicacao.map((l) => `👉 ${l}`).join('\n')}\n\n👉 https://p/`);
  });
});
