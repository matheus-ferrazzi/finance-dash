-- 014: retenção de 1 ano das ações do bot (auditoria 13/10/2026, E2-M4). A limpeza diária do worker
-- (pluggy_worker) apaga ações com mais de 1 ano; a 010 só dava SELECT/INSERT/UPDATE.
-- Reverter: REVOKE DELETE ON financas_bot_acoes FROM pluggy_worker;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluggy_worker') THEN
    GRANT DELETE ON financas_bot_acoes TO pluggy_worker;
  END IF;
END $$;
