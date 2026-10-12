// E1: trava de número. Todo R$ da resposta do modelo tem que ter vindo de uma ferramenta.
export function valoresBRL(texto: string): number[] {
  const out: number[] = [];
  for (const m of texto.matchAll(/(-?)\s*R\$\s*(-?)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/g)) {
    const n = Number(m[3].replace(/\./g, '').replace(',', '.'));
    out.push(m[1] || m[2] ? -n : n);
  }
  return out;
}

function numeros(x: unknown, out: number[] = []): number[] {
  if (typeof x === 'number' && Number.isFinite(x)) out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => numeros(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numeros(v, out));
  return out;
}

export function respostaConfere(resposta: string, resultados: unknown[]): boolean {
  const ok = numeros(resultados).map(Math.abs);
  return valoresBRL(resposta).every((v) => ok.some((n) => Math.abs(Math.abs(v) - n) < 0.006 || Math.abs(Math.abs(v) - Math.round(n)) < 0.006));
}
