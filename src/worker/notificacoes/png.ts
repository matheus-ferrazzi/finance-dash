// D2: SVG → PNG com resvg (nativo, sem navegador). Fonte DejaVu do pacote npm; nada de fonte do sistema.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const ARQUIVOS = ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'];

/** Onde está a fonte: FONTES_DIR, /app/fonts (imagem do worker) ou o pacote no node_modules (dev/testes). */
export function fontesPadrao(): string[] {
  const dirs = [process.env.FONTES_DIR, join(process.cwd(), 'fonts'), join(process.cwd(), 'node_modules', 'dejavu-fonts-ttf', 'ttf')];
  for (const d of dirs) if (d && existsSync(join(d, ARQUIVOS[0]))) return ARQUIVOS.map((f) => join(d, f)).filter(existsSync);
  throw new Error('fonte DejaVuSans.ttf não encontrada');
}

export function paraPng(svg: string, fontes: string[] = fontesPadrao()): Buffer {
  const r = new Resvg(svg, {
    font: { fontFiles: fontes, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' },
    fitTo: { mode: 'width', value: 800 },
    background: '#FFFFFF',
  });
  return Buffer.from(r.render().asPng());
}
