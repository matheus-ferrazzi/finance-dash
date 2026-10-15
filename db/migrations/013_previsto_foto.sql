-- 013: foto do previsto (auditoria 13/10/2026, N15). O "previsto na véspera" dos meses passados era recalculado
-- com o que se sabe HOJE (compromissos e categorias corrigidos depois), então o previsto × real media com
-- informação que não existia no dia 1. O painel grava a previsão do mês no dia 1 (resumo mensal) ou na
-- primeira vez que alguém abre a previsão no mês; o passado passa a ler a foto quando ela existe.
-- Só acrescenta (reverter: DROP TABLE financas_previsto_foto).
BEGIN;
CREATE TABLE IF NOT EXISTS financas_previsto_foto (
  resp        text NOT NULL CHECK (resp IN ('casal', 'Matheus', 'Ariane')),
  mes         text NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  componentes jsonb NOT NULL,
  feito_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resp, mes)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT ON financas_previsto_foto TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_previsto_foto TO bot_readonly;
  END IF;
END $$;
COMMIT;
