import { describe, expect, it } from 'vitest';
import { lerPessoa, resolverPeriodo } from '../../src/lib/periodos';

describe('resolverPeriodo (SP)', () => {
  it('hoje, esta semana (segunda até hoje), semana passada (seg a dom)', () => {
    expect(resolverPeriodo('hoje', '2026-10-15')).toEqual({ inicio: '2026-10-15', fimExcl: '2026-10-16', label: 'hoje' });
    expect(resolverPeriodo('esta_semana', '2026-10-15')).toEqual({ inicio: '2026-10-12', fimExcl: '2026-10-16', label: 'esta semana (12/10 a 15/10)' });
    expect(resolverPeriodo('esta_semana', '2026-10-12')).toEqual({ inicio: '2026-10-12', fimExcl: '2026-10-13', label: 'esta semana (12/10 a 12/10)' });
    expect(resolverPeriodo('semana_passada', '2026-10-12')).toEqual({ inicio: '2026-10-05', fimExcl: '2026-10-12', label: 'semana passada (05/10 a 11/10)' });
  });
  it('este mês até hoje; mês passado inteiro, com virada de ano', () => {
    expect(resolverPeriodo('este_mes', '2026-10-11')).toEqual({ inicio: '2026-10-01', fimExcl: '2026-10-12', label: 'out/26' });
    expect(resolverPeriodo('mes_passado', '2027-01-05')).toEqual({ inicio: '2026-12-01', fimExcl: '2027-01-01', label: 'dez/26' });
  });
  it('AAAA-MM: mês fechado inteiro; mês atual até hoje; futuro e lixo → null', () => {
    expect(resolverPeriodo('2026-08', '2026-10-11')).toEqual({ inicio: '2026-08-01', fimExcl: '2026-09-01', label: 'ago/26' });
    expect(resolverPeriodo('2026-10', '2026-10-11')).toEqual({ inicio: '2026-10-01', fimExcl: '2026-10-12', label: 'out/26' });
    expect(resolverPeriodo('2026-11', '2026-10-11')).toBeNull();
    expect(resolverPeriodo('ontem', '2026-10-11')).toBeNull();
    expect(resolverPeriodo('2026-13', '2026-10-11')).toBeNull();
  });
});

describe('lerPessoa', () => {
  it('casal (padrão), Matheus, Ariane; resto null', () => {
    expect([lerPessoa(null), lerPessoa('casal'), lerPessoa('Matheus'), lerPessoa('Ariane'), lerPessoa('fulano')]).toEqual(['casal', 'casal', 'Matheus', 'Ariane', null]);
  });
});
