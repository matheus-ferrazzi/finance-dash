-- Consultas de crédito sob demanda (14/11/2026, fase "nome limpo"): uma linha por consulta real na API Brasil.
-- Guarda só o que é dívida e o score; nada de cadastro (nome, mãe, endereço, telefone) nem o CPF. As dívidas lidas
-- vão para financas_dividas_externas (origem 'consulta'). Só acrescenta. O painel escreve; worker e bot só leem.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_consultas_credito (
  id           serial PRIMARY KEY,
  responsavel  text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  feita_em     timestamptz NOT NULL DEFAULT now(),
  -- R$ cobrados (dossiê + endividamento)
  custo        numeric(8,2) NOT NULL DEFAULT 0,
  score        int,
  score_faixa  text,
  -- resumo do SCR: aVencer, vencido, prejuizo, limite, instituicoes, operacoes, database; nulo se o SCR falhou
  scr          jsonb,
  -- blocos de dívida do dossiê como vieram (pendências, refin, protestos, cheques), sem cadastro
  pendencias   jsonb NOT NULL DEFAULT '{}',
  dividas      int NOT NULL DEFAULT 0,
  nao_lidas    int NOT NULL DEFAULT 0,
  avisos       text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS financas_consultas_credito_resp ON financas_consultas_credito (responsavel, feita_em DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT ON financas_consultas_credito TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_consultas_credito_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_consultas_credito TO bot_readonly;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT ON financas_consultas_credito TO pluggy_worker;
  END IF;
END $$;
COMMIT;
