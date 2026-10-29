-- 28/10/2026: veredito do conferente por pergunta (Zeca fase 3).
BEGIN;
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS conferencia text;
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS problemas jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS tokens_conferente integer NOT NULL DEFAULT 0;
COMMIT;
