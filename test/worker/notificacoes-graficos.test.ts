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
    expect(graficoDiario(dia({ serie: [{ dia: 1, acumulado: 10 }, { dia: 2, acumulado: 20 }] }))).toContain(`stroke="${VERDE}"`);
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
  it('cada gráfico vira PNG 800×480 com a fonte do pacote', () => {
    const svgs = [
      graficoDiario(dia())!,
      graficoSemanal(sem([{ nome: 'Mercado', emoji: '🛒', semana: 10, media: 5 }]))!,
      graficoMensal(mes([{ mes: '2026-08', mesLabel: 'ago/26', sobra: -3 }, { mes: '2026-09', mesLabel: 'set/26', sobra: 2 }]))!,
    ];
    for (const s of svgs) {
      const png = paraPng(s);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(800);
      expect(png.readUInt32BE(20)).toBe(480);
    }
  });
});
