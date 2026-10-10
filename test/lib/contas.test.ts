import { describe, expect, it } from 'vitest';
import { montarMes, type ContaFixa, type Marca, type Mov } from '../../src/lib/contas';

const conta = (p: Partial<ContaFixa> & { id: number; nome: string; padrao: string }): ContaFixa =>
  ({ responsavel: 'Ariane', valorPrevisto: 100, banco: null, tolerancia: null, somar: false, inicio: '2026-01', ate: null, parcelas: null, ordem: p.id, ...p });

let n = 0;
const mov = (data: string, valor: number, descricao: string, p: Partial<Mov> = {}): Mov =>
  ({ id: `m${++n}`, data, valor, descricao, banco: 'Santander', responsavel: 'Ariane', ...p });

describe('montarMes — contas fixas', () => {
  it('conta paga no mês aparece paga, com o valor e o dia do pagamento', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Seguro', padrao: 'SEGURADORA', valorPrevisto: 300.5 })], [],
      [mov('2026-09-01', 300.5, 'PAGAMENTO DE BOLETO SEGURADORA EXEMPLO')]);
    expect(r.itens[0]).toMatchObject({ nome: 'Seguro', previsto: 300.5, pago: 300.5, status: 'pago', dia: 1 });
  });

  it('sem pagamento no mês fica "falta", com o valor previsto', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Seguro', padrao: 'SEGURADORA', valorPrevisto: 300.5 })], [],
      [mov('2026-08-03', 300.5, 'BOLETO SEGURADORA EXEMPLO')]);
    expect(r.itens[0]).toMatchObject({ status: 'falta', pago: null, previsto: 300.5 });
  });

  it('previsto = último valor pago nos 3 meses anteriores (conta variável: Vivo, Sabesp, faturas)', () => {
    const r = montarMes('2026-10', [conta({ id: 1, nome: 'Vivo', padrao: 'TELEFONICA', valorPrevisto: 148 })], [],
      [mov('2026-08-03', 133.20, 'PIX ENVIADO TELEFONICA BRASIL S A'), mov('2026-09-01', 137.80, 'PIX ENVIADO TELEFONICA BRASIL S A')]);
    expect(r.itens[0]).toMatchObject({ previsto: 137.80, status: 'falta' });
  });

  it('padrão genérico com tolerância: PIX de 50 para a mesma pessoa não é o aluguel', () => {
    const aluguel = conta({ id: 1, nome: 'Aluguel', padrao: 'PIX ENVIADO +Fulano', valorPrevisto: 1050, tolerancia: 0.1 });
    const so50 = montarMes('2026-08', [aluguel], [], [mov('2026-08-28', 50, 'PIX ENVIADO   Fulano de Tal')]);
    expect(so50.itens[0].status).toBe('falta');
    const comAluguel = montarMes('2026-08', [aluguel], [],
      [mov('2026-08-03', 1050, 'PIX ENVIADO   Fulano de Tal'), mov('2026-08-28', 50, 'PIX ENVIADO   Fulano de Tal')]);
    expect(comAluguel.itens[0]).toMatchObject({ status: 'pago', pago: 1050 });
  });

  it('conta que soma: curso 300 + 50 no mesmo mês = 350; MEI em duas guias', () => {
    const r = montarMes('2026-08', [
      conta({ id: 1, nome: 'Curso', padrao: 'Clinica', valorPrevisto: 300, somar: true }),
      conta({ id: 2, nome: 'MEI', padrao: 'DARF|MINISTERIO DA FAZENDA', valorPrevisto: 183.65, somar: true }),
    ], [], [
      mov('2026-08-03', 300, 'PIX ENVIADO Clinica Exemplo'), mov('2026-08-03', 50, 'PIX ENVIADO Clinica Exemplo'),
      mov('2026-08-03', 86.05, 'PAGAMENTO DARF EM CANAIS'), mov('2026-08-03', 97.60, 'PAGAMENTO DARF EM CANAIS'),
    ]);
    expect(r.itens.map((i) => i.pago)).toEqual([350, 183.65]);
  });

  it('banco da conta filtra: fatura do Nubank conta só a linha do Nubank, não o espelho no Santander', () => {
    const r = montarMes('2026-08', [conta({ id: 1, nome: 'Nubank', padrao: '^Pagamento de fatura$', banco: 'Nubank', valorPrevisto: 190 })], [], [
      mov('2026-08-03', 188.7, 'Pagamento de fatura', { banco: 'Nubank' }),
      mov('2026-08-03', 188.7, 'Pagamento de fatura', { banco: 'Santander' }),
    ]);
    expect(r.itens[0].pago).toBe(188.7);
  });

  it('pagamento de outra pessoa não marca a conta', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Beltrano', padrao: 'Beltrano', valorPrevisto: 90 })], [],
      [mov('2026-09-04', 90, 'Pix enviado BELTRANO DA SILVA', { responsavel: 'Matheus' })]);
    expect(r.itens[0].status).toBe('falta');
  });

  it('um pagamento só marca uma conta', () => {
    const r = montarMes('2026-09', [
      conta({ id: 1, nome: 'A', padrao: 'PIX ENVIADO', valorPrevisto: 100 }),
      conta({ id: 2, nome: 'B', padrao: 'PIX ENVIADO', valorPrevisto: 100 }),
    ], [], [mov('2026-09-01', 100, 'PIX ENVIADO X')]);
    expect(r.itens.map((i) => i.status)).toEqual(['pago', 'falta']);
  });

  it('conta parcelada mostra a parcela do mês e some antes do início e depois da última', () => {
    const g = [conta({ id: 1, nome: 'Beltrano', padrao: 'Beltrano', valorPrevisto: 90, inicio: '2026-08', parcelas: 5 })];
    expect(montarMes('2026-09', g, [], []).itens[0].parcela).toBe('2/5');
    expect(montarMes('2026-12', g, [], []).itens[0].parcela).toBe('5/5');
    expect(montarMes('2027-01', g, [], []).itens).toEqual([]);
    expect(montarMes('2026-07', g, [], []).itens).toEqual([]);
  });

  it('contas saem na ordem cadastrada', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'B', padrao: 'x', ordem: 2 }), conta({ id: 2, nome: 'A', padrao: 'y', ordem: 1 })], [], []);
    expect(r.itens.map((i) => i.nome)).toEqual(['A', 'B']);
  });
});

