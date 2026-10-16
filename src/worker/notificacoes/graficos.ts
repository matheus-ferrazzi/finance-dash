// D2: gráficos das mensagens como SVG puro (800×480), no estilo do painel. Sem emoji (não há fonte de emoji).
// null = sem dado para desenhar (a mensagem vai só com texto).
// 16/10 (pedido do Matheus): tema escuro em todos, com as cores do painel (menta, coral, âmbar sobre #121418).
import type { EstadoMeta } from '../../lib/metaMes';
import type { ResumoDiario, ResumoMensal, ResumoSemanal } from './textosD';

const W = 800, H = 480;
const VERM = '#ff6b6b', VERDE = '#4fd6a4', AMBAR = '#f5b642', CINZA = '#8b93a1', TEXTO = '#e9ecf1', SUAVE = '#8b93a1', GRADE = '#2f353e';
const FUNDO = '#121418';
const f = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '0');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const brlCurto = (v: number) => `${v < 0 ? '-' : ''}R$ ${Math.round(Math.abs(v)).toLocaleString('pt-BR')}`;

function svg(corpo: string[]): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="DejaVu Sans">`,
    // sem canto arredondado: no PNG o canto ficaria transparente (branco ou preto, conforme o tema do WhatsApp)
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${FUNDO}"/>`,
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
    // rótulo na altura da reta naquele ponto (antes: na altura do fim, e caía em cima da linha); do lado
    // oposto ao do ritmo projetado — abaixo quando o ritmo passa por cima
    (() => {
      const xl = X(dias) - 150, meio = xl + 75;
      const yLinha = Y(hoje.acumulado) + ((Y(r.cabeNoMes) - Y(hoje.acumulado)) * (meio - X(hoje.dia))) / Math.max(1, X(dias) - X(hoje.dia));
      return texto(xl, yLinha + (r.cabeNoMes >= projFim ? -16 : 38), 'o que cabe', 20, SUAVE);
    })(),
    hoje.dia < dias
      ? `<line x1="${f(X(hoje.dia))}" y1="${f(Y(hoje.acumulado))}" x2="${f(X(dias))}" y2="${f(Y(projFim))}" stroke="${cor}" stroke-width="3" stroke-dasharray="4 8" stroke-opacity="0.6"/>`
      : '',
    `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${f(X(hoje.dia))}" cy="${f(Y(hoje.acumulado))}" r="10" fill="${cor}"/>`,
    // abaixo do ponto (as retas daqui pra frente sobem: em cima, o rótulo cruzava as duas); perto da borda
    // direita vai para a esquerda do ponto (não sai da imagem)
    X(hoje.dia) > W - 220
      ? texto(X(hoje.dia) - 16, Y(hoje.acumulado) + 40, `gasto ${brlCurto(hoje.acumulado)}`, 20, cor, ' text-anchor="end"')
      : texto(X(hoje.dia) + 16, Y(hoje.acumulado) + 40, `gasto ${brlCurto(hoje.acumulado)}`, 20, cor),
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

/**
 * 16/10: meta do débito no mês — débito acumulado dia a dia (cheia), o ritmo até o fim (tracejado, do ponto de hoje
 * até onde a previsão fecha) e a meta como linha horizontal. Cor pela situação: verde dentro, âmbar a partir de 80%,
 * vermelho se o ritmo passa ou estourou. Sem meta ou sem dado do mês: sem gráfico.
 */
export function graficoMeta(r: { mesLabel: string; estado: EstadoMeta | null; serie: { dia: number; acumulado: number }[]; diasNoMes: number }): string | null {
  const e = r.estado, s = r.serie ?? [];
  if (!e || !s.length || !r.diasNoMes) return null;
  const dias = r.diasNoMes, hoje = s[s.length - 1];
  const max = Math.max(e.meta, e.previstoFim, hoje.acumulado, 1) * 1.12;
  const x0 = 70, x1 = W - 40, y0 = H - 60, y1 = 140;
  const X = (d: number) => x0 + ((x1 - x0) * d) / dias;
  const Y = (v: number) => y0 - ((y0 - y1) * v) / max;
  const cor = e.situacao === 'estourou' || e.situacao === 'ritmo_passa' || e.acimaNoRitmo > 0 ? VERM : e.situacao === 'passou_80' ? AMBAR : VERDE;
  const pts = [{ dia: 0, acumulado: 0 }, ...s].map((p) => `${f(X(p.dia))},${f(Y(p.acumulado))}`).join(' ');
  return svg([
    texto(40, 56, `meta do débito · ${r.mesLabel}`, 24, SUAVE),
    texto(40, 106, `${brlCurto(e.gasto)} de ${brlCurto(e.meta)} (${e.pct}%)`, 40, TEXTO, ' font-weight="bold"'),
    `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}" stroke="${GRADE}" stroke-width="2"/>`,
    // a meta: linha horizontal tracejada, com o rótulo em cima, do lado esquerdo (o ritmo sobe pela direita)
    `<line x1="${x0}" y1="${f(Y(e.meta))}" x2="${x1}" y2="${f(Y(e.meta))}" stroke="${CINZA}" stroke-width="3" stroke-dasharray="10 8"/>`,
    texto(x0, Y(e.meta) - 12, `meta ${brlCurto(e.meta)}`, 20, SUAVE),
    hoje.dia < dias
      ? `<line x1="${f(X(hoje.dia))}" y1="${f(Y(hoje.acumulado))}" x2="${f(X(dias))}" y2="${f(Y(e.previstoFim))}" stroke="${cor}" stroke-width="3" stroke-dasharray="4 8" stroke-opacity="0.7"/>`
      : '',
    hoje.dia < dias ? texto(X(dias), Y(e.previstoFim) + (e.previstoFim >= e.meta ? -14 : 30), `ritmo ${brlCurto(e.previstoFim)}`, 20, cor, ' text-anchor="end"') : '',
    `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${f(X(hoje.dia))}" cy="${f(Y(hoje.acumulado))}" r="10" fill="${cor}"/>`,
    texto(x0, y0 + 34, 'dia 1', 18, SUAVE),
    texto(x1 - 70, y0 + 34, `dia ${dias}`, 18, SUAVE),
  ]);
}

/** 16/10: tetos do Orçamento — barra do gasto no mês e traço no teto; acima do teto em vermelho. */
export function graficoOrcamento(itens: { item: string; emoji: string; teto: number; gasto: number }[]): string | null {
  const gs = [...itens].filter((o) => o.teto > 0).sort((a, b) => b.gasto / b.teto - a.gasto / a.teto);
  return graficoBarras('gasto no mês × teto (traço)', gs.map((o) => ({ nome: o.item, valor: o.gasto, ref: o.teto })));
}
