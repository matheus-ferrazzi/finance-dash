-- Exemplo. O seed real e gerado por scripts/gerar_seed_contas.mjs em db/seed_contas.local.sql (fora do git).
INSERT INTO pluggy_contas (account_id, banco, responsavel, forma, coleta_transacoes, coleta_saldo, coleta_faturas, coleta_investimentos)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Nubank', 'Matheus', 'Crédito', true, false, true, true),
  ('00000000-0000-0000-0000-000000000002', 'Nubank', 'Matheus', 'Débito',  true, true,  false, false)
ON CONFLICT (account_id) DO NOTHING;
