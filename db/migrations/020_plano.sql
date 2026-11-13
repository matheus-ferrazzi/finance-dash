-- O plano do casal (13/11/2026, plano realista): os tetos do dia a dia por grupo, em degraus.
-- Uma linha só. `tetos` = { "<grupo>": { "teto": número, "base": número } }; a base é a média do grupo quando o plano
-- foi criado, o ponto de partida dos degraus. Só acrescenta. O painel escreve; o worker só lê.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_plano (
  id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inicio        date NOT NULL,
  degraus       int NOT NULL CHECK (degraus BETWEEN 1 AND 12),
  tetos         jsonb NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_plano TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_plano TO bot_readonly;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT ON financas_plano TO pluggy_worker;
  END IF;
END $$;
COMMIT;
