import { describe, expect, it } from 'vitest';
import { agregarConsulta, lerPedidoConsulta, type LinhaBruta, type PedidoConsulta } from '../../src/lib/consulta';

const HOJE = '2026-10-28';
const ler = (q: string) => lerPedidoConsulta(new URLSearchParams(q), HOJE);
const pedido = (x: Partial<PedidoConsulta> = {}): PedidoConsulta => ({
  oQue: 'gastos', periodo: { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' }, pessoa: 'casal', grupo: null,
  categoria: null, texto: null, forma: null, min: null, max: null, agrupar: 'nada', ordem: 'valor', limite: 20, ...x,
});
const l = (x: Partial<LinhaBruta>): LinhaBruta => ({ data: '2026-09-10', valor: 10, descricao: 'LOJA', categoria: 'Groceries', pessoa: 'Ariane', forma: 'Débito', ...x });

describe('lerPedidoConsulta', () => {
  it('padrões', () => {
    const r = ler('o_que=gastos&periodo=este_mes');
    expect(r.ok && r.v).toMatchObject({ oQue: 'gastos', agrupar: 'nada', ordem: 'valor', limite: 20, pessoa: 'casal', grupo: null });
  });
  it('limite acima de 20 vira 20', () => {
    const r = ler('o_que=gastos&periodo=este_mes&limite=50');
    expect(r.ok && r.v.limite).toBe(20);
  });
  it('intervalo AAAA-MM-DD..AAAA-MM-DD', () => {
    const r = ler('o_que=gastos&periodo=2026-09-10..2026-09-20');
    expect(r.ok && r.v.periodo).toEqual({ inicio: '2026-09-10', fimExcl: '2026-09-21', label: '10/09 a 20/09' });
  });
  it('recusa com erro que cita o campo', () => {
    const casos: [string, RegExp][] = [
      ['o_que=gastos&periodo=2026-01-01..2026-02-31', /periodo/],
      ['o_que=gastos&periodo=2024-01-01..2026-02-28', /periodo/],
      ['o_que=gastos&periodo=2026-10-01..2026-11-05', /periodo/],
      ['o_que=salarios&periodo=este_mes', /o_que/],
      ['o_que=gastos&periodo=este_mes&agrupar=cor', /agrupar/],
      ['o_que=gastos&periodo=este_mes&forma=pix', /forma/],
      ['o_que=gastos&periodo=este_mes&pessoa=Fulano', /pessoa/],
      ['o_que=gastos&periodo=este_mes&grupo=Viagem', /grupo/],
    ];
    for (const [q, re] of casos) {
      const r = ler(q);
      expect(r.ok, q).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(re);
    }
  });
});

describe('agregarConsulta', () => {
  const base = [
    l({ categoria: 'Groceries', valor: 300, descricao: 'MERCADO A' }),
    l({ categoria: 'Eating out', valor: 100, descricao: 'BAR B' }),
    l({ categoria: 'Food delivery', valor: 50, descricao: 'feira', forma: 'Dinheiro' }),
  ];
  it('por grupo, com o dinheiro vivo junto e à parte', () => {
    const r = agregarConsulta(base, pedido({ agrupar: 'grupo' }));
    expect(r.linhas).toEqual([{ chave: 'Mercado', valor: 300, qtd: 1 }, { chave: 'Comer fora', valor: 150, qtd: 2 }]);
    expect([r.total, r.totalDinheiro, r.qtd, r.cortadas]).toEqual([450, 50, 3, 0]);
    expect(r.regra).toMatch(/dívida antiga/);
    expect(r.periodo).toBe('set/26');
  });
  it('por categoria com o nome do painel; filtros antes de somar', () => {
    expect(agregarConsulta(base, pedido({ agrupar: 'categoria', grupo: 'Comer fora' })).linhas)
      .toEqual([{ chave: 'Restaurante', valor: 100, qtd: 1 }, { chave: 'Delivery', valor: 50, qtd: 1 }]);
    expect(agregarConsulta(base, pedido({ categoria: 'restaurante' })).total).toBe(100);
    expect(agregarConsulta(base, pedido({ categoria: 'Eating out' })).total).toBe(100);
    expect(agregarConsulta(base, pedido({ forma: 'dinheiro' })).total).toBe(50);
    expect(agregarConsulta(base, pedido({ min: 60, max: 200 })).total).toBe(100);
  });
  it('por loja sem CPF/CNPJ', () => {
    const r = agregarConsulta([l({ descricao: 'JOAO DA SILVA 123.456.789-00', valor: 20 })], pedido({ agrupar: 'loja' }));
    expect(r.linhas[0].chave).not.toMatch(/\d{3}\.\d{3}/);
    expect(r.linhas[0].chave).toMatch(/JOAO DA SILVA/);
  });
  it('corta em limite, mas o total é de tudo', () => {
    const muitas = Array.from({ length: 25 }, (_, i) => l({ descricao: `LOJA ${i}`, valor: i + 1 }));
    const r = agregarConsulta(muitas, pedido({ agrupar: 'loja', limite: 20 }));
    expect([r.linhas.length, r.cortadas, r.total]).toEqual([20, 5, 325]);
    expect(r.linhas[0]).toEqual({ chave: 'LOJA 24', valor: 25, qtd: 1 });
  });
  it('por mês em ordem de data; nada = só o total', () => {
    const ls = [l({ data: '2026-10-02', valor: 5 }), l({ data: '2026-09-02', valor: 50 })];
    expect(agregarConsulta(ls, pedido({ agrupar: 'mes', ordem: 'data' })).linhas.map((x) => x.chave)).toEqual(['set/26', 'out/26']);
    const r = agregarConsulta(ls, pedido());
    expect([r.linhas, r.qtd, r.total]).toEqual([[], 2, 55]);
  });
  it('por dia, semana e pessoa', () => {
    const ls = [l({ data: '2026-09-09', valor: 5, pessoa: 'Matheus' }), l({ data: '2026-09-10', valor: 7 })];
    expect(agregarConsulta(ls, pedido({ agrupar: 'dia', ordem: 'data' })).linhas.map((x) => x.chave)).toEqual(['09/09', '10/09']);
    expect(agregarConsulta(ls, pedido({ agrupar: 'semana' })).linhas).toEqual([{ chave: 'semana de 07/09', valor: 12, qtd: 2 }]);
    expect(agregarConsulta(ls, pedido({ agrupar: 'pessoa' })).linhas.map((x) => x.chave)).toEqual(['Ariane', 'Matheus']);
  });
  it('estorno (valor negativo) abate', () => {
    expect(agregarConsulta([l({ valor: 100 }), l({ valor: -30 })], pedido()).total).toBe(70);
  });
});

// 28/10 (rodada 4): "Pagamento de Pix QR Code ATACADO EXEMPLO" e "Transferência enviada pelo Pix|DISTRIBUIDORA" iam ao grupo assim
it('loja sem o prefixo do banco', () => {
  const ls = [
    l({ descricao: 'Pagamento de Pix QR Code ATACADO EXEMPLO', valor: 10 }),
    l({ descricao: 'Transferência enviada pelo Pix|DISTRIBUIDORA FICTICIA S/A', valor: 9 }),
    l({ descricao: 'Compra no débito|PIZZARIA MODELO', valor: 8 }),
    l({ descricao: 'Pix enviado FULANO DE TAL', valor: 7 }),
    l({ descricao: 'Ebn *Loja Digital 4/4', valor: 6 }),
  ];
  expect(agregarConsulta(ls, pedido({ agrupar: 'loja' })).linhas.map((x) => x.chave))
    .toEqual(['ATACADO EXEMPLO', 'DISTRIBUIDORA FICTICIA S/A', 'PIZZARIA MODELO', 'FULANO DE TAL', 'Ebn *Loja Digital 4/4']);
});

// 28/10 (rodada 6): "iFood" no filtro de categoria dava lista vazia e o Zeca dizia "não há registro"
it('categoria desconhecida: erro que manda usar o texto (loja); conhecida, pelo nome ou pelo código, passa', () => {
  const r = ler('o_que=gastos&periodo=este_mes&categoria=iFood');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.erro).toMatch(/categoria.*texto/);
  expect(ler('o_que=gastos&periodo=este_mes&categoria=restaurante').ok).toBe(true);
  expect(ler('o_que=gastos&periodo=este_mes&categoria=Groceries').ok).toBe(true);
});
