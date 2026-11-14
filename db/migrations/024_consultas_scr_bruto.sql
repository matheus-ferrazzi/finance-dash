-- 14/11/2026: na primeira consulta real o SCR veio com o consolidado zerado (11 operações em 4 instituições) e só o
-- resumo tinha sido guardado. Passa a guardar o relatório do SCR como veio, sem nome nem documento, para conferir o
-- formato. UPDATE para o painel reler um dossiê já pago (sem nova cobrança) quando o leitor melhora. Só acrescenta.
BEGIN;
ALTER TABLE financas_consultas_credito ADD COLUMN IF NOT EXISTS scr_bruto jsonb;
ALTER TABLE financas_consultas_credito ADD COLUMN IF NOT EXISTS relida_em timestamptz;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dash_writer') THEN
    GRANT UPDATE (dividas, nao_lidas, relida_em) ON financas_consultas_credito TO dash_writer;
  END IF;
END $$;
COMMIT;
