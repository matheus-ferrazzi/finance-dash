import { describe, expect, it } from 'vitest';
import { CANCELADO, lerResposta, textoDesfeito, textoFeito, textoLista, textoPropostaAvulsa, textoPropostaCategoria } from '../../src/worker/bot/acoesTextos';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

describe('lerResposta', () => {
  it('sim, não, desfaz e número; o resto null', () => {
    expect(['sim', 'Sim!', 'confirma', 'confirmo'].map(lerResposta)).toEqual(Array(4).fill('sim'));
    expect(['s', 'ok', 'pode'].map(lerResposta)).toEqual([null, null, null]); // casual demais para gravar
    expect(['não', 'nao', 'N', 'cancela'].map(lerResposta)).toEqual(Array(4).fill('nao'));
    expect(['desfaz', 'desfazer'].map(lerResposta)).toEqual(['desfaz', 'desfaz']);
    expect(lerResposta('2')).toEqual({ numero: 2 });
    expect(['6', 'sim, mas', 'quanto gastei', ''].map(lerResposta)).toEqual([null, null, null, null]);
  });
});

describe('textos das ações', () => {
  it('lista numerada com o pedido de escolha', () => {
    expect(textoLista([{ ref: 'L1', data: '10/10', valor: 50, descricao: 'PIX FULANO', pessoa: 'Matheus', categoria: 'Transferências' }, { ref: 'L2', data: '03/10', valor: 50, descricao: 'PIX FULANO', pessoa: 'Ariane', categoria: 'Transferências' }]))
      .toBe(['🔎 Achei estes. Qual? Responde o número.', `1) 10/10 PIX FULANO ${brl(50)} (Matheus, Transferências)`, `2) 03/10 PIX FULANO ${brl(50)} (Ariane, Transferências)`].join('\n'));
  });
  it('propostas', () => {
    expect(textoPropostaCategoria({ afetados: 3, categoria: 'Mercado', escopo: 'pessoa', nome: 'FULANO', item: { data: '10/10', descricao: 'PIX FULANO', valor: 50 } }))
      .toBe('🟡 Mudar *3* lançamento(s) para *Mercado* (todos da pessoa/empresa: FULANO; vale também para os próximos)?\n👉 Responde *sim* ou *não*.');
    expect(textoPropostaCategoria({ afetados: 1, categoria: 'Mercado', escopo: 'este', nome: 'x', item: { data: '10/10', descricao: 'PIX FULANO', valor: 50 } }))
      .toContain(`(só este: 10/10 PIX FULANO ${brl(50)})`);
    expect(textoPropostaAvulsa({ nome: 'Dentista', valor: 150, mes: '2026-10', pessoa: 'Ariane' }))
      .toBe(`🟡 Pôr a conta avulsa *Dentista ${brl(150)}* em out/26 (Ariane)?\n👉 Responde *sim* ou *não*.`);
  });
  it('feito, cancelado, desfeito', () => {
    expect(textoFeito('3 lançamento(s) → Mercado', '/gastos', 'https://p')).toBe('✅ Feito: 3 lançamento(s) → Mercado.\n↩️ Errado? *Zeca, desfaz*\n\n👉 https://p/gastos');
    expect(CANCELADO).toBe('❌ Cancelado.');
    expect(textoDesfeito('Dentista R$ 150,00')).toBe('↩️ Desfeito: Dentista R$ 150,00.');
  });
});
