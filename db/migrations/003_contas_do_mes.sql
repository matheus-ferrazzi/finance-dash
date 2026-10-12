-- Contas do mes (projeto G): a lista de papel da Ariane, conferida com o banco.
-- Contas fixas sao cadastradas por SQL (seed local, fora do git); a tela so grava marcacoes.
BEGIN;

CREATE TABLE IF NOT EXISTS financas_contas_fixas (
  id             serial PRIMARY KEY,
  nome           text NOT NULL,                -- como ela chama: "Escola", nao "PIX Fulano"
  responsavel    text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  valor_previsto numeric(12,2) NOT NULL CHECK (valor_previsto > 0),
  padrao         text NOT NULL,                -- regex (sem caixa) sobre a descricao do lancamento
  banco          text,                         -- so lancamentos deste banco; null = qualquer
  tolerancia     numeric(5,3),                 -- fracao aceita em torno do previsto; null = qualquer valor
  somar          boolean NOT NULL DEFAULT false, -- soma todos os pagamentos do mes (MEI em duas guias)
  inicio         date NOT NULL,                -- primeiro mes (dia 1)
  parcelas       integer CHECK (parcelas > 0), -- com parcelas, some depois da ultima
  ate            date,                         -- "remover de vez": ultimo mes (dia 1); o historico continua
  ordem          integer NOT NULL DEFAULT 0,
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

-- Marcacao feita na tela: check (pago=true) ou "tirar deste mes" (pago=false) numa conta fixa (conta_id),
-- ou conta avulsa do mes (nome + valor). Nunca vale como pagamento por si so: fica "a confirmar"
-- ate o banco mostrar o pagamento.
CREATE TABLE IF NOT EXISTS financas_contas_marcas (
  id          serial PRIMARY KEY,
  mes         char(7) NOT NULL CHECK (mes ~ '^\d{4}-\d{2}$'),
  conta_id    integer REFERENCES financas_contas_fixas(id) ON DELETE CASCADE,
  responsavel text NOT NULL CHECK (responsavel IN ('Matheus', 'Ariane')),
  nome        text CHECK (length(nome) <= 120),
  valor       numeric(12,2) CHECK (valor > 0 AND valor < 1000000),
  pago        boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CHECK ((conta_id IS NOT NULL AND nome IS NULL AND valor IS NULL) OR (conta_id IS NULL AND nome IS NOT NULL AND valor IS NOT NULL AND pago))
);
CREATE UNIQUE INDEX IF NOT EXISTS financas_contas_marcas_um_check ON financas_contas_marcas (mes, conta_id) WHERE conta_id IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN CREATE ROLE dash_writer; END IF;
END $$;
GRANT SELECT ON financas_contas_fixas, financas_contas_marcas TO bot_readonly;
-- o painel grava marcacoes e so pode encerrar conta fixa (coluna ate); nome, valor e padrao nao se editam pela tela
GRANT SELECT, INSERT, DELETE ON financas_contas_marcas TO dash_writer;
GRANT UPDATE (pago) ON financas_contas_marcas TO dash_writer;
GRANT SELECT ON financas_contas_fixas TO dash_writer;
GRANT UPDATE (ate) ON financas_contas_fixas TO dash_writer;
GRANT USAGE ON SEQUENCE financas_contas_marcas_id_seq TO dash_writer;

COMMIT;
