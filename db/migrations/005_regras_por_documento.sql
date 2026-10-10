-- Regra de categoria por documento (CPF/CNPJ) da contraparte (projeto B): vale em qualquer banco e
-- qualquer grafia do nome. A regra por texto continua; o documento tem precedencia.
-- Os documentos ficam so no banco: as regras reais sao inseridas por SQL local, nunca no repositorio.
BEGIN;

CREATE TABLE IF NOT EXISTS financas_regras_categoria (
  id        serial PRIMARY KEY,
  padrao    text,
  categoria text NOT NULL,
  nota      text,
  criado_em timestamptz DEFAULT now()
);
ALTER TABLE financas_regras_categoria ADD COLUMN IF NOT EXISTS contraparte_doc text;
ALTER TABLE financas_regras_categoria ALTER COLUMN padrao DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financas_regras_categoria_tem_criterio') THEN
    ALTER TABLE financas_regras_categoria ADD CONSTRAINT financas_regras_categoria_tem_criterio
      CHECK (padrao IS NOT NULL OR contraparte_doc IS NOT NULL);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION categoria_vaga(cat text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $f$
  SELECT cat IS NULL OR cat IN ('Transfers','Transfer - PIX','Outros', 'Same person transfer','Transfer - Bank Slip');
$f$;

-- a versao de 2 argumentos sai; a de 3 tem doc_ opcional, entao chamada antiga (bots do n8n) continua valendo
DROP FUNCTION IF EXISTS categoria_efetiva(text, text);
CREATE OR REPLACE FUNCTION categoria_efetiva(desc_ text, cat_ text, doc_ text DEFAULT NULL) RETURNS text
LANGUAGE sql STABLE AS $f$
  SELECT CASE WHEN categoria_vaga(cat_) THEN
    COALESCE(
      (SELECT r.categoria FROM financas_regras_categoria r
        WHERE doc_ IS NOT NULL AND r.contraparte_doc = doc_ ORDER BY r.id DESC LIMIT 1),
      (SELECT r.categoria FROM financas_regras_categoria r
        WHERE r.padrao IS NOT NULL AND desc_ ILIKE '%' || r.padrao || '%'
        ORDER BY length(r.padrao) DESC LIMIT 1),
      COALESCE(cat_, 'Outros'))
  ELSE cat_ END;
$f$;

GRANT SELECT ON financas_regras_categoria TO bot_readonly;
COMMIT;