describe('montarMes — marcação manual e avulsas (o banco é quem confirma)', () => {
  const marca = (p: Partial<Marca> & { id: number }): Marca => ({ mes: '2026-09', contaId: null, responsavel: 'Ariane', nome: null, valor: null, pago: true, ...p });

  it('✓ manual sem pagamento no banco fica "a confirmar", sem valor pago', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Sabesp', padrao: 'SABESP', valorPrevisto: 86 })], [marca({ id: 9, contaId: 1 })], []);
    expect(r.itens[0]).toMatchObject({ status: 'a_confirmar', pago: null, marcaId: 9 });
  });

  it('marca de outro mês não vale', () => {
    const r = montarMes('2026-10', [conta({ id: 1, nome: 'Sabesp', padrao: 'SABESP', valorPrevisto: 86 })], [marca({ id: 9, contaId: 1 })], []);
    expect(r.itens[0].status).toBe('falta');
  });

  it('pagamento no banco confirma a marca manual, pelo valor real', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Sabesp', padrao: 'SABESP', valorPrevisto: 86 })], [marca({ id: 9, contaId: 1 })],
      [mov('2026-09-04', 152.30, 'CONTA DE AGUA SABESP')]);
    expect(r.itens[0]).toMatchObject({ status: 'pago', pago: 152.30 });
  });

  it('avulsa é confirmada por um pagamento dela no mês com o mesmo valor (até 1%)', () => {
    const r = montarMes('2026-05', [], [marca({ id: 1, mes: '2026-05', nome: 'IPVA', valor: 261.30 })],
      [mov('2026-05-04', 261.30, 'PAGAMENTO IPVA DETRAN')]);
    expect(r.itens[0]).toMatchObject({ nome: 'IPVA', previsto: 261.30, pago: 261.30, status: 'pago', avulsa: true, dia: 4 });
  });

  it('avulsa sem pagamento correspondente no banco fica "a confirmar"', () => {
    const r = montarMes('2026-09', [], [marca({ id: 2, nome: 'Presente', valor: 50 })], [mov('2026-09-04', 80, 'PIX ENVIADO Loja')]);
    expect(r.itens[0]).toMatchObject({ status: 'a_confirmar', pago: null, avulsa: true });
  });

  it('pagamento que já confirmou uma conta fixa não confirma avulsa', () => {
    const r = montarMes('2026-09', [conta({ id: 1, nome: 'Seguro', padrao: 'SEGURADORA', valorPrevisto: 300.5 })],
      [marca({ id: 2, nome: 'Outra', valor: 300.5 })], [mov('2026-09-01', 300.5, 'BOLETO SEGURADORA EXEMPLO')]);
    expect(r.itens.map((i) => i.status)).toEqual(['pago', 'a_confirmar']);
  });

  it('pagamento de outra pessoa não confirma avulsa', () => {
    const r = montarMes('2026-09', [], [marca({ id: 2, nome: 'Presente', valor: 50 })], [mov('2026-09-04', 50, 'PIX', { responsavel: 'Matheus' })]);
    expect(r.itens[0].status).toBe('a_confirmar');
  });
});

