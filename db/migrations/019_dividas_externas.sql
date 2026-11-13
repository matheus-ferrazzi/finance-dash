-- Dívidas fora do banco (13/11/2026, plano realista): o que suja o nome e a Pluggy não vê.
-- Entram por cadastro na Trilha (origem 'manual') ou pela consulta sob demanda (origem 'consulta').
-- Só acrescenta. O painel escreve; o worker só lê.
BEGIN;
CREATE TABLE IF NOT EXISTS financas_dividas_externas (
  id            serial PRIMARY KEY,
  credor        text NOT NULL,
  responsavel   text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  valor         numeric(12,2) NOT NULL CHECK (valor > 0),
  negativada    boolean NOT NULL DEFAULT true,
  origem        text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'consulta')),
  -- dia da informação: o do cadastro ou o da consulta que trouxe a dívida
  referencia    date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::date),
  observacao    text,
  -- quitada (ou limpa): sai da fase "nome limpo" e fica no histórico
  quitada_em    date,
  -- identifica a mesma dívida entre duas consultas (credor + contrato); nula no cadastro à mão
  chave_consulta text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (responsavel, chave_consulta)
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON financas_dividas_externas TO dash_writer;
    GRANT USAGE, SELECT ON SEQUENCE financas_dividas_externas_id_seq TO dash_writer;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN
    GRANT SELECT ON financas_dividas_externas TO bot_readonly;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT SELECT ON financas_dividas_externas TO pluggy_worker;
  END IF;
END $$;
COMMIT;
