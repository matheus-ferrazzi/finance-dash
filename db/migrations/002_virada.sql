-- Aplicar SO na virada, depois de desligar o cron do sync_pluggy.sh (ele escreve 'Itau' sem acento).
BEGIN;
UPDATE financas_sync SET banco = 'Itaú'
 WHERE banco = 'Itau'
   AND NOT EXISTS (SELECT 1 FROM financas_sync s WHERE s.banco = 'Itaú' AND s.responsavel = financas_sync.responsavel);
UPDATE financas_sync_log SET banco = 'Itaú' WHERE banco = 'Itau';

-- Liga cada linha antiga (sem account_id) a conta do SEED pela combinacao banco + responsavel + forma.
-- Conta descoberta depois (tipo_pluggy preenchido, ex.: poupanca) tem a mesma combinacao e nunca entra:
-- sem isto, a reconciliacao dela enxergaria linhas da conta corrente como "sumidas".
UPDATE financas_lancamentos l SET account_id = c.account_id
  FROM pluggy_contas c
 WHERE l.account_id IS NULL AND c.tipo_pluggy IS NULL
   AND c.banco = l.banco AND c.responsavel = l.responsavel AND c.forma = l.forma_pagamento;
COMMIT;
