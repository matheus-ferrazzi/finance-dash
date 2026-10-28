import { describe, expect, it } from 'vitest';
import { conferir, modeloConferente, resumoDados } from '../../src/worker/bot/conferente';
import { LimiteGroq } from '../../src/worker/bot/groq';

// 28/10 (fase 3): o conferente sem contexto, em outro modelo
const groqQue = (content: string | null | (() => never)) => {
  const vistos: any[] = [];
  return {
    vistos,
    chat: async (msgs: any, tools: any, opcoes: any) => {
      vistos.push({ msgs, tools, opcoes });
      if (typeof content === 'function') content();
      return { content: content as string | null, toolCalls: [], modelo: opcoes?.modelos?.[0] ?? 'm', tokens: 120 };
    },
  };
};
const base = { modelos: ['m2'], pergunta: 'quanto gastei?', dados: [{ total: 10 }], resposta: '💰 R$ 10,00' };

describe('conferir', () => {
  it('aprovado', async () => {
    const g = groqQue('{"aprovado": true}');
    expect(await conferir({ ...base, groq: g })).toEqual({ aprovado: true, problemas: [], tokens: 120, esperaMs: 0, modelo: 'm2' });
    expect(g.vistos[0].tools).toEqual([]);
    expect(g.vistos[0].opcoes.modelos).toEqual(['m2']);
    const user = String(g.vistos[0].msgs[1].content);
    expect(user).toContain('Pergunta:');
    expect(user).toContain('Dados:');
    expect(user).toContain('Resposta:');
  });
  it('reprovado, mesmo dentro de bloco de código', async () => {
    const v = await conferir({ ...base, groq: groqQue('```json\n{"aprovado": false, "problemas": ["rótulo trocado"]}\n```') });
    expect([v.aprovado, v.problemas]).toEqual([false, ['rótulo trocado']]);
  });
  it('fora do formato: reprova (nunca aprova por omissão)', async () => {
    for (const c of ['tudo certo!', '{}', '{"aprovado": "sim"}', '', null]) {
      const v = await conferir({ ...base, groq: groqQue(c) });
      expect([v.aprovado, v.problemas], String(c)).toEqual([false, ['conferente não respondeu no formato']]);
    }
  });
  it('sem cota ou erro: reprova como indisponível, sem lançar', async () => {
    const v = await conferir({ ...base, groq: groqQue(() => { throw new LimiteGroq(false, 700_000); }) });
    expect([v.aprovado, v.problemas]).toEqual([false, ['conferente indisponível']]);
    const sem = await conferir({ ...base, modelos: [], groq: groqQue('{"aprovado": true}') });
    expect([sem.aprovado, sem.problemas]).toEqual([false, ['conferente indisponível']]);
  });
  it('soma as esperas', async () => {
    const g = { chat: async (_m: any, _t: any, o: any) => { o.aoEsperar(3000); return { content: '{"aprovado": true}', toolCalls: [], modelo: 'm2', tokens: 1 }; } };
    expect((await conferir({ ...base, groq: g })).esperaMs).toBe(3000);
  });
});

describe('modeloConferente e resumoDados', () => {
  it('outro modelo que não o que escreveu', () => {
    expect(modeloConferente('m1', ['m1', 'm2'])).toEqual(['m2']);
    expect(modeloConferente('m2', ['m1', 'm2'])).toEqual(['m1']);
    expect(modeloConferente('m1', ['m1'])).toEqual([]);
    expect(modeloConferente(null, ['m1', 'm2'])).toEqual(['m2']);
  });
  it('resumo sem link, lista, proposta e svg; cortado', () => {
    const r = resumoDados([{ total: 1, link: '/x', lista: 'L', proposta: 'P', svg: '<svg>', itens: [{ nome: 'a', link: '/y' }] }]);
    expect(r).toBe('[{"total":1,"itens":[{"nome":"a"}]}]');
    expect(resumoDados([{ x: 'a'.repeat(100) }], 50)).toHaveLength(50);
    expect(resumoDados([{ x: 'a'.repeat(100) }], 50).endsWith('…')).toBe(true);
  });
});
