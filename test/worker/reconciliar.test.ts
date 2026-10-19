import { describe, expect, it } from 'vitest';
import { contarDiferencas, planejarReconciliacao, semGemeosDePagamento, type LinhaBanco } from '../../src/worker/reconciliar';
import type { Lancamento, PluggyTransacao } from '../../src/worker/tipos';

const base: Lancamento = {
  id_transacao: 'a', data_lancamento: '2026-09-01', valor: 10, tipo_movimento: 'Saída', classe: 'despesa',
  descricao: 'x', categoria: 'Shopping', forma_pagamento: 'Crédito', banco: 'Nubank', responsavel: 'Matheus',
  status_pluggy: 'POSTED', account_id: 'acc', parcela_numero: null, parcela_total: null, data_compra: null,
  fatura_id: null, fatura_prevista: null, contraparte_nome: null, contraparte_doc: null, loja_cnpj: null,
  loja_cnae: null, categoria_id: null, tipo_operacao: null, transferencia_casal: false, categoria_banco: 'Outros',
};
const noBanco = (l: Lancamento): LinhaBanco => ({
  id_transacao: l.id_transacao, data_lancamento: l.data_lancamento, valor: l.valor, tipo_movimento: l.tipo_movimento,
  classe: l.classe, descricao: l.descricao, categoria: l.categoria, forma_pagamento: l.forma_pagamento,
  banco: l.banco, responsavel: l.responsavel, status_pluggy: l.status_pluggy,
});

describe('contarDiferencas', () => {
  it('separa novos, alterados e iguais, contando por campo', () => {
    const banco = new Map([
      ['a', noBanco(base)],
      ['b', { ...noBanco({ ...base, id_transacao: 'b' }), status_pluggy: 'PENDING', valor: 10.001 }],
    ]);
    const d = contarDiferencas(banco, [base, { ...base, id_transacao: 'b' }, { ...base, id_transacao: 'c' }]);
    expect(d).toEqual({ novos: 1, alterados: 1, iguais: 1, porCampo: { status_pluggy: 1 } });
  });
});

describe('planejarReconciliacao', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}`);

  it('remove o que sumiu da Pluggy', () => {
    const r = planejarReconciliacao(new Set(ids(9)), ids(10));
    expect(r).toEqual({ remover: ['id9'], abortado: null });
  });
  it('Pluggy vazia com linhas no banco: não remove nada', () => {
    expect(planejarReconciliacao(new Set(), ids(3))).toEqual({ remover: [], abortado: 'pluggy_vazio' });
  });
  it('acima de 20% aborta', () => {
    expect(planejarReconciliacao(new Set(ids(7)), ids(10))).toEqual({ remover: [], abortado: 'acima_do_limite' });
  });
  it('exatamente 20% passa; limite ajustável', () => {
    expect(planejarReconciliacao(new Set(ids(8)), ids(10)).remover).toHaveLength(2);
    expect(planejarReconciliacao(new Set(ids(5)), ids(10), 0.5).remover).toHaveLength(5);
  });
  it('banco sem linhas: nada a fazer', () => {
    expect(planejarReconciliacao(new Set(), [])).toEqual({ remover: [], abortado: null });
  });
});

describe('semGemeosDePagamento (auditoria 18/10)', () => {
  const tx = (id: string, date: string, amount = -1234, description = 'Pagamento recebido'): PluggyTransacao =>
    ({ id, accountId: 'nu', date, description, amount, type: 'CREDIT' });
  it('Nubank grava o pagamento 2×: a cópia só com data some quando há a cópia com hora', () => {
    const r = semGemeosDePagamento([tx('seca', '2031-03-07T03:00:00.000Z'), tx('hora', '2031-03-07T14:15:12.514Z'), tx('outro', '2031-03-07T10:00:00.000Z', 50, 'Mercado')]);
    expect(r.map((t) => t.id)).toEqual(['hora', 'outro']);
  });
  it('só tira até o número de cópias com hora; sem gêmeo com hora, a cópia seca fica', () => {
    const dois = semGemeosDePagamento([tx('s1', '2031-03-07T03:00:00.000Z'), tx('s2', '2031-03-07T03:00:00.000Z'), tx('h1', '2031-03-07T12:00:00.000Z')]);
    expect(dois.map((t) => t.id)).toEqual(['s2', 'h1']);
    expect(semGemeosDePagamento([tx('s1', '2031-03-07T03:00:00.000Z')]).map((t) => t.id)).toEqual(['s1']);
  });
  it('valor, dia (de São Paulo) ou texto diferente não é gêmeo; compra igual no mesmo dia também não', () => {
    expect(semGemeosDePagamento([tx('s', '2031-03-07T03:00:00.000Z'), tx('h', '2031-03-07T12:00:00.000Z', -1000)])).toHaveLength(2);
    // 01:50Z do dia 14 = 22:50 do dia 13 em SP: é o mesmo dia da cópia seca de 20/05
    expect(semGemeosDePagamento([tx('s', '2031-05-20T03:00:00.000Z', -321), tx('h', '2031-05-21T01:50:13.447Z', -321)]).map((t) => t.id)).toEqual(['h']);
    expect(semGemeosDePagamento([tx('a', '2031-06-02T03:00:00.000Z', 41.37, 'Restaurante'), tx('b', '2031-06-02T18:18:40.001Z', 41.37, 'Restaurante')])).toHaveLength(2);
  });
});
