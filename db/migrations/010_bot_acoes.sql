-- Ações do bot (E2): proposta → confirmada (sim de quem pediu) → feita → desfeita. Sem telefone.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_bot_acoes (
  id            bigserial PRIMARY KEY,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  pessoa        text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('categoria', 'avulsa')),
  params        jsonb NOT NULL,
  resumo        text NOT NULL,
  estado        text NOT NULL DEFAULT 'pendente'
                CHECK (estado IN ('pendente','confirmada','executando','feita','cancelada','expirada','substituida','desfeita','erro')),
  resultado     jsonb
);
CREATE INDEX IF NOT EXISTS financas_bot_acoes_pessoa_idx ON financas_bot_acoes (pessoa, id DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON financas_bot_acoes TO pluggy_worker;
    GRANT USAGE, SELECT ON SEQUENCE financas_bot_acoes_id_seq TO pluggy_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, UPDATE ON financas_bot_acoes TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_bot_acoes TO bot_readonly;
  END IF;
END $$;
COMMIT;
