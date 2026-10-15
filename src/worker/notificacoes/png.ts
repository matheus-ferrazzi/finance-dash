// D2: SVG → PNG com resvg (nativo, sem navegador). Fonte DejaVu do pacote npm; nada de fonte do sistema.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ARQUIVOS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

/** Onde está a fonte: FONTES_DIR, /app/fonts (imagem do worker) ou o pacote no node_modules (dev/testes). */
export function fontesPadrao(): string[] {
  const dirs = [process.env.FONTES_DIR, join(process.cwd(), 'fonts'), join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf')];
  for (const d of dirs) if (d && existsSync(join(d, ARQUIVOS[0]))) return ARQUIVOS.map((f) => join(d, f)).filter(existsSync);
  throw new Error('fonte DejaVuSans.ttf não encontrada');
}

/** O resvg (nativo) carrega só aqui: se o binário faltar, falha a imagem (vai o texto), não o worker. */
export async function paraPng(svg: string, fontes: string[] = fontesPadrao()): Promise<Buffer> {
  const m: any = await import('@resvg/resvg-js');
  const Resvg: typeof import('@resvg/resvg-js').Resvg = m.Resvg ?? m.default?.Resvg; // pacote CommonJS
  const r = new Resvg(svg, {
    font: { fontFiles: fontes, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
    fitTo: { mode: 'width', value: 1600 }, // D2-M7: 800 ficava borrado no celular
    background: '#FFFFFF',
  });
  return Buffer.from(r.render().asPng());
}
