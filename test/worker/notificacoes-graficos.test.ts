import { describe, expect, it } from 'vitest';
import { graficoBarras, graficoDiario, graficoMensal, graficoMeta, graficoOrcamento, graficoSemanal } from '../../src/worker/notificacoes/graficos';
import { estadoMeta } from '../../src/lib/metaMes';
import { paraPng } from '../../src/worker/notificacoes/png';

// 16/10: tema escuro, com as cores do painel
const VERM = '#ff6b6b', VERDE = '#4fd6a4';
const limpo = (s: string) => !/NaN|Infinity|undefined/.test(s);

const dia = (p: object = {}) => ({
  mesLabel: 'out/26', fechaCom: -500, diasRestantes: 20, ritmoSeguroDia: 50, ritmoAtualDia: 80, contas: [],
  serie: [{ dia: 1, acumulado: 100 }, { dia: 2, acumulado: 250 }, { dia: 3, acumulado: 260 }], cabeNoMes: 1500, diasNoMes: 31, ...p,
});

describe('gráfico do diário', () => {
  it('acima do que cabe: linha vermelha, reta do que cabe, título com mês, dia e "hoje"', () => {
    const s = graficoDiario(dia())!;
    expect(s).toContain('<svg');
    expect(s).toContain(`stroke="${VERM}"`);
    expect(s).toContain('out/26 · dia 3');
    expect(s).toContain('hoje: R$ 50');
    expect(s).toContain('o que cabe');
    expect(limpo(s)).toBe(true);
  });
  it('dentro do que cabe: verde', () => {
    expect(graficoDiario(dia({ ritmoAtualDia: 40, serie: [{ dia: 1, acumulado: 10 }, { dia: 2, acumulado: 20 }] }))).toContain(`stroke="${VERDE}"`);
  });
  // N14 (auditoria 13/10): a reta saía do dia 1 (o que cabe no mês inteiro, linear) e o texto falava do que cabe
  // daqui pra frente; a cor também usava outra régua. Agora: reta sai do gasto de hoje até o que cabe no fim do
  // mês, e a cor é a mesma do texto (ritmo atual × dá pra gastar).
  it('N14: reta do que cabe sai do ponto de hoje; cor pela mesma régua do texto', () => {
    const s = graficoDiario(dia({ ritmoAtualDia: 40, ritmoSeguroDia: 50 }))!;
    // gasto alto no começo do mês, mas o ritmo atual (40) está abaixo do que dá pra gastar (50): verde, como o texto
    expect(s).toContain(`stroke="${VERDE}"`);
    expect(s).not.toContain(`stroke="${VERM}"`);
    // a reta tracejada cinza começa no dia 3 (x do ponto de hoje), não no dia 1
    const reta = s.match(/<line x1="([\d.]+)" y1="[\d.]+" x2="[\d.]+" y2="[\d.]+" stroke="#[0-9A-Fa-f]+" stroke-width="3" stroke-dasharray="10 8"/)!;
    const circulo = s.match(/<circle cx="([\d.]+)"/)!;
    expect(reta[1]).toBe(circulo[1]);
  });
  it('dia 1 sem gasto e já estourado (cabe 0): sem NaN', () => {
    expect(limpo(graficoDiario(dia({ serie: [{ dia: 1, acumulado: 0 }], cabeNoMes: 0 }))!)).toBe(true);
    expect(limpo(graficoDiario(dia({ cabeNoMes: 0 }))!)).toBe(true);
  });
  it('painel antigo (sem série): null', () => {
    expect(graficoDiario(dia({ serie: undefined }))).toBeNull();
    expect(graficoDiario(dia({ serie: [] }))).toBeNull();
  });
});

const sem = (todos?: { nome: string; emoji: string; semana: number; media: number }[]) => ({
  semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 1, mediaTotal: 1, grupos: [],
  trilha: { fase: 1, titulo: 'T', proximoPasso: 'P' }, todosGrupos: todos,
});

describe('gráfico do semanal', () => {
  it('uma barra e um traço por grupo, cor pela média, até 6 grupos, sem emoji', () => {
    const gs = Array.from({ length: 8 }, (_, i) => ({ nome: `G${i}`, emoji: '🛒', semana: i % 2 ? 300 : 100, media: 200 + i }));
    const s = graficoSemanal(sem(gs))!;
    expect(s.match(/class="barra"/g)!.length).toBe(6);
    expect(s.match(/class="media"/g)!.length).toBe(6);
    expect(s).toContain(`fill="${VERM}"`);
    expect(s).toContain(`fill="${VERDE}"`);
    expect(s).not.toContain('🛒');
    expect(limpo(s)).toBe(true);
  });
  it('nome com & e < não quebra o SVG', () => {
    expect(graficoSemanal(sem([{ nome: 'Casa & <lar>', emoji: '•', semana: 10, media: 5 }]))).toContain('Casa &amp; &lt;lar&gt;');
  });
  it('tudo zerado ou sem campo: null', () => {
    expect(graficoSemanal(sem([{ nome: 'A', emoji: '•', semana: 0, media: 0 }]))).toBeNull();
    expect(graficoSemanal(sem(undefined))).toBeNull();
  });
});

