-- E3: gasto em dinheiro vivo (não passa pelo banco). Só as visões de gasto por categoria leem esta tabela;
-- previsão, ritmo e trilha (saldo do banco) não. Também libera o tipo 'dinheiro' nas propostas do bot.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_gastos_dinheiro (
  id          bigserial PRIMARY KEY,
  data        date NOT NULL,
  valor       numeric(12,2) NOT NULL CHECK (valor > 0 AND valor <= 10000),
  descricao   text NOT NULL CHECK (length(descricao) BETWEEN 1 AND 80),
  categoria   text NOT NULL,
  responsavel text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  origem      text NOT NULL DEFAULT 'bot',
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financas_gastos_dinheiro_data_idx ON financas_gastos_dinheiro (data);
ALTER TABLE financas_bot_acoes DROP CONSTRAINT IF EXISTS financas_bot_acoes_tipo_check;
ALTER TABLE financas_bot_acoes ADD CONSTRAINT financas_bot_acoes_tipo_check CHECK (tipo IN ('categoria', 'avulsa', 'dinheiro'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, DELETE ON financas_gastos_dinheiro TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_gastos_dinheiro_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_gastos_dinheiro TO bot_readonly;
  END IF;
END $$;
COMMIT;
