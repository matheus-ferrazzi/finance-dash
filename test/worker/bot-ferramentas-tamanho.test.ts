import { expect, it } from 'vitest';
import { TOOLS } from '../../src/worker/bot/ferramentas';

it('27/10: a descrição de nenhuma ferramenta passa de 1.300 caracteres (propor_categoria tinha 3.843)', () => {
  // 28/10 (fase 3): vale também para consultar e calcular
  expect(TOOLS.map((t) => t.function.name)).toEqual(expect.arrayContaining(['consultar', 'calcular']));
  for (const t of TOOLS) expect(JSON.stringify(t).length, t.function.name).toBeLessThanOrEqual(1300);
});