const mes = (h?: { mes: string; mesLabel: string; sobra: number }[]) => ({
  mes: '2026-09', mesLabel: 'set/26', sobraReal: 1, sobraPrevista: 1, saldoFim: 1,
  trilha: { fase: 1, titulo: 'T', mudou: false, faseAntes: 1 }, mesNovo: { mesLabel: 'out/26', fechaCom: 1 }, historico: h,
});

describe('gráfico do mensal', () => {
  it('uma barra por mês, verde se sobrou, vermelha se faltou, rótulos', () => {
    const s = graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -300 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 299 }]))!;
    expect(s.match(/class="barra"/g)!.length).toBe(2);
    expect(s).toContain(`fill="${VERM}"`);
    expect(s).toContain(`fill="${VERDE}"`);
    expect(s).toContain('ago/26');
    expect(limpo(s)).toBe(true);
  });
  it('menos de 2 meses ou todos zero: sem NaN; menos de 2 → null', () => {
    expect(graficoMensal(mes([{ mes: '2026-09', mesLabel: 'set/26', sobra: 1 }]))).toBeNull();
    expect(graficoMensal(mes(undefined))).toBeNull();
    expect(limpo(graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: 0 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 0 }]))!)).toBe(true);
  });
});

describe('PNG', () => {
  it('cada gráfico vira PNG 1600×960 (nítido no celular, D2-M7) com a fonte do pacote', async () => {
    const svgs = [
      graficoDiario(dia())!,
      graficoSemanal(sem([{ nome: 'Mercado', emoji: '🛒', semana: 10, media: 5 }]))!,
      graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -3 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 2 }]))!,
    ];
    for (const s of svgs) {
      const png = await paraPng(s);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(1600);
      expect(png.readUInt32BE(20)).toBe(960);
    }
  });
});

