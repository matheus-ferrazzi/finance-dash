# 💸 Finanças — Dashboard do Casal

Painel financeiro pessoal em **Next.js 14**, que lê os lançamentos, faturas e investimentos de um banco Postgres (alimentado por uma automação n8n + Pluggy) e mostra tudo de forma limpa, em português, com tema escuro e responsivo pro celular.

## ✨ Funcionalidades

- **Visão geral** — receita, despesa, saldo e patrimônio do período, com comparativo vs. período anterior.
- **Filtro dinâmico** — 7 dias, 15 dias, 30 dias ou por mês (com fuso `America/Sao_Paulo`).
- **Filtro por pessoa** — casal (consolidado), ou individual.
- **Gastos** — distribuição por categoria (rosca), por banco, e **drill-down**: clique numa categoria pra ver os lançamentos.
- **Orçamento** — tetos mensais por categoria com barra de progresso, alerta de estouro e drill-down do que consumiu.
- **Casa** — gastos fixos do lar (moradia, energia, água, internet, telefone) com evolução.
- **Faturas** — cartões, vencimento, limite usado, **compras do ciclo** (expandível) e **projeção da próxima fatura** (parcelas futuras já lançadas).
- **Investimentos** — carteira, lucro real, aportes por mês e evolução do patrimônio.
- **Assinaturas & recorrentes** — detecta cobranças que se repetem em 3+ meses e estima o gasto mensal fixo.
- **Buscar** — busca de qualquer lançamento por descrição.
- **Previsibilidade** — projeção mês a mês: quanto está comprometido, até quando, e quanto dinheiro sobra. Parte do **saldo real das contas** e nunca deixa um mês futuro "vazio" (usa parcelas já lançadas + compromissos fixos cadastrados + média real de gasto dos últimos 3 meses). Inclui **simulador de compra** ("se eu gastar X em Nx, fico no vermelho? por quanto tempo?").
- **Insights** — faixa de alertas automáticos no topo (teto estourado, fatura vencendo, saldo negativo).
- **Modo privado** — "olhinho" que borra todos os valores na tela (igual app de banco).

## 🧱 Stack

- Next.js 14 (App Router, Server Components) · React 18 · TypeScript
- TailwindCSS · Recharts · lucide-react
- PostgreSQL (via `pg`)

## 🔐 Classificação dos dados

O painel só considera **gastos e receitas reais** — transferências internas, pagamentos de fatura e aportes ficam fora dos totais, evitando números inflados. A classificação é feita pelo **worker de ingestão** (`src/worker/`) na hora de gravar; o painel só lê (com um usuário **somente-leitura**).

## ⚙️ Worker de ingestão (Pluggy → Postgres)

Container separado (`docker build --target worker -t finance-worker:1 .`) que busca transações, faturas, saldos, investimentos e status das conexões na Pluggy, em horário de São Paulo.

- **Modos** (`WORKER_MODO`): `sombra` (padrão — só lê a Pluggy e grava o próprio diagnóstico em `pluggy_*`), `real` (grava nas tabelas `financas_*`). `--dry-run` na linha de comando não grava nada.
- **Reconciliação:** lançamento que a Pluggy não devolve mais (cancelado ou recriado com outro id) sai de `financas_lancamentos` e vai para `financas_lancamentos_removidos` (a linha inteira em JSON). Trava se a Pluggy vier vazia ou se a remoção passar de 20% da conta.
- **Execução manual:** `docker exec finance-worker node worker.js <transacoes|faturas|saldos|investimentos|itens|tesouro> [--dry-run] [--desde AAAA-MM-DD] [--limite 0.2]`.
- **Contas:** tabela `pluggy_contas`. O seed real é gerado fora do git (`node scripts/gerar_seed_contas.mjs <export-do-n8n>` → `db/seed_contas.local.sql`).

### Testes

```bash
npm test                         # unitários
# integração do repositório (Postgres descartável):
docker run -d --rm --name pg-teste-c1 -e POSTGRES_PASSWORD=teste -p 127.0.0.1:55432:5432 postgres:15-alpine
docker exec pg-teste-c1 psql -U postgres -c "CREATE DATABASE personal_hub_db"
TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run test/integracao
```

## 🚀 Rodando

### Desenvolvimento

```bash
cp .env.example .env.local   # preencha as credenciais do Postgres
npm install
npm run dev                  # http://localhost:3000
```

### Docker (produção)

```bash
docker build -t finance-dash .
docker run -p 3000:3000 --env-file .env finance-dash
```

## ⚙️ Variáveis de ambiente

| Variável | Descrição |
|----------|-----------|
| `DB_HOST` | host do Postgres |
| `DB_PORT` | porta (padrão 5432) |
| `DB_NAME` | nome do banco |
| `DB_USER` | usuário (recomendado: somente leitura) |
| `DB_PASSWORD` | senha |

## 📄 Estrutura esperada no banco

Tabelas: `financas_lancamentos`, `financas_orcamento`, `financas_faturas`, `financas_investimentos`, `financas_patrimonio`. Os lançamentos usam as colunas `classe` (`despesa`/`receita`/`aporte`/`transferencia_interna`/`pagamento_fatura`/`estorno`) e `tipo_movimento`.

---

Feito com carinho pra organizar as finanças da casa. 🏠
