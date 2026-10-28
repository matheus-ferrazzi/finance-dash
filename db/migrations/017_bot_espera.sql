-- 28/10/2026: ms esperando a cota do Groq por pergunta (Zeca fase 2).
BEGIN;
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS espera_ms integer NOT NULL DEFAULT 0;
COMMIT;
