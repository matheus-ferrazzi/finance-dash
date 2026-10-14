# Onda 5 — Uma pergunta por tela (Gastos, Faturas, Contas, Previsão)

Data: 14/10/2026 · Projeto: Finanças do Casal (painel Next.js) · Auditoria de 13/10, Onda 5.
Mockups aprovados pelo Matheus em 14/10 (as 4 telas): `.superpowers/brainstorm/1880-1791996782/content/onda5-telas.html` (local, fora do git).

## Objetivo

As telas internas passam a seguir o padrão da home (F1): cada uma abre **respondendo a sua pergunta** — pergunta em letra pequena, número grande colorido — e o detalhe vem abaixo, reordenado. Mesmo visual da home, cabeçalho de uma linha, e elos entre as telas.

O que incomodava (resposta do Matheus): não acha a resposta rápido; visual velho, destoa da home; navegação entre telas.

## Decisões

| Tema | Decisão |
|---|---|
| Caminho | **A — uma pergunta por tela** (não B "gráfico em toda tela", não C "reorganizar telas") |
| Números | Os mesmos de hoje; muda a forma. Nenhum cálculo novo de previsão. Duas consultas novas só de leitura (média por grupo até o mesmo dia; vencimentos futuros a partir do que já existe) |
| Barra de baixo | Fica Início · Contas · Gastos · Previsão · Mais. Faturas é aberta por dentro (bloco Cartões da home, elo do crédito em Gastos, faturas na lista de Contas) |
| Bibliotecas | Nenhuma nova. A rosca (`CategoriaDonut`, recharts) sai de Gastos |
| Classificação | Gastos mostra **grupos** (decisão de 13/10: hierarquia = grupos); categoria só dentro do grupo |

## 1. Cabeçalho (todas as telas)

Uma linha no celular: `‹ mês ›` · Casal/Matheus/Ariane · bolinha de sincronização · olho.

- **Bolinha** no lugar do selo "há 3 dias": verde (< 24 h), âmbar (24–48 h), vermelha (> 48 h) pelo banco mais atrasado, as mesmas faixas do `SyncBadge` de hoje; toque leva a `/diagnostico`. `aria-label` com o texto de hoje ("há 3 dias").
- O seletor 7 dias / 15 dias / 30 dias / Mês sai do cabeçalho e vai para dentro do card de grupos da Gastos (só ela usa).
- Onde não há mês (Previsão, Simulador, Trilha, Regras — `temSeletorDeMes` já existe), a linha fica só com pessoa · bolinha · olho. **Faturas entra nessa lista**: fatura é "agora", o mês do topo não muda nada nela.

## 2. Gastos — "Pra onde foi o dinheiro, e o dia a dia está dentro do que cabe?"

**Topo (card-resposta):**
- Mês em andamento: "Dia a dia (débito e PIX) em <mês>" · **R$ gasto** "de R$ X que cabem" · barra (gasto ÷ cabe; âmbar ≥ 80%, vermelha > 100%) · "Ritmo R$ a/dia · cabe R$ b/dia até o dia N". Fonte: `computeRitmo` — gasto = `base.mesCorrente.variavelJaGasto`, cabe no mês = gasto + `sobraParaODiaADia` (≥ 0), ritmos = `ritmoAtualDia` / `ritmoSeguroDia`. É o mesmo número do bloco "Ritmo do dia" da home.
- Mês fechado: "Dia a dia em <mês>" · **R$ gasto** · "média dos 3 meses antes: R$ m" (sem "cabe").
- Período 7/15/30 dias: "Dia a dia nos últimos N dias" · **R$** · "R$ x/dia".

**Corpo:** card "Tudo que saiu no <período> · R$ total" com a barra empilhada da home (`BarraGrupos`, já existe) e a lista de **grupos** (emoji, nome, até 3 categorias de apoio, valor, seta vs média). Toque no grupo expande as categorias; toque na categoria expande os lançamentos (o `CategoryAccordion` de hoje, um nível abaixo). Grupos depois do 4º ficam em "+ N grupos" (toque expande). O seletor de período fica no canto do card.

**Seta vs média:** mesmo símbolo do semanal (`seta()` de `textosD.ts`, extraída para `lib`): compara o grupo no período com a média dos **3 meses fechados anteriores até o mesmo dia do mês** (no mês em andamento) ou do mês inteiro (mês fechado). Período 7/15/30 dias: sem seta.

**Elos:** "💳 R$ X foram no crédito → ver faturas" (soma das despesas `forma = 'Crédito'` no período; some se 0). Filtros da URL de hoje (`grupo`, `tipo=livre`, `forma=debito`, `p=sem-…`) continuam valendo, com o chip "× limpar".

**Sai:** cartões Total / Lançamentos / Ticket médio, rosca, "Por banco". O 💵 de dinheiro vivo continua (linha "inclui R$ X em dinheiro vivo").

## 3. Faturas — "Quanto vai sair dos cartões, e quando?"

**Topo:** "Próximo pagamento".
- Há fatura fechada a vencer ou em atraso (`totalAPagar` > 0): **R$ total** · "Nubank (Matheus) vence 07/11" (a de vencimento mais próximo; várias = "+ 1 fatura"). Atrasada em vermelho.
- Nada a pagar: **R$ 0 agora** "tudo pago" · "As faturas que fecham agora já somam R$ X (parcial — ainda pode entrar compra)", X = soma dos ciclos em curso (o "Ciclo em curso" de hoje).

