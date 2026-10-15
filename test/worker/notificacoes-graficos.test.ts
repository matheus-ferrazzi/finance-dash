import { describe, expect, it } from 'vitest';
import { graficoDiario, graficoMensal, graficoSemanal } from '../../src/worker/notificacoes/graficos';
import { paraPng } from '../../src/worker/notificacoes/png';

const VERM = '#E24B4A', VERDE = '#1D9E75';
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
  it('cada gráfico vira PNG 800×480 com a fonte do pacote', async () => {
    const svgs = [
      graficoDiario(dia())!,
      graficoSemanal(sem([{ nome: 'Mercado', emoji: '🛒', semana: 10, media: 5 }]))!,
      graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -3 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 2 }]))!,
    ];
    for (const s of svgs) {
      const png = await paraPng(s);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(800);
      expect(png.readUInt32BE(20)).toBe(480);
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
    const yFimReta = Number(s.match(/stroke-dasharray="10 8"/) && s.match(/<line x1="[\d.]+" y1="[\d.]+" x2="[\d.]+" y2="([\d.]+)" stroke="#888780"/)![1]);
    expect(yCabe).toBeGreaterThan(yFimReta);
  });
});
