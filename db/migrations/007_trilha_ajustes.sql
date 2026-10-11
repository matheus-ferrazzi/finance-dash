-- Ajustes da trilha pelo painel (F4b): metas (reserva, patrimônio) e marcações "é / não é dívida".
-- Só acrescenta: sem linha gravada, a trilha usa os padrões do código.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_trilha_config (
  chave         text PRIMARY KEY CHECK (chave IN ('meses_reserva', 'meta_patrimonio')),
  valor         numeric NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS financas_divida_marcacao (
  id        serial PRIMARY KEY,
  tipo      text NOT NULL CHECK (tipo IN ('nao_divida', 'divida')),
  chave     text NOT NULL,
  nome      text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_trilha_config, financas_divida_marcacao TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_divida_marcacao_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_trilha_config, financas_divida_marcacao TO bot_readonly;
  END IF;
END $$;
COMMIT;
