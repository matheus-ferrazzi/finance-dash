import { describe, expect, it } from 'vitest';
import { contarDiferencas, planejarReconciliacao, type LinhaBanco } from '../../src/worker/reconciliar';
import type { Lancamento } from '../../src/worker/tipos';

const base: Lancamento = {
  id_transacao: 'a', data_lancamento: '2026-09-01', valor: 10, tipo_movimento: 'Saída', classe: 'despesa',
  descricao: 'x', categoria: 'Shopping', forma_pagamento: 'Crédito', banco: 'Nubank', responsavel: 'Matheus',
  status_pluggy: 'POSTED', account_id: 'acc', parcela_numero: null, parcela_total: null, data_compra: null,
  fatura_id: null, fatura_prevista: null, contraparte_nome: null, contraparte_doc: null, loja_cnpj: null,
  loja_cnae: null, categoria_id: null, tipo_operacao: null, transferencia_casal: false,
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
