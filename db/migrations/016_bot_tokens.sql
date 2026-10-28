-- 27/10/2026: tokens do Groq por pergunta (soma das rodadas), para medir o corte de tokens (Zeca fase 1).
BEGIN;
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS tokens integer NOT NULL DEFAULT 0;
COMMIT;
