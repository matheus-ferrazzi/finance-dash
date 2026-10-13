// D2: gráficos das mensagens como SVG puro (800×480), no estilo do painel. Sem emoji (não há fonte de emoji).
// null = sem dado para desenhar (a mensagem vai só com texto).
import type { ResumoDiario, ResumoMensal, ResumoSemanal } from './textosD';

const W = 800, H = 480;
const VERM = '#E24B4A', VERDE = '#1D9E75', CINZA = '#888780', TEXTO = '#2C2C2A', SUAVE = '#5F5E5A', GRADE = '#E5E3DC';
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brlCurto = (v: number) => `${v < 0 ? '-' : ''}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;

function svg(corpo: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans">`,
    `<rect x="0" y="0" width="${W}" height="${H}" rx="24" fill="#FFFFFF"/>`,
    ...corpo, '</svg>',
  ].join('');
}
const texto = (x: number, y: number, t: string, tam: number, cor = TEXTO, extra = '') =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${tam}" fill="${cor}"${extra}>${esc(t)}</text>`;

export function graficoDiario(r: ResumoDiario): string | null {
  const s = r.serie ?? [];
  if (!s.length || !r.diasNoMes || r.cabeNoMes == null) return null;
  const dias = r.diasNoMes, hoje = s[s.length - 1];
  const projFim = hoje.dia > 0 ? (hoje.acumulado / hoje.dia) * dias : 0;
  const max = Math.max(r.cabeNoMes, projFim, hoje.acumulado, 1) * 1.1;
  const x0 = 70, x1 = W - 40, y0 = H - 60, y1 = 140;
  const X = (d: number) => x0 + ((x1 - x0) * d) / dias;
  const Y = (v: number) => y0 - ((y0 - y1) * v) / max;
  // N14: mesma régua do texto ("acima do que cabe" = ritmo atual > o que dá pra gastar por dia)
  const cor = r.ritmoAtualDia > r.ritmoSeguroDia ? VERM : VERDE;
  const pts = [{ dia: 0, acumulado: 0 }, ...s].map((p) => `${f(X(p.dia))},${f(Y(p.acumulado))}`).join(' ');
  return svg([
    texto(40, 56, `${r.mesLabel} · dia ${hoje.dia}`, 24, SUAVE),
    // último dia: não há "hoje dá pra gastar"; o destaque é como o mês fecha
    texto(40, 106, r.diasRestantes > 0 ? `hoje: ${brlCurto(r.ritmoSeguroDia)}` : `fecha em ${brlCurto(r.fechaCom)}`, 44, TEXTO, ' font-weight="bold"'),
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${GRADE}" stroke-width="2"/>`,
    // N14: o que cabe DAQUI PRA FRENTE: do gasto de hoje até o total que não fecha no vermelho (inclinação =
    // o "dá pra gastar" do texto), não uma reta do dia 1 que ignora o começo do mês mais pesado
    `<line x1="${f(X(hoje.dia))}" y1="${f(Y(hoje.acumulado))}" x2="${f(X(dias))}" y2="${f(Y(r.cabeNoMes))}" stroke="${CINZA}" stroke-width="3" stroke-dasharray="10 8"/>`,
    texto(X(dias) - 150, Y(r.cabeNoMes) + (r.cabeNoMes >= projFim ? -14 : 30), 'o que cabe', 20, SUAVE),
    hoje.dia < dias
      ? `<line x1="${f(X(hoje.dia))}" y1="${f(Y(hoje.acumulado))}" x2="${f(X(dias))}" y2="${f(Y(projFim))}" stroke="${cor}" stroke-width="3" stroke-dasharray="4 8" stroke-opacity="0.6"/>`
      : '',
    `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${f(X(hoje.dia))}" cy="${f(Y(hoje.acumulado))}" r="10" fill="${cor}"/>`,
    // perto da borda direita o rótulo vai para a esquerda do ponto (não sai da imagem)
    X(hoje.dia) > W - 220
      ? texto(X(hoje.dia) - 16, Y(hoje.acumulado) - 14, `gasto ${brlCurto(hoje.acumulado)}`, 20, cor, ' text-anchor="end"')
      : texto(X(hoje.dia) + 16, Y(hoje.acumulado) - 14, `gasto ${brlCurto(hoje.acumulado)}`, 20, cor),
    texto(x0, y0 + 34, 'dia 1', 18, SUAVE),
    texto(x1 - 70, y0 + 34, `dia ${dias}`, 18, SUAVE),
  ]);
}

