-- 23/10/2026: o worker (pluggy_worker) passou a chamar categoria_efetiva() — no gasto grande (19/10) e no
-- pareamento de transferências (L4, 22/10) — e a função lê financas_regras_categoria, que ele não podia ler:
-- "permission denied" a cada gasto grande desde 20/10 e na ingestão de 22/10 às 22h05. Só leitura.
GRANT SELECT ON financas_regras_categoria TO pluggy_worker;
