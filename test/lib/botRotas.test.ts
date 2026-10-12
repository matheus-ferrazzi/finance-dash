import { describe, expect, it } from 'vitest';
import { lerParams } from '../../src/lib/botRotas';

const sp = (o: Record<string, string>) => new URLSearchParams(o);

describe('lerParams', () => {
  it('resolve período, pessoa e grupo válidos', () => {
    const r = lerParams(sp({ periodo: 'mes_passado', pessoa: 'Ariane', grupo: 'Mercado' }), '2026-10-11', ['periodo', 'pessoa', 'grupo']);
    expect(r).toEqual({ ok: true, v: { periodo: { inicio: '2026-09-01', fimExcl: '2026-10-01', label: 'set/26' }, pessoa: 'Ariane', grupo: 'Mercado' } });
  });
  it('erros com mensagem para o modelo', () => {
    expect(lerParams(sp({ periodo: 'ontem' }), '2026-10-11', ['periodo'])).toEqual({ ok: false, erro: 'periodo inválido: use hoje, esta_semana, semana_passada, este_mes, mes_passado ou AAAA-MM (não futuro)' });
    expect(lerParams(sp({ periodo: 'hoje', pessoa: 'Zé' }), '2026-10-11', ['periodo', 'pessoa'])).toEqual({ ok: false, erro: 'pessoa inválida: use casal, Matheus ou Ariane' });
    expect(lerParams(sp({ periodo: 'hoje', grupo: 'Xis' }), '2026-10-11', ['periodo', 'grupo']).ok).toBe(false);
  });
  it('sem pessoa = casal; sem grupo = null', () => {
    expect(lerParams(sp({ periodo: 'hoje' }), '2026-10-11', ['periodo', 'pessoa', 'grupo'])).toMatchObject({ ok: true, v: { pessoa: 'casal', grupo: null } });
  });
});
