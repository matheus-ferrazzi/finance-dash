-- 012: par de transferência entre contas do casal (auditoria 13/10/2026, N2).
-- O PIX do Matheus do Itaú para o Bradesco chega dos dois lados: o Itaú manda "Same person transfer"
-- (transferência interna) e o Bradesco manda "Transfer - PIX" sem o documento do recebedor — e virava
-- RECEITA (~R$ 199/mês inventados). O worker pareia depois de cada ingestão: entrada "receita" com uma
-- saída "transferencia_interna" do mesmo valor, ±1 dia, em outra conta do casal → transferência interna.
-- A coluna guarda o par (id da saída) para a próxima ingestão não desfazer a marcação.
-- Só acrescenta (reverter: ALTER TABLE ... DROP COLUMN par_transferencia).
ALTER TABLE financas_lancamentos ADD COLUMN IF NOT EXISTS par_transferencia text;
