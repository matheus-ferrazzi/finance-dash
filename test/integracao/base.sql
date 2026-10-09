DROP SCHEMA public CASCADE; CREATE SCHEMA public;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bot_readonly') THEN CREATE ROLE bot_readonly; END IF; END $$;
CREATE TABLE financas_lancamentos (
  id_transacao varchar PRIMARY KEY, data_lancamento date NOT NULL, valor numeric NOT NULL, descricao text NOT NULL,
  categoria varchar, forma_pagamento varchar, banco varchar, responsavel varchar, status_pluggy varchar,
  criado_em timestamp DEFAULT CURRENT_TIMESTAMP, tipo_movimento varchar, classe varchar);
CREATE TABLE financas_faturas (id_conta varchar PRIMARY KEY, banco varchar, responsavel varchar, limite_total numeric,
  limite_disponivel numeric, valor_fatura_atual numeric, data_fechamento date, data_vencimento date, pagamento_minimo numeric,
  atualizado_em timestamp DEFAULT now());
CREATE TABLE financas_saldos (id_conta text PRIMARY KEY, banco text NOT NULL, responsavel text NOT NULL, tipo text,
  saldo numeric NOT NULL DEFAULT 0, atualizado_pluggy timestamp, atualizado_em timestamp NOT NULL DEFAULT now());
CREATE TABLE financas_investimentos (id_investimento varchar PRIMARY KEY, item_id varchar, nome varchar, tipo varchar,
  subtipo varchar, valor_investido numeric, valor_atual numeric, lucro_acumulado numeric, quantidade numeric,
  rentabilidade_anual numeric, data_vencimento date, banco varchar, responsavel varchar, status varchar,
  atualizado_em timestamp DEFAULT now());
CREATE TABLE financas_sync (banco varchar NOT NULL, responsavel varchar NOT NULL, last_sync timestamptz,
  checked_at timestamptz DEFAULT now(), PRIMARY KEY (banco, responsavel));
CREATE TABLE financas_sync_log (id serial PRIMARY KEY, banco varchar, responsavel varchar, last_sync timestamptz,
  observed_at timestamptz DEFAULT now());
CREATE TABLE financas_compromissos (id serial PRIMARY KEY, nome text, categoria text, valor numeric, responsavel text,
  data_inicio date, meses_totais int, ativo boolean DEFAULT true, observacao text, criado_em timestamp DEFAULT now(), atualizado_em timestamp);
CREATE FUNCTION categoria_efetiva(d text, c text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT c $$;