**Próximos vencimentos (linha do tempo):** uma linha por cartão, ordenada pela data de vencimento: "dd/mm · Banco (pessoa)" · "fecha dd/mm · parcial" ou "fechada · a vencer" · valor. Fechada a vencer = `ultima.falta`; ciclo em curso = soma do ciclo (a mesma de hoje) e vencimento estimado = dia do vencimento da última fatura no mês seguinte ao fechamento. Toque abre as compras daquela fatura (`?ciclo=fechada` ou `?ciclo=AAAA-MM`, P3).

**Limite:** um item por cartão com % do limite (barra âmbar ≥ 80%) e "disponível R$"; toque expande as compras do ciclo (o `FaturaCard` atual, recolhido).

**Função pura nova:** `proximosVencimentos(views, hoje)` em `lib/faturas.ts` → `{ banco, responsavel, vence, fecha, valor, situacao: 'fechada' | 'parcial', ciclo }[]`, testada.

## 4. Contas — "O que ainda falta pagar este mês?"

**Topo:** "Falta pagar em <mês>" · **R$ falta** (âmbar; verde "Tudo pago" se 0) · "N contas · X de Y já pagas" · barra de pagas. "Marcado, esperando o banco" continua como hoje dentro da lista.

**Corpo:** seção **Falta** (itens `status !== 'pago'`, ordem de vencimento) e seção **Pagas (N) ▾** recolhida (abre com toque; aberta se não há nada faltando). Linha, ✓, avulsa, remover, alterar valor, "repetir todo mês" — tudo igual (`ContasLista`, reorganizada).

**Elo:** "Entrou R$ x · fecha em R$ y → previsão" (`destaqueDoTopo` de hoje: previsão no mês atual, realizado no passado, "—" na visão individual/futuro). Faturas de cartão que aparecem na lista (ex.: "Nubank", "Crédito Neon") ganham "ver fatura ›" para `/faturas?cartao=…`.

## 5. Previsão — "Quando a gente sai do vermelho, e o que mudar pra isso?"

**Topo:** "Saindo do vermelho" · **"Sai em <mês>"** (verde) ou **"Não sai em 24 meses"** (vermelho) — `saiDoVermelho(...).provavel`, o mesmo de hoje · linha de apoio com a meta (`debitoParaSairAte` para 12 meses à frente, o texto de hoje encurtado: "Com até R$ X/mês no débito (hoje R$ Y), sai em <mês>").

**Gráfico:** SVG próprio (como a `LinhaDoMes`): saldo no fim de cada mês, 3 meses passados (real) + atual + 24 à frente; linha do zero tracejada; ponto "hoje"; linha vermelha = projeção; **linha tracejada verde = projeção com a meta** (mesma `computeProjecao` com `despesaVariavelMediaMensal` ajustada, a função que `tabelaMeta` já usa, exportada como `projecaoComDebito`). Rótulos só do primeiro e do último mês. Visão individual: sem a linha da meta (a meta é do casal hoje).

**Corpo:** tabela da meta (a de hoje, sobe para logo abaixo do gráfico); depois elo "Mês a mês (24) · simular mudança ›" que abre a lista de meses de hoje (`ListaMeses` + `DetalheMes`) recolhida na mesma tela, e link para `/simulador`. Compromissos e cadastro continuam no fim (como hoje).

## 6. Componentes

- `CardResposta` (novo, `components/CardResposta.tsx`): pergunta, valor (com `money` quando é dinheiro), tom (bom/atenção/ruim/neutro), apoio e filhos (barra/gráfico). Mesmo visual do `BlocoHome`, maior.
- `Elo` (novo): a faixa tracejada verde com texto e "›", sempre um `Link`.
- `SyncDot` substitui o `SyncBadge` no cabeçalho do celular (o desktop pode manter o selo com texto).
- Reaproveitados: `BarraGrupos`, `CategoryAccordion`, `FaturaCard`, `ContasLista`, `ListaMeses`, `DetalheMes`, `MetaDebito` (tabela).

## 7. Testes

- Funções puras novas com teste: `proximosVencimentos`, `seta` (movida), `gruposComMedia` (grupos do período + média até o mesmo dia), `cabeNoMes` (gasto + sobra, nunca negativo), `projecaoComDebito`, `corDaSincronizacao`.
- Render estático (`renderToStaticMarkup`, como `componentesHome.test.ts`) de cada tela-componente: o card-resposta mostra a pergunta e o número certo; todo valor de dinheiro tem `money`; elos apontam para `linkPara(...)`.
- Rotas: as 9 conferidas pelo `deploy.sh` seguem 200; conferência visual em produção no celular (375 px) das 4 telas, com print antes × depois.

## Review Focus

1. Mês fechado e mês futuro em cada tela (Gastos sem "cabe"; Contas de mês futuro com tudo faltando; Faturas ignora o mês).
2. Visão individual (Matheus/Ariane): ritmo por pessoa no topo de Gastos, Previsão sem a linha da meta, Contas sem "fecha em".
3. Sem dado: pessoa sem cartão (Faturas "Nenhum cartão"), mês sem contas cadastradas, grupo sem média (seta some), sincronização sem conexões.
4. Filtros vindos dos links das mensagens (`grupo`, `tipo=livre`, `forma=debito`, `p=sem-…`, `cartao`, `ciclo`) continuam abrindo a tela certa.
5. Olho de privacidade: todo número de dinheiro novo (card-resposta, linha do tempo, gráfico, elos) é borrado.

## Fora do escopo

Home (já no padrão), Trilha, Simulador, Regras, Buscar, Diagnóstico; mudanças de cálculo; tema claro.
