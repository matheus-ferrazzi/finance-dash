import { describe, expect, it } from 'vitest';
import { detectarAssinaturas, type Cobranca } from '../../src/lib/assinaturas';

const c = (chave: string, data: string, valor: number, p: Partial<Cobranca> = {}): Cobranca =>
  ({ chave, data, valor, categoria: 'Digital services', banco: 'Nubank', parcelado: false, ...p });

describe('detectarAssinaturas', () => {
  it('cobrança mensal de valor fixo em 3+ meses é assinatura', () => {
    const r = detectarAssinaturas([c('streaming', '2026-07-05', 39.9), c('streaming', '2026-08-05', 39.9), c('streaming', '2026-09-05', 39.9)]);
    expect(r).toEqual([{ nome: 'streaming', valorMedio: 39.9, meses: 3, categoria: 'Digital services', banco: 'Nubank', ultima: '2026-09-05' }]);
  });

  it('reajuste pequeno (até 15%) continua sendo assinatura', () => {
    const r = detectarAssinaturas([c('video', '2026-07-05', 59.9), c('video', '2026-08-05', 59.9), c('video', '2026-09-05', 67.9)]);
    expect(r.map((a) => a.nome)).toEqual(['video']);
  });

  it('parcelamento — mesmo terminado — nunca é assinatura', () => {
    const r = detectarAssinaturas([
      c('ingressos /', '2026-06-14', 108.70, { parcelado: true }), c('ingressos /', '2026-07-14', 108.70, { parcelado: true }),
      c('ingressos /', '2026-08-14', 108.70, { parcelado: true }),
    ]);
    expect(r).toEqual([]);
  });

  it('lugar onde se compra sempre (várias vezes no mês, valor variando) não é assinatura', () => {
    const mercado = ['2026-07-03', '2026-07-18', '2026-08-02', '2026-08-20', '2026-09-05', '2026-09-22']
      .map((d, i) => c('mercado', d, 300 + i * 80, { categoria: 'Groceries' }));
    expect(detectarAssinaturas(mercado)).toEqual([]);
  });

  it('uma vez por mês mas com valor que varia muito (PIX para pessoa) não é assinatura', () => {
    const r = detectarAssinaturas([c('pix fulano', '2026-07-10', 50), c('pix fulano', '2026-08-10', 120), c('pix fulano', '2026-09-10', 90)]);
    expect(r).toEqual([]);
  });

  it('menos de 3 meses, ou valor abaixo de R$ 5, não entra', () => {
    expect(detectarAssinaturas([c('x', '2026-08-05', 20), c('x', '2026-09-05', 20)])).toEqual([]);
    expect(detectarAssinaturas([c('y', '2026-07-05', 2), c('y', '2026-08-05', 2), c('y', '2026-09-05', 2)])).toEqual([]);
  });

  it('assinatura sem cobrança há mais de 45 dias foi cancelada e não aparece', () => {
    const xbox = ['05', '06', '07'].map((m) => c('xbox', `2026-${m}-07`, 76.9));
    expect(detectarAssinaturas(xbox, '2026-10-09')).toEqual([]);
    expect(detectarAssinaturas(xbox, '2026-08-20')).toHaveLength(1);
  });

  it('ordena pelo valor, maior primeiro', () => {
    const r = detectarAssinaturas([
      ...['07', '08', '09'].map((m) => c('barata', `2026-${m}-01`, 10)),
      ...['07', '08', '09'].map((m) => c('cara', `2026-${m}-01`, 100)),
    ]);
    expect(r.map((a) => a.nome)).toEqual(['cara', 'barata']);
  });
});