describe('rótulos (revisão D2)', () => {
  it('último dia do mês: título mostra como fecha, não "hoje: R$ 0"', () => {
    const s = graficoDiario(dia({ diasRestantes: 0, ritmoSeguroDia: 0, serie: Array.from({ length: 31 }, (_, i) => ({ dia: i + 1, acumulado: (i + 1) * 10 })) }))!;
    expect(s).not.toContain('hoje:');
    expect(s).toContain('fecha em -R$ 500');
  });
  it('fim do mês: rótulo do gasto ancorado à direita (não sai da imagem)', () => {
    const s = graficoDiario(dia({ serie: Array.from({ length: 28 }, (_, i) => ({ dia: i + 1, acumulado: (i + 1) * 10 })) }))!;
    expect(s).toMatch(/text-anchor="end"[^>]*>gasto R\$/);
  });
  it('semanal: valores numa coluna à direita, alinhados, depois de toda barra e traço (não encostam no traço)', () => {
    const s = graficoSemanal(sem([{ nome: 'Mercado', emoji: '•', semana: 0, media: 500 }, { nome: 'Lazer', emoji: '•', semana: 280, media: 320 }]))!;
    const xs = [...s.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="end">R\$/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(2);
    expect(new Set(xs).size).toBe(1);
    const fimBarras = Math.max(...[...s.matchAll(/class="media" x1="([\d.]+)"/g)].map((m) => Number(m[1])),
      ...[...s.matchAll(/class="barra" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)].map((m) => Number(m[1]) + Number(m[2])));
    expect(xs[0] - 90).toBeGreaterThan(fimBarras);
  });
  it('diário: "o que cabe" fica do lado oposto do gasto (abaixo da reta quando o gasto está acima)', () => {
    const s = graficoDiario(dia())!; // acima do que cabe
    const yCabe = Number(s.match(/<text x="[\d.]+" y="([\d.]+)"[^>]*>o que cabe/)![1]);
    const yFimReta = Number(s.match(/stroke-dasharray="10 8"/) && s.match(/<line x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="([\d.]+)" stroke="#8b93a1"/)![1]);
    expect(yCabe).toBeGreaterThan(yFimReta);
  });
});

// D2-M6: rótulo comprido saía cortado no meio, sem "…"
describe('rótulo das barras', () => {
  it('nome comprido vira 15 letras + "…"; curto fica inteiro', () => {
    const s = graficoBarras('t', [{ nome: 'Assinaturas e serviços digitais', valor: 10 }, { nome: 'Mercado', valor: 5 }])!;
    expect(s).toContain('>Assinaturas e s…<');
    expect(s).not.toContain('serviços digitais');
    expect(s).toContain('>Mercado<');
  });
});

// visto no PNG de 14/10: os rótulos "gasto" e "o que cabe" caíam em cima das retas tracejadas
describe('rótulos do diário fora das retas', () => {
  const num = (s: string, re: RegExp) => Number(s.match(re)![1]);
  it('"o que cabe" fica abaixo da reta quando o ritmo vai além (e acima quando não); "gasto" abaixo do ponto', () => {
    const d = { mesLabel: 'out/26', fechaCom: -500, diasRestantes: 17, ritmoSeguroDia: 100, ritmoAtualDia: 180, contas: [],
      serie: [{ dia: 1, acumulado: 0 }, { dia: 14, acumulado: 2500 }], cabeNoMes: 4200, diasNoMes: 31 };
    const s = graficoDiario(d)!;
    const reta = s.match(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#[0-9A-Fa-f]+" stroke-width="3" stroke-dasharray="10 8"/)!.slice(1).map(Number);
    const xr = num(s, /<text x="([\d.]+)" y="[\d.]+"[^>]*>o que cabe</), yr = num(s, /<text x="[\d.]+" y="([\d.]+)"[^>]*>o que cabe</);
    const yLinha = reta[1] + ((reta[3] - reta[1]) * (xr + 75 - reta[0])) / (reta[2] - reta[0]);
    expect(yr).toBeGreaterThan(yLinha + 20); // abaixo da reta (o ritmo projetado passa por cima)
    const yPonto = num(s, /<circle cx="[\d.]+" cy="([\d.]+)"/);
    expect(num(s, /<text x="[\d.]+" y="([\d.]+)"[^>]*>gasto /)).toBeGreaterThan(yPonto + 20);
  });
});

// 16/10 (pedido do Matheus): todos os gráficos em tema escuro; gráfico na meta e nos alertas
describe('tema escuro', () => {
  const sem = { semana: { inicio: '2026-10-05', fim: '2026-10-11' }, total: 100, mediaTotal: 80, grupos: [], trilha: { fase: 1, titulo: 't', proximoPasso: 'p' },
    todosGrupos: [{ nome: 'Mercado', emoji: '🛒', semana: 120, media: 80 }] };
  const mes = { mes: '2026-09', mesLabel: 'set/26', sobraReal: 10, sobraPrevista: 0, saldoFim: 0, trilha: { fase: 1, titulo: 't', mudou: false, faseAntes: 1 },
    mesNovo: { mesLabel: 'out/26', fechaCom: 0 }, historico: [{ mes: '2026-08', mesLabel: 'ago/26', sobra: -100 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 10 }] };
  it('fundo do painel em todos (nada de fundo branco)', () => {
    for (const s of [graficoDiario(dia()), graficoSemanal(sem as any), graficoMensal(mes as any), graficoBarras('t', [{ nome: 'A', valor: 10, ref: 5 }])]) {
      expect(s).toContain('fill="#121418"');
      expect(s).not.toMatch(/fill="#(FFFFFF|ffffff|fff)"/);
    }
  });
});

describe('gráfico da meta do débito', () => {
  const est = (gasto: number, previstoFim: number) => estadoMeta({ meta: 4000, gasto, previstoFim, diaHoje: 3, diasNoMes: 30 });
  const r = (gasto: number, previstoFim: number) => ({ mesLabel: 'out/26', estado: est(gasto, previstoFim), diasNoMes: 30,
    serie: [{ dia: 1, acumulado: gasto * 0.5 }, { dia: 2, acumulado: gasto * 0.8 }, { dia: 3, acumulado: gasto }] });
  it('linha do débito acumulado, ritmo tracejado até o fim e a meta como linha horizontal com rótulo', async () => {
    const s = graficoMeta(r(1500, 4500))!;
    expect(s).toContain('<polyline');
    expect(s).toContain('stroke-dasharray');
    expect(s).toContain('meta R$ 4.000');
    expect(s).toContain(`stroke="${VERM}"`); // ritmo passa da meta
    expect(limpo(s)).toBe(true);
    expect((await paraPng(s)).length).toBeGreaterThan(1000);
  });
  it('dentro da meta: verde; sem meta ou sem série: sem gráfico', () => {
    expect(graficoMeta(r(1000, 3500))).toContain(`stroke="${VERDE}"`);
    expect(graficoMeta({ ...r(1000, 3500), estado: null })).toBeNull();
    expect(graficoMeta({ ...r(1000, 3500), serie: [] })).toBeNull();
  });
  it('orçamento: barra por item com traço no teto; acima do teto em vermelho', () => {
    const s = graficoOrcamento([{ item: 'Restaurante', emoji: '', teto: 600, gasto: 693 }, { item: 'Mercado', emoji: '', teto: 1000, gasto: 500 }])!;
    expect(s).toContain('Restaurante');
    expect(s).toContain(`fill="${VERM}"`);
    expect(s).toContain(`fill="${VERDE}"`);
    expect(graficoOrcamento([])).toBeNull();
  });
});
