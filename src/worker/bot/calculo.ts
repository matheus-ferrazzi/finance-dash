// 28/10 (fase 3): a calculadora do Zeca. Ele não faz conta de cabeça: soma, diferença, "quantas vezes" e % vêm daqui,
// e o resultado vale como dado para a trava. Analisador próprio (sem eval): números, + - * / ( ), menos unário, % pós-fixo.
type Res = { ok: true; dados: { expressao: string; resultado: number } } | { ok: false; dados: { erro: string } };

const MAX = 200;

export function calcular(expressao: string): Res {
  const s = String(expressao ?? '');
  if (!s.trim()) return { ok: false, dados: { erro: 'expressão vazia' } };
  if (s.length > MAX) return { ok: false, dados: { erro: `expressão longa demais (até ${MAX} caracteres)` } };
  let i = 0;
  const espaco = () => { while (s[i] === ' ') i++; };
  const falha = (m: string): never => { throw new Error(m); };

  function primario(): number {
    espaco();
    if (s[i] === '(') {
      i++;
      const v = soma();
      espaco();
      if (s[i] !== ')') falha('parêntese sem fechar');
      i++;
      return v;
    }
    if (s[i] === '-') { i++; return -primario(); }
    if (s[i] === '+') { i++; return primario(); }
    const m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
    if (!m) falha(`esperava um número na posição ${i + 1}`);
    i += m![0].length;
    let v = Number(m![0]);
    espaco();
    if (s[i] === '%') { i++; v /= 100; }
    return v;
  }
  function produto(): number {
    let v = primario();
    for (;;) {
      espaco();
      const op = s[i];
      if (op !== '*' && op !== '/') return v;
      i++;
      const d = primario();
      if (op === '/' && d === 0) falha('divisão por zero');
      v = op === '*' ? v * d : v / d;
    }
  }
  function soma(): number {
    let v = produto();
    for (;;) {
      espaco();
      const op = s[i];
      if (op !== '+' && op !== '-') return v;
      i++;
      v = op === '+' ? v + produto() : v - produto();
    }
  }

  try {
    const v = soma();
    espaco();
    if (i < s.length) falha(`sobrou "${s.slice(i)}"`);
    if (!Number.isFinite(v)) falha('resultado inválido');
    return { ok: true, dados: { expressao: s, resultado: Math.round(v * 100) / 100 } };
  } catch (e) {
    return { ok: false, dados: { erro: `não deu para calcular: ${e instanceof Error ? e.message : String(e)}; use números com ponto e + - * / ( ) %` } };
  }
}