describe('comerciante com mais de uma assinatura, grafias diferentes e compras parceladas', () => {
  const ps = [
    c('ebn *playstation', '2026-06-04', 29.9), c('ebn*playstation', '2026-07-05', 29.9), c('ebn*playstati', '2026-09-04', 29.9),
    c('ebn *playstation', '2026-06-06', 65.9), c('ebn *playstation', '2026-07-06', 65.9), c('ebn*playstati', '2026-08-06', 65.9),
    c('ebn *playstation /', '2026-07-22', 143.40, { parcelado: true }), c('ebn *playstation /', '2026-08-30', 143.40, { parcelado: true }),
  ];
  it('separa as duas assinaturas pelo valor e junta as grafias truncadas', () => {
    const r = detectarAssinaturas(ps);
    expect(r.map((a) => [a.valorMedio, a.meses])).toEqual([[65.9, 3], [29.9, 3]]);
  });
  it('compra parcelada do mesmo comerciante não derruba a assinatura', () => {
    expect(detectarAssinaturas(ps)).toHaveLength(2);
  });
  it('mesma assinatura paga ora no débito, ora no crédito, é uma só', () => {
    const r = detectarAssinaturas([
      c('compra no débito|ifd*ifood club', '2026-05-31', 5.95), c('compra no débito|ifd*ifood club', '2026-06-30', 5.95),
      c('ifd*ifood club', '2026-08-31', 5.95), c('ifd*ifood club', '2026-10-01', 5.95),
    ]);
    expect(r.map((a) => [a.valorMedio, a.meses])).toEqual([[5.95, 4]]);
  });
  it('valor parecido uma vez por mês, mas em dia qualquer (pastelaria, mercado), não é assinatura', () => {
    const r = detectarAssinaturas([c('pasteis', '2026-05-01', 78), c('pasteis', '2026-06-16', 76.5), c('pasteis', '2026-07-26', 78)]);
    expect(r).toEqual([]);
  });
  it('mercado de toda semana não vira assinatura nem quando uma compra por mês cai na mesma faixa e dia', () => {
    const semanas = ['04', '11', '18', '25'];
    const r = detectarAssinaturas(['07', '08', '09'].flatMap((m) =>
      semanas.map((d, i) => c('atacadista', `2026-${m}-${d}`, i === 0 ? 300 + Number(m) : 500 + i * 60))));
    expect(r).toEqual([]);
  });
  it('mercado pago ora no PIX QR, ora no cartão, conta como um lugar só de compra frequente', () => {
    const r = detectarAssinaturas(['07', '08', '09'].flatMap((m) => [
      c('assai atacadista lj', `2026-${m}-06`, 300),
      c('pagamento de pix qr code assai atacadista', `2026-${m}-13`, 580),
      c('pix qrs assai ataca/', `2026-${m}-20`, 610),
      c('compra cartao deb mc / assai atacadista lj', `2026-${m}-27`, 40),
    ]));
    expect(r).toEqual([]);
  });
  it('na visão do casal, a mesma cobrança paga por cada um são duas recorrências (casal = soma das pessoas)', () => {
    const r = detectarAssinaturas(['07', '08', '09'].flatMap((m) => [
      c('pix enviado fulano', `2026-${m}-10`, 90, { responsavel: 'Matheus' }),
      c('pix enviado fulano', `2026-${m}-11`, 90, { responsavel: 'Ariane' }),
    ]));
    expect(r).toHaveLength(2);
  });
  it('dia que oscila na virada do mês (30, 31, 1º) continua estável', () => {
    const r = detectarAssinaturas(['2026-06-30', '2026-07-31', '2026-09-01'].map((d) => c('clube', d, 5.95)));
    expect(r).toHaveLength(1);
  });
});

// auditoria 17/10 (N12), 23/10: o serviço trocou de plano (valor caiu para menos da metade) e a estimativa seguia com o
// plano antigo; depois de 45 dias a faixa antiga sairia e a nova, com 1 mês, também — o serviço sumiria da lista
describe('troca de plano', () => {
  const s = (data: string, valor: number) => c('servico video', data, valor);
  it('faixa nova que começa depois da antiga parar: uma assinatura, com o valor do plano atual', () => {
    const r = detectarAssinaturas([s('2026-04-08', 49.9), s('2026-05-08', 49.9), s('2026-06-08', 49.9), s('2026-07-08', 49.9),
      s('2026-08-08', 52.9), s('2026-09-08', 52.9), s('2026-10-09', 19.9)], '2026-11-20');
    expect(r).toEqual([{ nome: 'servico video', valorMedio: 19.9, meses: 7, categoria: 'Digital services', banco: 'Nubank', ultima: '2026-10-09' }]);
  });
  it('duas faixas que convivem no mesmo período continuam duas assinaturas', () => {
    const d = ['2026-07-05', '2026-08-05', '2026-09-05'];
    const r = detectarAssinaturas([...d.map((x) => c('loja jogos', x, 20)), ...d.map((x) => c('loja jogos', x.replace('-05', '-06'), 60))]);
    expect(r.map((a) => a.valorMedio)).toEqual([60, 20]);
  });
});
