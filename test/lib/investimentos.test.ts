import { describe, expect, it } from 'vitest';
import { resumoCarteira } from '../../src/lib/investimentos';

// S6 (auditoria 13/10): o Bot 04 do Telegram (carteira) não tinha substituto no WhatsApp
describe('resumo da carteira', () => {
  const i = (nome: string, tipo: string, atual: number) => ({ nome, tipo, atual });
  it('total, por tipo (maior primeiro) e os 5 maiores ativos', () => {
    const r = resumoCarteira([i('A', 'FIXED_INCOME', 1000), i('B', 'FIXED_INCOME', 500), i('C', 'EQUITY', 700), i('D', 'MUTUAL_FUND', 10),
      i('E', 'EQUITY', 5), i('F', 'EQUITY', 1)]);
    expect(r.total).toBe(2216);
    expect(r.porTipo).toEqual([{ tipo: 'Renda fixa', total: 1500 }, { tipo: 'Ações', total: 706 }, { tipo: 'Fundos', total: 10 }]);
    expect(r.maiores.map((m) => m.nome)).toEqual(['A', 'C', 'B', 'D', 'E']);
  });
  it('carteira vazia', () => {
    expect(resumoCarteira([])).toEqual({ total: 0, porTipo: [], maiores: [] });
  });
});
