import { describe, expect, it } from 'vitest';
import { criarLocais } from '../../src/worker/bot/locais';

const itens = [{ id: 'T1', data: '10/10', valor: 50, descricao: 'PIX FULANO', pessoa: 'Matheus', categoria: 'Transferências' }, { id: 'T2', data: '03/10', valor: 50, descricao: 'PIX FULANO', pessoa: 'Ariane', categoria: 'Transferências' }];
function montar(busca = itens) {
  const criadas: any[] = []; const posts: any[] = []; const refs = new Map();
  const locais = criarLocais({
    pessoa: 'Matheus', hoje: '2026-10-12', refs,
    painel: async () => ({ ok: true, dados: { itens: busca } }),
    painelPost: async (c, corpo) => { posts.push([c, corpo]); return { ok: true, dados: { tipo: 'doc', afetados: 3, nome: 'FULANO' } }; },
    acoes: { criar: async (...a: any[]) => { criadas.push(a); return 7; } },
  });
  return { locais, criadas, posts, refs };
}

function criarLocaisZero() {
  const criadas: any[] = []; const refs = new Map();
  const locais = criarLocais({ pessoa: 'Matheus', hoje: '2026-10-12', refs,
    painel: async () => ({ ok: true, dados: { itens } }), painelPost: async () => ({ ok: true, dados: { tipo: 'lancamento', afetados: 0, nome: 'x' } }),
    acoes: { criar: async (...a: any[]) => { criadas.push(a); return 1; } } });
  return { locais, criadas };
}

describe('executores locais', () => {
  it('busca guarda refs L1.. (sem id para o modelo) e devolve a lista quando há mais de um', async () => {
    const m = montar();
    const r = await m.locais.buscar_lancamentos({ texto: 'fulano' });
    expect(r.dados.itens.map((x: any) => x.ref)).toEqual(['L1', 'L2']);
    expect(JSON.stringify(r.dados)).not.toContain('T1');
    expect(r.dados.lista).toContain('1) 10/10 PIX FULANO');
    expect(m.refs.get('Matheus').itens.get('L2').id).toBe('T2');
  });
  it('propor_categoria: ref da busca → prévia → proposta com o texto montado', async () => {
    const m = montar();
    await m.locais.buscar_lancamentos({ texto: 'fulano' });
    const r = await m.locais.propor_categoria({ ref: 'L1', categoria: 'Groceries', escopo: 'pessoa' });
    expect(m.posts[0]).toEqual(['/api/bot/previa', { idTransacao: 'T1', escopo: 'pessoa', categoria: 'Groceries' }]);
    expect(m.criadas[0]).toEqual(['Matheus', 'categoria', { tipo: 'doc', idTransacao: 'T1', categoria: 'Groceries' }, '3 lançamento(s) → Mercado']);
    expect(r.dados.proposta).toContain('🟡 Mudar *3* lançamento(s) para *Mercado*');
  });
  it('ref inventada (L9) ou sem busca: erro, nenhuma proposta', async () => {
    const m = montar();
    expect(await m.locais.propor_categoria({ ref: 'L9', categoria: 'Groceries', escopo: 'este' })).toMatchObject({ ok: false });
    expect(m.criadas).toEqual([]);
  });
  it('avulsa: valida valor, mês e pessoa; padrão = quem pediu e este mês', async () => {
    const m = montar();
    const r = await m.locais.propor_conta_avulsa({ nome: 'Dentista', valor: 150 });
    expect(m.criadas[0]).toEqual(['Matheus', 'avulsa', { mes: '2026-10', nome: 'Dentista', valor: 150, responsavel: 'Matheus' }, expect.stringContaining('Dentista')]);
    expect(r.dados.proposta).toContain('🟡 Pôr a conta avulsa');
    expect(await m.locais.propor_conta_avulsa({ nome: 'X', valor: 0 })).toMatchObject({ ok: false });
    expect(await m.locais.propor_conta_avulsa({ nome: 'X', valor: 10, mes: '2026-12' })).toMatchObject({ ok: false });
    expect(await m.locais.propor_conta_avulsa({ nome: 'X', valor: 10, mes: '2026-11', pessoa: 'Ariane' })).toMatchObject({ ok: true });
  });
  it('revisão E2: ref de busca com mais de 5 min é recusada; prévia sem efeito vira erro', async () => {
    const m = montar();
    await m.locais.buscar_lancamentos({ texto: 'fulano' });
    m.refs.get('Matheus').quando -= 6 * 60_000;
    expect(await m.locais.propor_categoria({ ref: 'L1', categoria: 'Groceries', escopo: 'este' })).toMatchObject({ ok: false });
    const z = criarLocaisZero();
    await z.locais.buscar_lancamentos({ texto: 'fulano' });
    expect(await z.locais.propor_categoria({ ref: 'L1', categoria: 'Groceries', escopo: 'este' })).toMatchObject({ ok: false, dados: { erro: expect.stringContaining('já está') } });
    expect(z.criadas).toEqual([]);
  });
});

describe('gasto em dinheiro (E3)', () => {
  it('valida e cria a proposta; padrão hoje e quem pediu; recusa futuro, > 30 dias, valor e descrição fora', async () => {
    const m = montar();
    const r = await m.locais.propor_gasto_dinheiro({ valor: 50, descricao: 'feira', categoria: 'Groceries' });
    expect(m.criadas[0]).toEqual(['Matheus', 'dinheiro', { data: '2026-10-12', valor: 50, descricao: 'feira', categoria: 'Groceries', responsavel: 'Matheus' }, expect.stringContaining('feira')]);
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(r.dados.proposta).toBe(`🟡 Lançar 💵 *${brl(50)}* em *Mercado* (feira, 12/10, Matheus)?\n👉 Responde *sim* ou *não*.`);
    for (const a of [{ data: '2026-10-13' }, { data: '2026-09-11' }, { valor: 0 }, { valor: 10000.01 }, { descricao: '' }, { descricao: 'x'.repeat(81) }, { categoria: 'Inventada' }]) {
      expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'ok', categoria: 'Groceries', ...a })).toMatchObject({ ok: false });
    }
    expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'ok', categoria: 'Groceries', data: '2026-09-12', pessoa: 'Ariane' })).toMatchObject({ ok: true });
  });
});

describe('revisão E3', () => {
  it('categoria de gasto só: fatura, salário e investimento recusados; data inexistente recusada', async () => {
    const m = montar();
    for (const categoria of ['Credit card payment', 'Salary', 'Investments']) {
      expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'x', categoria })).toMatchObject({ ok: false });
    }
    expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'x', categoria: 'Groceries', data: '2026-09-31' })).toMatchObject({ ok: false });
    expect(m.criadas).toEqual([]);
  });
});

describe('mensagem de data (E3)', () => {
  it('data futura e data velha têm motivo claro', async () => {
    const m = montar();
    expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'x', categoria: 'Groceries', data: '2026-10-13' })).toMatchObject({ ok: false, dados: { erro: expect.stringContaining('data futura') } });
    expect(await m.locais.propor_gasto_dinheiro({ valor: 5, descricao: 'x', categoria: 'Groceries', data: '2026-09-01' })).toMatchObject({ ok: false, dados: { erro: expect.stringContaining('mais de 30 dias') } });
  });
});
