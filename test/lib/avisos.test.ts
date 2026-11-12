import { describe, expect, it } from 'vitest';
import { avisosDoDia } from '../../src/lib/avisos';

// Onda 2 (auditoria 13/10): alerta por exceção no diário — cheque especial, juros de atraso/rotativo, orçamento
// (o Bot 06 do Telegram) e gasto fora do padrão. Valores inventados.
const vazio = { saldos: [], encargos: [], orcamento: [], foraDoPadrao: [] };

describe('avisos do dia', () => {
  it('sem nada fora do normal: lista vazia', () => {
    expect(avisosDoDia(vazio)).toEqual([]);
  });
  it('conta no negativo (cheque especial); zero ou positivo não', () => {
    expect(avisosDoDia({ ...vazio, saldos: [{ banco: 'B1', responsavel: 'Ariane', saldo: -42.5 }, { banco: 'B2', responsavel: 'Matheus', saldo: 0 }] }))
      .toEqual([{ tipo: 'negativo', banco: 'B1', responsavel: 'Ariane', valor: -42.5 }]);
  });
  it('juros/encargos de atraso somados por cartão', () => {
    expect(avisosDoDia({ ...vazio, encargos: [{ banco: 'B1', responsavel: 'Matheus', valor: 6.5 }, { banco: 'B1', responsavel: 'Matheus', valor: 12 }] }))
      .toEqual([{ tipo: 'juros', banco: 'B1', responsavel: 'Matheus', valor: 18.5 }]);
  });
  it('orçamento saiu do diário (15/10): virou o alerta na hora do Zeca, uma vez por limite no mês', () => {
    const o = (ateAnteontem: number, ateOntem: number) => ({ item: 'Delivery', emoji: '🛵', teto: 600, ateAnteontem, ateOntem });
    expect(avisosDoDia({ ...vazio, orcamento: [o(400, 500), o(400, 650)] })).toEqual([]);
  });
  it('fora do padrão: no máximo 2, maiores primeiro', () => {
    const f = (descricao: string, valor: number) => ({ descricao, valor, categoria: 'Shopping', mediana: 50 });
    expect(avisosDoDia({ ...vazio, foraDoPadrao: [f('A', 300), f('B', 900), f('C', 400)] }).map((a: any) => a.descricao)).toEqual(['B', 'C']);
  });
});

// auditoria 11/11: a fatura paga em parte só aparecia depois de virar plano de parcelas (com custo). O aviso sai
// enquanto ainda dá para completar o pagamento; o limite estourado, uma vez por semana.
describe('avisos do dia — cartões', () => {
  const cartao = (p: object) => ({ banco: 'B1', responsavel: 'Ariane', total: 900, pago: 400, parcelado: 0, vencimento: '2041-03-08', usado: 300, limite: 1000, ...p });
  const com = (hoje: string, ...cs: object[]) => avisosDoDia({ ...vazio, hoje, cartoes: cs.map(cartao) });

  it('fatura paga em parte e ainda não vencida: avisa quanto falta e o dia', () => {
    expect(com('2041-03-05', {})).toEqual([{ tipo: 'fatura_parcial', banco: 'B1', responsavel: 'Ariane', total: 900, pago: 400, falta: 500, vencimento: '2041-03-08', venceu: false }]);
  });
  it('fatura vencida há poucos dias com saldo em aberto (mesmo sem pagamento nenhum) avisa; há mais de 5 dias, não', () => {
    expect(com('2041-03-10', { pago: 0 })).toMatchObject([{ tipo: 'fatura_parcial', falta: 900, venceu: true }]);
    expect(com('2041-03-14', { pago: 0 })).toEqual([]);
  });
  it('não avisa: paga inteira, já parcelada pelo banco, sem pagamento antes do vencimento, ou vencendo só daqui a mais de 10 dias', () => {
    expect(com('2041-03-05', { pago: 900 }, { parcelado: 500 }, { pago: 0 }, { vencimento: '2041-03-20' })).toEqual([]);
  });
  it('limite estourado avisa na segunda-feira; nos outros dias e dentro do limite, não', () => {
    const estourado = { pago: 900, usado: 1080, limite: 1000 };
    expect(com('2041-03-04', estourado)).toEqual([{ tipo: 'limite', banco: 'B1', responsavel: 'Ariane', usado: 1080, limite: 1000 }]);
    expect(com('2041-03-05', estourado)).toEqual([]);
    expect(com('2041-03-04', { pago: 900, usado: 1000, limite: 1000 }, { pago: 900, usado: 50, limite: 0 })).toEqual([]);
  });
});

// o parcelamento costuma ser escolhido na hora de pagar: o aviso útil é antes, quando a fatura fechada não cabe no
// dinheiro que vai estar na conta até o vencimento
describe('avisos do dia — fatura que não cabe', () => {
  const cartao = (p: object) => ({ banco: 'B1', responsavel: 'Ariane', total: 900, pago: 0, parcelado: 0, vencimento: '2041-03-08', usado: 300, limite: 1000, ...p });
  const com = (caixa: object, ...cs: object[]) => avisosDoDia({ ...vazio, hoje: '2041-03-05', caixa: { saldo: 0, aReceber: [], ...caixa }, cartoes: cs.map(cartao) }).filter((a) => a.tipo === 'fatura_nao_cabe');

  it('fatura a vencer em até 7 dias maior que o saldo + o que entra até o vencimento: avisa quanto falta', () => {
    expect(com({ saldo: 300, aReceber: [{ dia: 7, valor: 200 }, { dia: 20, valor: 5000 }] }, {}))
      .toEqual([{ tipo: 'fatura_nao_cabe', banco: 'B1', responsavel: 'Ariane', fatura: 900, vencimento: '2041-03-08', disponivel: 500, falta: 400 }]);
  });
  it('cabe com o que entra antes do vencimento: sem aviso', () => {
    expect(com({ saldo: 300, aReceber: [{ dia: 7, valor: 700 }] }, {})).toEqual([]);
  });
  it('duas faturas: a segunda conta só com o que sobra da primeira', () => {
    const r = com({ saldo: 1000 }, { banco: 'B1', total: 900 }, { banco: 'B2', total: 300, vencimento: '2041-03-10' });
    expect(r).toMatchObject([{ banco: 'B2', disponivel: 100, falta: 200 }]);
  });
  it('vencimento longe (mais de 7 dias), já vencida ou sem os dados do caixa: sem aviso', () => {
    expect(com({ saldo: 0 }, { vencimento: '2041-03-20' }, { vencimento: '2041-03-01' })).toEqual([]);
    expect(avisosDoDia({ ...vazio, hoje: '2041-03-05', cartoes: [cartao({})] }).filter((a) => a.tipo === 'fatura_nao_cabe')).toEqual([]);
  });
  it('fatura que vence no mês seguinte conta com tudo que ainda entra neste mês', () => {
    const r = avisosDoDia({ ...vazio, hoje: '2041-03-29', caixa: { saldo: 100, aReceber: [{ dia: 30, valor: 300 }] }, cartoes: [cartao({ vencimento: '2041-04-03' })] });
    expect(r.filter((a) => a.tipo === 'fatura_nao_cabe')).toMatchObject([{ disponivel: 400, falta: 500 }]);
  });
});
