-- Notificações no worker (C2): o que cada bot mandou (ou mandaria, em sombra) e o estado dele
-- (marca d'água do gasto grande, faturas já avisadas). Só acrescenta.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_notificacoes (
  id        bigserial PRIMARY KEY,
  bot       text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  modo      text NOT NULL CHECK (modo IN ('sombra', 'real')),
  texto     text,
  enviado   boolean NOT NULL DEFAULT false,
  erro      text,
  estado    jsonb
);
CREATE INDEX IF NOT EXISTS financas_notificacoes_bot_idx ON financas_notificacoes (bot, id DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT, INSERT ON financas_notificacoes TO pluggy_worker;
    GRANT USAGE, SELECT ON SEQUENCE financas_notificacoes_id_seq TO pluggy_worker;
    IF to_regclass('financas_backup') IS NOT NULL THEN
      GRANT SELECT ON financas_backup TO pluggy_worker;
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_notificacoes TO bot_readonly;
  END IF;
END $$;
COMMIT;
