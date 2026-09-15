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

O painel só considera **gastos e receitas reais** — transferências internas, pagamentos de fatura e aportes ficam fora dos totais, evitando números inflados. A lógica de classificação vive na automação (n8n) que popula o banco; aqui só é feita a leitura (idealmente com um usuário **somente-leitura**).

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
