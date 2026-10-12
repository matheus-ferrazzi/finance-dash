-- Bot de perguntas (E1): o que foi perguntado no grupo e como foi respondido. Sem telefone. 90 dias.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_bot_conversas (
  id             bigserial PRIMARY KEY,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  pessoa         text NOT NULL,
  pergunta       text NOT NULL,
  ferramentas    jsonb NOT NULL DEFAULT '[]',
  resposta       text,
  modelo         text,
  ms             integer NOT NULL DEFAULT 0,
  trava          boolean NOT NULL DEFAULT false,
  sem_ferramenta boolean NOT NULL DEFAULT false,
  erro           text
);
CREATE INDEX IF NOT EXISTS financas_bot_conversas_idx ON financas_bot_conversas (criado_em DESC);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT, INSERT, DELETE ON financas_bot_conversas TO pluggy_worker;
    GRANT USAGE, SELECT ON SEQUENCE financas_bot_conversas_id_seq TO pluggy_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_bot_conversas TO bot_readonly;
  END IF;
END $$;
COMMIT;
