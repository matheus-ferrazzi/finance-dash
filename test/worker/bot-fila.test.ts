import { describe, expect, it } from 'vitest';
import { FilaBot } from '../../src/worker/bot/fila';

describe('FilaBot', () => {
  it('processa um por vez, na ordem; erro de um não para a fila', async () => {
    const ordem: string[] = [];
    let soltar!: () => void;
    const f = new FilaBot<string>(async (x) => {
      if (x === 'a') await new Promise<void>((r) => (soltar = r));
      if (x === 'b') throw new Error('falhou');
      ordem.push(x);
    }, 5, () => {});
    f.colocar('a'); f.colocar('b'); f.colocar('c');
    expect(ordem).toEqual([]);
    soltar();
    await new Promise((r) => setTimeout(r, 20));
    expect(ordem).toEqual(['a', 'c']);
  });
  it('acima do máximo: avisa "cheia" e não enfileira', async () => {
    const cheias: string[] = [];
    const f = new FilaBot<string>(() => new Promise(() => {}), 2, (x) => cheias.push(x));
    ['a', 'b', 'c', 'd'].forEach((x) => f.colocar(x));
    expect(cheias).toEqual(['d']);
  });
});
