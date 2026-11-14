-- 14/11/2026: o Inter voltou pela segunda conta da Pluggy (variáveis PLUGGY_INTER_* no worker). A tarefa `itens`
-- descobre as contas do item novo e as grava desligadas, como qualquer conta nova; esta migração as liga, com saldo,
-- lançamentos e investimentos (o worker visita os investimentos uma vez por item). Acha as contas novas pela data de
-- criação: as antigas do Inter (de 2025, conexão que saiu do Meu Pluggy em 17/10) seguem desligadas.
-- Falha, sem mudar nada, se as contas novas ainda não foram descobertas.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pluggy_contas WHERE banco = 'Inter' AND responsavel = 'Matheus' AND criado_em >= '2026-11-14') THEN
    RAISE EXCEPTION 'contas novas do Inter ainda nao descobertas: rode "node worker.js itens" no finance-worker antes';
  END IF;
END $$;
UPDATE pluggy_contas
   SET ativo = true, coleta_transacoes = true, coleta_saldo = true, coleta_investimentos = true
 WHERE banco = 'Inter' AND responsavel = 'Matheus' AND criado_em >= '2026-11-14' AND forma = 'Débito';
COMMIT;