describe('montarMes — resumo do topo (como no caderno)', () => {
  it('entrou, contas do mês, pago (só o confirmado), a confirmar, falta e sobra', () => {
    const r = montarMes('2026-09', [
      conta({ id: 1, nome: 'Seguro', padrao: 'SEGURADORA', valorPrevisto: 300.5 }),
      conta({ id: 2, nome: 'Sabesp', padrao: 'SABESP', valorPrevisto: 86 }),
      conta({ id: 3, nome: 'Vivo', padrao: 'TELEFONICA', valorPrevisto: 150 }),
    ], [{ id: 1, mes: '2026-09', contaId: 3, responsavel: 'Ariane', nome: null, valor: null, pago: true }],
    [mov('2026-09-01', 300.5, 'BOLETO SEGURADORA EXEMPLO')], 4000);
    expect(r).toMatchObject({ entrou: 4000, total: 536.5, pago: 300.5, aConfirmar: 150, falta: 236, sobra: 3463.5 });
  });
});

describe('montarMes — remover itens', () => {
  const sabesp = conta({ id: 1, nome: 'Sabesp', padrao: 'SABESP', valorPrevisto: 86 });
  const tirada: Marca = { id: 7, mes: '2026-09', contaId: 1, responsavel: 'Ariane', nome: null, valor: null, pago: false };

  it('conta tirada deste mês sai da lista e dos totais, e fica em "tiradas" para desfazer', () => {
    const r = montarMes('2026-09', [sabesp, conta({ id: 2, nome: 'Seguro', padrao: 'SEGURADORA', valorPrevisto: 330 })], [tirada], []);
    expect(r.itens.map((i) => i.nome)).toEqual(['Seguro']);
    expect(r.total).toBe(330);
    expect(r.tiradas).toEqual([{ contaId: 1, marcaId: 7, nome: 'Sabesp', responsavel: 'Ariane' }]);
  });

  it('tirada só vale no mês dela', () => {
    expect(montarMes('2026-10', [sabesp], [tirada], []).itens.map((i) => i.nome)).toEqual(['Sabesp']);
  });

  it('o banco vence: conta tirada que foi paga aparece paga', () => {
    const r = montarMes('2026-09', [sabesp], [tirada], [mov('2026-09-04', 81.24, 'CONTA DE AGUA SABESP')]);
    expect(r.itens[0]).toMatchObject({ nome: 'Sabesp', status: 'pago' });
    expect(r.tiradas).toEqual([]);
  });

  it('conta removida de vez (ate) some depois do último mês e continua nos meses anteriores', () => {
    const curso = [conta({ id: 1, nome: 'Curso', padrao: 'Clinica', ate: '2026-09' })];
    expect(montarMes('2026-09', curso, [], []).itens).toHaveLength(1);
    expect(montarMes('2026-10', curso, [], []).itens).toEqual([]);
  });
});
