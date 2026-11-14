-- 14/11/2026: os títulos do Inter passam a vir da conexão nova (021). Os registros da conexão antiga (item cujas contas
-- são todas de antes de 14/11) saem de financas_investimentos para não contar duas vezes no patrimônio, e o item
-- antigo sai de pluggy_itens (senão o aviso de consentimento vencendo continuaria olhando para ele).
-- Até 13/11 o valor dos títulos era o bruto (preço público do Tesouro); a Pluggy devolve o líquido de IR, como nos
-- outros bancos. Falha, sem mudar nada, se a conexão nova ainda não gravou investimentos.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM financas_investimentos i
     WHERE i.banco = 'Inter' AND i.atualizado_em >= '2026-11-14'
       AND i.item_id IN (SELECT item_id FROM pluggy_contas WHERE banco = 'Inter' AND ativo AND criado_em >= '2026-11-14')
  ) THEN
    RAISE EXCEPTION 'conexao nova do Inter ainda sem investimentos: rode "node worker.js investimentos" no finance-worker antes';
  END IF;
END $$;
CREATE TEMP TABLE inter_itens_antigos ON COMMIT DROP AS
  SELECT DISTINCT item_id FROM pluggy_contas WHERE banco = 'Inter' AND item_id IS NOT NULL
  EXCEPT
  SELECT item_id FROM pluggy_contas WHERE banco = 'Inter' AND criado_em >= '2026-11-14';
DELETE FROM financas_investimentos WHERE banco = 'Inter' AND item_id IN (SELECT item_id FROM inter_itens_antigos);
DELETE FROM pluggy_itens WHERE item_id IN (SELECT item_id FROM inter_itens_antigos);
COMMIT;
