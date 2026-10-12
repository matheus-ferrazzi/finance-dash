-- C1: ingestao da Pluggy no app. Tudo aditivo; seguro de rodar com o n8n ainda ativo.
-- Aplicar como mferrazzi:
--   docker exec -i postgres-hub psql -U mferrazzi -d personal_hub_db -v ON_ERROR_STOP=1 < 001_c1_ingestao.sql
-- Depois, no psql interativo (a senha e digitada por quem opera, nunca fica em arquivo):
--   \password pluggy_worker
BEGIN;

CREATE TABLE IF NOT EXISTS pluggy_contas (
  account_id           text PRIMARY KEY,
  item_id              text,
  banco                text NOT NULL,
  responsavel          text NOT NULL,
  forma                text NOT NULL CHECK (forma IN ('Crédito', 'Débito')),
  tipo_pluggy          text,
  coleta_transacoes    boolean NOT NULL DEFAULT true,
  coleta_saldo         boolean NOT NULL DEFAULT false,
  coleta_faturas       boolean NOT NULL DEFAULT false,
  coleta_investimentos boolean NOT NULL DEFAULT false,
  ativo                boolean NOT NULL DEFAULT true,
  criado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pluggy_itens (
  item_id            text PRIMARY KEY,
  banco              text NOT NULL,
  responsavel        text NOT NULL,
  status             text,
  execution_status   text,
  last_updated_at    timestamptz,
  next_auto_sync_at  timestamptz,
  consent_expires_at timestamptz,
  checado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pluggy_transacoes (
  id           text PRIMARY KEY,
  account_id   text NOT NULL,
  raw          jsonb NOT NULL,
  primeira_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez   timestamptz NOT NULL DEFAULT now(),
  removida_em  timestamptz
);
CREATE INDEX IF NOT EXISTS pluggy_transacoes_conta ON pluggy_transacoes (account_id);

CREATE TABLE IF NOT EXISTS pluggy_execucoes (
  id        bigserial PRIMARY KEY,
  tarefa    text NOT NULL,
  modo      text NOT NULL,
  inicio    timestamptz NOT NULL,
  fim       timestamptz NOT NULL,
  ok        boolean NOT NULL,
  contagens jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro      text
);

ALTER TABLE financas_lancamentos
  ADD COLUMN IF NOT EXISTS account_id          text,
  ADD COLUMN IF NOT EXISTS parcela_numero      integer,
  ADD COLUMN IF NOT EXISTS parcela_total       integer,
  ADD COLUMN IF NOT EXISTS data_compra         date,
  ADD COLUMN IF NOT EXISTS fatura_id           text,
  ADD COLUMN IF NOT EXISTS fatura_prevista     text,
  ADD COLUMN IF NOT EXISTS contraparte_nome    text,
  ADD COLUMN IF NOT EXISTS contraparte_doc     text,
  ADD COLUMN IF NOT EXISTS loja_cnpj           text,
  ADD COLUMN IF NOT EXISTS loja_cnae           text,
  ADD COLUMN IF NOT EXISTS categoria_id        text,
  ADD COLUMN IF NOT EXISTS tipo_operacao       text,
  ADD COLUMN IF NOT EXISTS transferencia_casal boolean,
  ADD COLUMN IF NOT EXISTS visto_pluggy_em     timestamptz;
CREATE INDEX IF NOT EXISTS financas_lancamentos_conta_data ON financas_lancamentos (account_id, data_lancamento);

-- linha inteira em JSON: imune a coluna nova; reverter com jsonb_populate_record
CREATE TABLE IF NOT EXISTS financas_lancamentos_removidos (
  id           bigserial PRIMARY KEY,
  id_transacao text NOT NULL,
  dados        jsonb NOT NULL,
  removido_em  timestamptz NOT NULL DEFAULT now(),
  motivo       text NOT NULL
);

CREATE TABLE IF NOT EXISTS financas_faturas_historico (
  id            text PRIMARY KEY,
  account_id    text NOT NULL,
  vencimento    date,
  total         numeric,
  minimo        numeric,
  encargos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  pagamentos    jsonb NOT NULL DEFAULT '[]'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    CREATE ROLE pluggy_worker LOGIN;
  END IF;
END $$;
GRANT CONNECT ON DATABASE personal_hub_db TO pluggy_worker;
GRANT USAGE ON SCHEMA public TO pluggy_worker;
GRANT SELECT, INSERT, UPDATE ON pluggy_contas, pluggy_itens, pluggy_transacoes, pluggy_execucoes TO pluggy_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON financas_lancamentos TO pluggy_worker;
GRANT SELECT, INSERT ON financas_lancamentos_removidos TO pluggy_worker;
GRANT SELECT, INSERT, UPDATE ON financas_faturas, financas_faturas_historico, financas_saldos, financas_investimentos, financas_sync TO pluggy_worker;
GRANT SELECT, INSERT ON financas_sync_log TO pluggy_worker;
GRANT USAGE ON SEQUENCE pluggy_execucoes_id_seq, financas_lancamentos_removidos_id_seq, financas_sync_log_id_seq TO pluggy_worker;

-- o painel le o diagnostico; o dado cru (CPF e conta de terceiros) fica fora do bot_readonly
GRANT SELECT ON pluggy_contas, pluggy_itens, pluggy_execucoes, financas_faturas_historico, financas_lancamentos_removidos TO bot_readonly;

COMMIT;
