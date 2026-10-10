import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export { versaoMudou } from './versaoMudou';

/** Identificador do build em produção (o Next grava em .next/BUILD_ID). */
export function lerVersao(): string {
  try { return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() || 'desconhecida'; } catch { return 'desconhecida'; }
}
