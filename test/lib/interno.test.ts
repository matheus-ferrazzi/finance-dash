import { describe, expect, it } from 'vitest';
import { acessoInterno } from '../../src/lib/interno';

// Auditoria 13/10 (D): rotas do worker exigem o token interno quando ele está configurado
describe('acesso às rotas internas', () => {
  it('token configurado: só passa com o cabeçalho igual', () => {
    expect(acessoInterno('abc123', 'abc123')).toBe(true);
    expect(acessoInterno('abc123', 'abc124')).toBe(false);
    expect(acessoInterno('abc123', null)).toBe(false);
    expect(acessoInterno('abc123', '')).toBe(false);
  });
  it('sem token configurado (antes do script rodar): passa — não quebra o worker no meio do deploy', () => {
    expect(acessoInterno(undefined, null)).toBe(true);
    expect(acessoInterno('', null)).toBe(true);
  });
});