export function graficoSemanal(r: ResumoSemanal): string | null {
  const gs = (r.todosGrupos ?? [])
    .filter((g) => g.semana > 0 || g.media > 0)
    .sort((a, b) => Math.max(b.semana, b.media) - Math.max(a.semana, a.media))
    .slice(0, 6);
  return graficoBarras('semana × média (traço)', gs.map((g) => ({ nome: g.nome, valor: g.semana, ref: g.media })));
}

/** Barras horizontais (até 6): valor = barra; ref (opcional) = traço; cor pela ref (vermelho acima, verde abaixo) ou cinza sem ref. */
export function graficoBarras(titulo: string, itens: { nome: string; valor: number; ref?: number }[]): string | null {
  const gs = itens.filter((g) => g.valor > 0 || (g.ref ?? 0) > 0).slice(0, 6);
  if (!gs.length) return null;
  const max = Math.max(...gs.map((g) => Math.max(g.valor, g.ref ?? 0)), 1) * 1.15;
  const xb = 250, xf = W - 150, topo = 100, alt = (H - topo - 30) / 6;
  const L = (v: number) => ((xf - xb) * v) / max;
  const corpo = [texto(40, 56, titulo, 24, SUAVE)];
  gs.forEach((g, i) => {
    const y = topo + i * alt, cor = g.ref === undefined ? CINZA : g.valor > g.ref ? VERM : VERDE;
    corpo.push(
      // D2-M6: a área do rótulo cabe ~16 letras; o resto vira "…" (antes saía cortado no meio)
      texto(40, y + alt / 2 + 8, g.nome.length > 16 ? `${g.nome.slice(0, 15)}…` : g.nome, 22, TEXTO),
      `<rect class="barra" x="${xb}" y="${f(y + 10)}" width="${f(Math.max(4, L(g.valor)))}" height="${f(alt - 20)}" rx="8" fill="${cor}"/>`,
      g.ref === undefined ? '' : `<line class="media" x1="${f(xb + L(g.ref))}" y1="${f(y + 2)}" x2="${f(xb + L(g.ref))}" y2="${f(y + alt - 2)}" stroke="${TEXTO}" stroke-width="4"/>`,
      texto(W - 30, y + alt / 2 + 8, brlCurto(g.valor), 20, SUAVE, ' text-anchor="end"'),
    );
  });
  return svg(corpo);
}

export function graficoMensal(r: ResumoMensal): string | null {
  const h = r.historico ?? [];
  if (h.length < 2) return null;
  const maxAbs = Math.max(...h.map((m) => Math.abs(m.sobra)), 1) * 1.2;
  const topo = 110, base = H - 60, zero = (topo + base) / 2, meia = (base - topo) / 2;
  const larg = (W - 80) / h.length;
  const corpo = [texto(40, 56, 'sobra por mês', 24, SUAVE),
    `<line x1="40" y1="${f(zero)}" x2="${W - 40}" y2="${f(zero)}" stroke="${GRADE}" stroke-width="2"/>`];
  h.forEach((m, i) => {
    const x = 40 + i * larg + larg * 0.18, w = larg * 0.64, alto = (Math.abs(m.sobra) / maxAbs) * meia;
    const y = m.sobra >= 0 ? zero - alto : zero, cor = m.sobra >= 0 ? VERDE : VERM;
    const op = m.mes === r.mes ? '1' : '0.55';
    corpo.push(
      `<rect class="barra" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(Math.max(2, alto))}" rx="8" fill="${cor}" fill-opacity="${op}"/>`,
      texto(x, m.sobra >= 0 ? y - 10 : y + alto + 26, brlCurto(m.sobra), 18, SUAVE),
      texto(x + w / 2 - 28, H - 24, m.mesLabel, 20, m.mes === r.mes ? TEXTO : SUAVE),
    );
  });
  return svg(corpo);
}
