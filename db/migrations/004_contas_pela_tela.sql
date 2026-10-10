-- Contas do mes pela tela: "repetir todo mes" (avulsa confirmada pelo banco vira conta fixa)
-- e "alterar valor" (previsto da conta fixa do mes em diante; avulsa ainda nao confirmada).
-- O "pago" continua vindo so do banco; o painel nunca grava valor pago.
BEGIN;
ALTER TABLE financas_contas_fixas ADD COLUMN IF NOT EXISTS valor_definido_em date; -- dali em diante vale valor_previsto, nao o historico

GRANT INSERT (nome, responsavel, valor_previsto, padrao, banco, tolerancia, inicio, ordem) ON financas_contas_fixas TO dash_writer;
GRANT USAGE ON SEQUENCE financas_contas_fixas_id_seq TO dash_writer;
GRANT UPDATE (valor_previsto, valor_definido_em) ON financas_contas_fixas TO dash_writer;
GRANT UPDATE (valor) ON financas_contas_marcas TO dash_writer;
COMMIT;
