import { describe, expect, it } from 'vitest';
import { versaoMudou } from '../../src/lib/versao';

describe('versaoMudou', () => {
  it('avisa só quando as duas versões são conhecidas e diferentes', () => {
    expect(versaoMudou('abc', 'def')).toBe(true);
    expect(versaoMudou('abc', 'abc')).toBe(false);
    expect(versaoMudou('abc', null)).toBe(false);
    expect(versaoMudou('desconhecida', 'def')).toBe(false);
    expect(versaoMudou('abc', 'desconhecida')).toBe(false);
  });
});
