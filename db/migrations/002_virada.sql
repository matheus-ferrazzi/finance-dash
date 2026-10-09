-- Aplicar SO na virada, depois de desligar o cron do sync_pluggy.sh (ele escreve 'Itau' sem acento).
BEGIN;
UPDATE financas_sync SET banco = 'Itaú'
 WHERE banco = 'Itau'
   AND NOT EXISTS (SELECT 1 FROM financas_sync s WHERE s.banco = 'Itaú' AND s.responsavel = financas_sync.responsavel);
UPDATE financas_sync_log SET banco = 'Itaú' WHERE banco = 'Itau';
COMMIT;
