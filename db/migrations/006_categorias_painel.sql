-- Categorias pelo painel (F4): categoria_banco guarda o que veio do banco; categoria passa a ser a efetiva.
-- O que o painel faz fica em financas_categoria_painel (as regras antigas, por SQL, continuam na
-- financas_regras_categoria e valem só para categoria vaga, na leitura).
BEGIN;
ALTER TABLE financas_lancamentos ADD COLUMN IF NOT EXISTS categoria_banco text;
UPDATE financas_lancamentos SET categoria_banco = categoria WHERE categoria_banco IS NULL;

CREATE TABLE IF NOT EXISTS financas_categoria_painel (
  id        serial PRIMARY KEY,
  tipo      text NOT NULL CHECK (tipo IN ('lancamento', 'doc', 'texto')),
  chave     text NOT NULL,
  categoria text NOT NULL,
  nome      text,
  afetados  int NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chave)
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_categoria_painel TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_categoria_painel_id_seq TO dash_writer;
    GRANT SELECT ON financas_lancamentos TO dash_writer;
    GRANT UPDATE (categoria, classe) ON financas_lancamentos TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT ON financas_categoria_painel TO pluggy_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_categoria_painel TO bot_readonly;
  END IF;
END $$;
COMMIT;
