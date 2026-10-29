# Zeca fase 3 (analista com conferente): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o Zeca responde qualquer pergunta de leitura sobre as finanças com os números e o porquê, consultando o banco por uma ferramenta estruturada e fazendo contas numa calculadora, e cada resposta com número passa por um conferente sem contexto antes de ir ao grupo.

**Architecture:**
- **Consulta:** uma rota nova do painel, `/api/bot/consulta`. O SQL só filtra, sempre com as regras que o painel já usa. A agregação é uma função pura em `src/lib/consulta.ts`, testável sem banco.
- **Calculadora:** um avaliador de expressões no worker, sem `eval`.
- **Conferente:** uma chamada ao Groq com outro modelo, que recebe a pergunta, um resumo dos dados e a resposta, e devolve JSON.
- **Agente:** liga as peças assim: a trava confere; o conferente revisa; se reprovar, o Zeca reescreve uma vez; se reprovar de novo, vai a resposta segura.

**Tech Stack:** TypeScript, Next.js (rota do painel), Postgres, vitest, Groq (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`).

**Spec:** `docs/superpowers/specs/2026-10-27-zeca-analista-design.md`, seção "Fase 3 — Analista com conferente".

## Global Constraints

- O Groq continua no plano gratuito, com limite de 8.000 tokens por minuto **por modelo**. A espera da fase 2 vale também para o conferente, que nunca é pulado.
- O número do Zeca tem que bater com a tela correspondente do painel. O "gasto" é o mesmo do `gasto_periodo` de hoje: `classe = 'despesa' AND NOT DIVIDA_ANTIGA`, mais o dinheiro vivo marcado à parte.
- O modelo nunca escreve SQL e nunca faz conta de cabeça: todo número vem de uma ferramenta ou de `calcular`.
- Textos do sistema não passam pelo conferente: proposta, lista de candidatos, confirmação, resposta segura e texto montado.
- A resposta reprovada nunca vai ao grupo.
- Os envios agendados não mudam. Os testes de equivalência de `notificacoes-*` têm que continuar passando.
- Repo público: nenhum dado real em teste ou fixture. O conjunto de perguntas de produção fica fora do repo.
- Tom contido, sem gíria técnica. *Negrito* do WhatsApp com um asterisco. Até 12 linhas.
- Commits com `git commit -F arquivo`. Arquivos com LF: editar com Edit/Write, não com Python em modo texto.
- Deploy: `bash scripts/deploy.sh ambos --migracao 018`, fora de 16h–16h40, 22h–22h40 e do minuto :09.

## Decisões deste plano (o spec deixou para o construtor)

- **`consultar` substitui só o caso livre.** `gasto_periodo`, `maiores_gastos` e `comparar` continuam como estão: são o texto montado e o gráfico de hoje, e o histórico de perguntas os usa. `consultar` cobre o que eles não alcançam (loja, forma de pagamento, faixa de valor, por dia ou mês, entradas, o recorte do dia a dia). Custo se estiver errado: três ferramentas que se sobrepõem em parte, cerca de 1.200 caracteres a mais por pergunta.
- **`o_que` tem quatro valores:**
  - `gastos`: o mesmo do `gasto_periodo`, com o dinheiro vivo junto e marcado.
  - `dia_a_dia`: o recorte do ritmo, igual ao `getGastoLivrePorDia` (débito, fora casa e fixos, sem espelho). É ele que responde "o que puxou o ritmo" sem citar o aluguel, o erro visto na fase 1.
  - `entradas`: `classe = 'receita'`.
  - `lancamentos`: despesa e receita juntas, só para listar.
- **Período:** os de hoje, mais o intervalo `AAAA-MM-DD..AAAA-MM-DD`, com no máximo 24 meses e sem datas futuras.
- **Agregação em JS:** o SQL devolve as linhas já filtradas (o banco inteiro tem cerca de 3 mil). Grupo, categoria em português e loja sem CPF/CNPJ (`nomeSemDocumento`) saem das funções que o painel já usa. Tempo limite de 5 s por consulta (`statement_timeout`).
- **Modelos:** o Zeca escreve com a lista de hoje (120b, depois 20b). O conferente usa o outro modelo (o primeiro da lista que não escreveu), sem cair de volta para o mesmo. Conferente em `LimiteGroq` conta como reprovado, e então vai a resposta segura.
- **Resposta ilegível do conferente** (JSON inválido): conta como reprovação, com o problema "conferente não respondeu no formato". A medição da Task 7 diz se isso acontece demais.
- **Rodadas:** `RODADAS` passa de 4 para 6. Uma pergunta de análise usa situação, consulta, cálculo e resposta.
- **`calcular`:** o resultado vale para a trava como dinheiro e como porcentagem, pelo campo `resultado`.

## Review Focus

1. Consulta e painel divergindo: `consultar(gastos, mes_passado, agrupar grupo)` tem que somar igual ao `gasto_periodo` do mesmo período e pessoa, com dinheiro vivo e sem dívida antiga. Teste de integração na Task 2.
2. O conferente devolve texto fora do JSON, JSON sem `aprovado` ou resposta vazia: reprova com o problema de formato, nunca aprova por omissão. Teste na Task 5.
3. Explicação de mensagem citada sem ferramenta: o conferente recebe o texto citado e a conta dele como dados, senão reprovaria uma explicação certa. Teste na Task 6.
4. Conferente sem cota (`LimiteGroq`): a pergunta termina na resposta segura com a linha honesta, não em `FALHA`. Teste na Task 6.
5. `calcular` com divisão por zero, expressão vazia, letras ou tamanho acima de 200 caracteres: erro em texto, sem resultado e sem lançar exceção. Teste na Task 3.

---

### Task 1: agregação da consulta (pura)

**Files:**
- Create: `src/lib/consulta.ts`
- Test: `test/lib/consulta.test.ts`

**Interfaces:**
- Produces:
  - `type OQue = 'gastos' | 'dia_a_dia' | 'entradas' | 'lancamentos'`
  - `type Agrupar = 'nada' | 'categoria' | 'grupo' | 'loja' | 'dia' | 'semana' | 'mes' | 'pessoa'`
  - `type PedidoConsulta = { oQue: OQue; periodo: { inicio: string; fimExcl: string; label: string }; pessoa: Resp; grupo: string | null; categoria: string | null; texto: string | null; forma: 'debito' | 'credito' | 'dinheiro' | null; min: number | null; max: number | null; agrupar: Agrupar; ordem: 'valor' | 'data'; limite: number }`
  - `type LinhaBruta = { data: string; valor: number; descricao: string; categoria: string; pessoa: string; forma: string }`. `valor` já vem com o sinal do gasto (estorno negativo); `forma` é `'Débito' | 'Crédito' | 'Dinheiro' | ''`; `data` é `AAAA-MM-DD`.
  - `lerPedidoConsulta(sp: URLSearchParams, hoje: string): { ok: true; v: PedidoConsulta } | { ok: false; erro: string }`
  - `agregarConsulta(linhas: LinhaBruta[], p: PedidoConsulta): ResultadoConsulta`, onde `ResultadoConsulta = { regra: string; periodo: string; pessoa: Resp; total: number; totalDinheiro: number; qtd: number; linhas: { chave: string; valor: number; qtd: number }[]; cortadas: number }`
  - `REGRA_DO: Record<OQue, string>`, com o texto de uma linha que a resposta repete. Exatos:
    - `gastos`: `'gasto: débito, crédito e dinheiro vivo; sem dívida antiga'`
    - `dia_a_dia`: `'dia a dia: débito e PIX, fora contas da casa e contas fixas (o ritmo)'`
    - `entradas`: `'entradas: as receitas, como na tela do painel'`. Na Task 2, conferir em produção se a transferência entre o casal fica fora de `classe = 'receita'`. Se não ficar, excluir pelo `par_transferencia` e voltar o texto para "sem transferência entre o casal".
    - `lancamentos`: `'lançamentos de gasto e de entrada'`

- [ ] **Step 1: Escrever os testes que falham**

Dados inventados. Teste a teste:
- **`lerPedidoConsulta`, padrões:** `o_que=gastos&periodo=este_mes` vira `agrupar 'nada'`, `ordem 'valor'`, `limite 20`, `pessoa 'casal'`.
- **Recusas de `lerPedidoConsulta`, cada uma com `erro` que cita o campo:**
  - `limite=50` passa a valer 20 (o máximo), sem erro
  - `periodo=2026-01-01..2026-02-31` (data inválida)
  - um intervalo de 25 meses
  - um intervalo que termina no futuro
  - `o_que=salarios`
  - `agrupar=cor`
  - `forma=pix`
- **Intervalo:** `periodo=2026-09-10..2026-09-20` vira `{ inicio: '2026-09-10', fimExcl: '2026-09-21', label: '10/09 a 20/09' }`.
- **Agregação por grupo:** `agregarConsulta` com `agrupar 'grupo'` sobre `Groceries` 300, `Eating out` 100 e `Food delivery` 50 (este em dinheiro, `forma 'Dinheiro'`). Resultado: `linhas` = `[{chave:'Mercado',valor:300,qtd:1},{chave:'Comer fora',valor:150,qtd:2}]`, `total` 450, `totalDinheiro` 50.
- **Categoria e filtros:** `agrupar 'categoria'` devolve o nome do painel (`'Restaurante'`). Os filtros `grupo`, `categoria` (aceita o nome do painel ou o código, sem acento nem caixa), `forma`, `min` e `max` se aplicam antes de somar.
- **Loja:** `agrupar 'loja'` usa `nomeSemDocumento(descricao)`. Uma descrição com CPF não aparece com o CPF na chave.
- **Corte:** 25 lojas com `limite 20` dá `linhas.length` 20, `cortadas` 5 e `total` com as 25.
- **Por mês e por data:** `agrupar 'mes'` dá chaves `'set/26'` e `'out/26'` em ordem de data quando `ordem 'data'`. `agrupar 'nada'` dá `linhas` vazias, `qtd` = número de lançamentos e o `total`.
- **Estorno:** uma linha com `valor` negativo abate o total.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/lib/consulta.test.ts`
Expected: FAIL, o módulo não existe.

- [ ] **Step 3: Implementar `src/lib/consulta.ts`**

Reusar:
- `resolverPeriodo`, `lerPessoa` (`periodos.ts`)
- `grupoDaCategoria`, `GRUPOS_VALIDOS` (`grupos.ts`)
- `traduzCategoria`, `mesLabel` (`format.ts`)
- `nomeSemDocumento` (`categoriaPainel.ts`)

A semana é a de segunda a domingo, com chave `'semana de DD/MM'`. Os valores são arredondados em 2 casas em cada soma.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/lib/consulta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`feat(zeca): agregacao da consulta livre, sem banco (fase 3)`

---

### Task 2: SQL e rota `/api/bot/consulta`

**Files:**
- Modify:
  - `src/lib/queries.ts`: `getLinhasConsulta`
  - `src/lib/db.ts`: `qComLimite`
- Create:
  - `src/app/api/bot/consulta/route.ts`
  - `test/integracao/consulta.test.ts`

**Interfaces:**
- Consumes: `PedidoConsulta`, `LinhaBruta`, `lerPedidoConsulta`, `agregarConsulta` (Task 1).
- Produces:
  - `qComLimite<T>(text: string, params: any[], ms = 5000): Promise<T[]>`. Roda numa conexão do pool com `SET statement_timeout`, e o `RESET` fica no `finally`.
  - `getLinhasConsulta(p: PedidoConsulta): Promise<LinhaBruta[]>`
  - Rota `GET /api/bot/consulta?o_que&periodo&pessoa&grupo&categoria&texto&forma&min&max&agrupar&ordem&limite`. Devolve `{ ...ResultadoConsulta, link }` (o `link` sai de `linkDoPeriodo` quando o período cabe num mês) ou `400 { erro }`. Protegida por `x-interno` como as outras (confirmar no middleware).
- WHERE de cada `o_que` (sempre `data_lancamento` em `[inicio, fimExcl)`, mais o filtro de pessoa `rf`):
  - `gastos`: `classe = 'despesa' AND NOT ${DIVIDA_ANTIGA}`, com valor `valor` (o mesmo do `getGastoPorCategoriaEntre`), mais `financas_gastos_dinheiro` no mesmo intervalo com `forma 'Dinheiro'`.
  - `dia_a_dia`: o WHERE de `getGastoLivrePorDia` (`classe='despesa' AND forma_pagamento='Débito'`, fora `CASA_CATS` e `FIXO_DEBITO_CATS` pela categoria crua, `SEM_ESPELHO`), sem dinheiro vivo.
  - `entradas`: `classe = 'receita'`.
  - `lancamentos`: `classe IN ('despesa','receita')`, com a receita negativa no `valor`.
  - O `texto` filtra em SQL com `descricao ILIKE` e `escaparLike`. Os outros filtros ficam na Task 1.

- [ ] **Step 1: Escrever o teste de integração que falha**

Contra o Postgres descartável, com as migrações que `bot-registro.test.ts` aplica e mais as de `test/integracao/dinheiro.test.ts`:
- Inserir lançamentos inventados: mercado, restaurante, aluguel (Housing), uma dívida antiga, um estorno, uma receita e um gasto em dinheiro.
- **Assert 1:** o total de `consultar(gastos, AAAA-MM, agrupar grupo)` é igual ao `total` de `montarGasto(getGastoPorCategoriaEntre(...), null, getDinheiroPorCategoriaEntre(...))` no mesmo mês. Os itens por grupo também são iguais.
- **Assert 2:** `dia_a_dia` não contém o aluguel nem a dívida.
- **Assert 3:** `entradas` soma só a receita.
- **Assert 4:** `texto='mercado'` acha só o mercado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `docker exec pg-teste-c1 psql -U postgres -q -c "DROP DATABASE IF EXISTS personal_hub_db" -c "CREATE DATABASE personal_hub_db"`, depois `TEST_DATABASE_URL=postgres://postgres:teste@127.0.0.1:55432/personal_hub_db npx vitest run test/integracao/consulta.test.ts`
Expected: FAIL, `getLinhasConsulta` não existe.

- [ ] **Step 3: Implementar `getLinhasConsulta`, `qComLimite` e a rota**

- [ ] **Step 4: Rodar e ver passar**

O teste de integração e `npx tsc --noEmit -p .` passam.

- [ ] **Step 5: Commit**

`feat(zeca): rota de consulta livre com as regras do painel (fase 3)`

---

### Task 3: calculadora

**Files:**
- Create:
  - `src/worker/bot/calculo.ts`
  - `test/worker/bot-calculo.test.ts`
- Modify: `src/worker/bot/trava.ts`, para que `resultado` conte em `DINHEIRO` e também em `pct`.

**Interfaces:**
- Produces:
  - `calcular(expressao: string): { ok: true; dados: { expressao: string; resultado: number } } | { ok: false; dados: { erro: string } }`
  - Aceita números com ponto decimal, `+ - * / ( )`, menos unário e `%` pós-fixo (`50%` = 0,5). O resultado é arredondado em 2 casas. É um analisador descendente recursivo, sem `eval` e sem `Function`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
expect(calcular('190.69 / 27.03')).toEqual({ ok: true, dados: { expressao: '190.69 / 27.03', resultado: 7.05 } });
expect(calcular('(1086.14 - 950) / 950 * 100').dados).toEqual({ expressao: '(1086.14 - 950) / 950 * 100', resultado: 14.33 });
expect(calcular('-2 * (3 + 4)').dados.resultado).toBe(-14);
expect(calcular('200 * 10%').dados.resultado).toBe(20);
for (const ruim of ['1/0', '', 'abc', '2 +', 'process.exit()', '1'.repeat(201)]) expect(calcular(ruim).ok).toBe(false);
// trava: o resultado da calculadora vale como R$ e como %
expect(respostaConfere('🔥 R$ 7,05 por real que cabia; 14,33% acima', [{ expressao: 'x', resultado: 7.05 }, { expressao: 'y', resultado: 14.33 }])).toBe(true);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-calculo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/worker/bot-calculo.test.ts test/worker/bot-trava.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`feat(zeca): calculadora para as contas do Zeca (fase 3)`

---

### Task 4: ferramentas e prompt do analista

**Files:**
- Modify:
  - `src/worker/bot/ferramentas.ts`: `consultar` e `calcular` em `TOOLS`; `consultar` em `ROTA` e em `caminhoDa`; `calcular` em `LOCAIS`; `formatar('consultar')` para o texto montado.
  - `src/worker/bot/escolha.ts`: os dois no grupo `base`.
  - `src/worker/bot/locais.ts`: `calcular` como ferramenta local.
  - `src/worker/bot/agente.ts`: `SISTEMA` novo e `RODADAS = 6`.
- Test:
  - `test/worker/bot-ferramentas-tamanho.test.ts`: o teto de 1.300 caracteres vale para as novas.
  - `test/worker/bot-formatadores.test.ts`
  - `test/worker/bot-agente.test.ts`

**Interfaces:**
- Consumes: a rota da Task 2, `calcular` da Task 3.
- Produces: o nome de ferramenta `'consultar'` (argumentos: `o_que, periodo, pessoa, grupo, categoria, texto, forma, min, max, agrupar, ordem, limite`) e o nome `'calcular'` (argumento: `expressao`). `caminhoDa('consultar', args, quem)` troca `"eu"` por quem perguntou, como as outras.
- Texto do `SISTEMA`: troca as linhas "Use SEMPRE as ferramentas… copie os valores" e "A conta vem pronta no campo explicacao… copie as frases" por estas, mantendo as outras:
  - `Responda como quem olhou os números: diga o que aconteceu e por quê, com os valores. Não defina termos.`
  - `Todo número vem de uma ferramenta. Para dados use situacao_mes, gasto_periodo, maiores_gastos, comparar ou consultar; para qualquer conta (soma, diferença, divisão, quantas vezes, %) use calcular. Nunca faça conta de cabeça.`
  - `"explicacao" e a conta das mensagens são fonte de dados, não texto para copiar.`
  - `Para dizer o que puxou o ritmo do dia a dia, use consultar com o_que dia_a_dia (o aluguel e as contas fixas não entram no ritmo).`
  - `Se os dados não respondem, diga o que não dá para saber. Não chute.`
  - O limite passa de "até 8 linhas" para "até 12 linhas".
  - A regra "Ritmo acima do que dá pra gastar: chame também maiores_gastos…" passa a mandar usar `consultar` com `o_que dia_a_dia`, `agrupar loja` e `limite 3`.

- [ ] **Step 1: Escrever os testes que falham**

- **Tamanho:** `TOOLS` inclui `consultar` e `calcular`, cada um com até 1.300 caracteres.
- **`caminhoDa`:** `caminhoDa('consultar', { o_que: 'gastos', periodo: 'mes_passado', pessoa: 'eu', texto: 'padaria' }, 'Ariane')` devolve `'/api/bot/consulta?o_que=gastos&periodo=mes_passado&pessoa=Ariane&texto=padaria'`.
- **`formatar('consultar', …)`:** mostra a regra, o total e até 6 linhas.
- **Agente:** um roteiro com `consultar` → `calcular` → texto. A resposta usa o `resultado` da calculadora e passa pela trava. Neste teste, o fake do conferente (Task 6) ainda não existe, então ele usa as deps sem `conferir`.
- **Prompt:** `SISTEMA` contém `calcular` e `dia_a_dia` e não contém mais `copie as frases`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-ferramentas-tamanho.test.ts test/worker/bot-formatadores.test.ts test/worker/bot-agente.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo passa. Testes antigos que fixavam o texto do `SISTEMA` são ajustados à regra nova, sem mudar a expectativa de comportamento. Cada ajuste vira uma linha de `Ruling:` no ledger.

- [ ] **Step 5: Commit**

`feat(zeca): ferramentas consultar e calcular e prompt de analista (fase 3)`

---

### Task 5: o conferente

**Files:**
- Create:
  - `src/worker/bot/conferente.ts`
  - `test/worker/bot-conferente.test.ts`
- Modify:
  - `src/worker/bot/groq.ts`: `chat(..., { aoEsperar, modelos })`, que usa a lista `modelos` no lugar da do construtor quando vier; `get modelosDaLista(): string[]`.
  - `test/worker/bot-groq.test.ts`

**Interfaces:**
- Produces:
  - `type Veredito = { aprovado: boolean; problemas: string[]; tokens: number; esperaMs: number; modelo: string | null }`
  - `conferir(d: { groq: Pick<ClienteGroq, 'chat'>; modelos: string[]; pergunta: string; dados: unknown[]; resposta: string; aoEsperar?: (ms: number) => void }): Promise<Veredito>`. Chama `chat` com `tools: []` e `modelos: d.modelos`. Nunca lança: `LimiteGroq` e outros erros viram `aprovado: false` com o problema `'conferente indisponível'`.
  - `resumoDados(dados: unknown[], max = 6000): string`: JSON compacto sem as chaves `link`, `lista`, `proposta` e `svg`, cortado em `max` caracteres com `…` no fim.
  - `modeloConferente(escreveu: string | null, lista: string[]): string[]`: o primeiro da lista que não é `escreveu`, ou `[]` se não houver outro.
- Prompt do conferente (sistema), exato:
  `Você confere a resposta de um assistente financeiro antes de ela ir para um grupo de WhatsApp. Você recebe a pergunta, os dados que as ferramentas devolveram e a resposta. Verifique: cada valor e porcentagem da resposta está nos dados ou é conta deles; o rótulo de cada número está certo (o que é gasto, entrada, sobra, ritmo, "nesse passo", "pela média", qual período, qual pessoa); nenhuma afirmação vai além dos dados. Não julgue estilo nem tom. Responda só com JSON: {"aprovado": true} ou {"aprovado": false, "problemas": ["…", "…"]}, cada problema numa frase curta em português.`
  A mensagem do usuário leva `Pergunta:`, `Dados:` (o `resumoDados`) e `Resposta:`.

- [ ] **Step 1: Escrever os testes que falham**

- `{"aprovado": true}` vira `aprovado true` e `problemas []`.
- Um JSON reprovado, mesmo dentro de \`\`\`json, devolve os problemas.
- Texto livre, `{}`, `{"aprovado": "sim"}` e conteúdo vazio viram `aprovado false` com `['conferente não respondeu no formato']`.
- `LimiteGroq` lançado vira `aprovado false` com `['conferente indisponível']`, sem lançar.
- `chat` é chamado com `modelos` igual a `['m2']` quando `modeloConferente('m1', ['m1','m2'])`.
- `modeloConferente('m2', ['m1','m2'])` é `['m1']`; `modeloConferente('m1', ['m1'])` é `[]`.
- `resumoDados` tira `link`, `lista`, `proposta` e `svg`, e corta em `max`.
- **No `groq.ts`:** `chat([], [], { modelos: ['m2'] })` usa `m2` mesmo com o construtor em `['m1','m2']`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-conferente.test.ts test/worker/bot-groq.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar e ver passar**

Mesmo comando. Expected: PASS.

- [ ] **Step 5: Commit**

`feat(zeca): conferente sem contexto em outro modelo (fase 3)`

---

### Task 6: o agente usa o conferente

**Files:**
- Modify: `src/worker/bot/agente.ts`
- Test: `test/worker/bot-agente.test.ts`

**Interfaces:**
- Consumes: `conferir`, `modeloConferente` (Task 5).
- Produces:
  - `DepsResponder.conferir?: typeof conferir`. Quando vier ausente, não há conferente, que é o modo dos testes antigos e do fake em `bot-acoes-fluxo`.
  - `DepsResponder.modelos?: string[]`: a lista do `GROQ_MODELOS`.
  - `RespostaBot.conferencia: 'aprovada' | 'reescrita' | 'segura' | null`. `null` quando não houve conferência: texto do sistema, resposta sem número ou sem conferente.
  - `RespostaBot.problemas: string[]` e `RespostaBot.tokensConferente: number`.
  - `export const SEGURA = 'Não consegui conferir a análise; os números que tenho com certeza são estes:'`
- Fluxo, no ponto em que hoje a resposta do modelo passou na trava:
  1. Se o texto não tem número (R$, %, nem valor com centavos) ou `d.conferir` está ausente, a resposta segue como hoje.
  2. `v = conferir({ modelos: modeloConferente(modelo, d.modelos ?? []), pergunta: comCitada(p, conta), dados: [...resultados, ...(conta ? [conta] : [])], resposta: texto })`.
  3. Se `v.aprovado`, vai com `conferencia 'aprovada'`.
  4. Se não, reescrita única: põe a resposta como `assistant` e um `user` com `O conferente apontou estes problemas: - … Reescreva a resposta corrigindo só isso, com os mesmos dados.`, e chama o `chat` de novo sem ferramentas. O novo texto passa pela trava e pelo conferente. Se passar nas duas, vai com `'reescrita'`.
  5. Se não, `'segura'`: `SEGURA` + `\n` + (texto montado de todas as ferramentas, ou as linhas de `explicacao`, ou da conta citada). Sem nada montável, `FALHA` com `erro 'conferente reprovou e sem dado montável'`.
  6. `problemas` acumula as duas rodadas; `tokensConferente` soma as duas conferências; `esperaMs` soma as esperas do conferente.

- [ ] **Step 1: Escrever os testes que falham**

Com um `conferir` falso que segue um roteiro:
- Aprovado de primeira: o texto é o do modelo, `conferencia 'aprovada'`, uma chamada a `conferir`.
- Reprovado e depois aprovado: o `chat` é chamado mais uma vez, com uma mensagem `user` que contém o problema; a resposta é a reescrita, `conferencia 'reescrita'` e `problemas` com o primeiro problema.
- Reprovado duas vezes: a resposta começa com `SEGURA` e traz o texto montado de `gasto_periodo`, nunca o texto reprovado; `conferencia 'segura'`.
- Reescrita que fura a trava (número inventado): vai a segura sem chamar o segundo `conferir`.
- Resposta sem número ("Vocês estão na fase 1."): `conferir` não é chamado e `conferencia` é `null`.
- Proposta (texto do sistema): `conferir` não é chamado.
- Review Focus 3: mensagem citada sem ferramenta. `conferir` recebe nos `dados` a conta citada (`explicacao`).
- Review Focus 4: `conferir` devolve `problemas ['conferente indisponível']` duas vezes. A resposta é a segura, sem `erro`.
- `conferir` recebe `modelos ['m2']` quando o modelo que escreveu foi `m1` e `d.modelos` é `['m1','m2']`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-agente.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: tudo passa.

- [ ] **Step 5: Commit**

`feat(zeca): resposta com numero passa pelo conferente; reprovou duas vezes, vai a segura (fase 3)`

---

### Task 7: registro, ligação no worker, deploy e medição

**Files:**
- Create: `db/migrations/018_bot_conferente.sql`. Dentro de BEGIN/COMMIT, no formato da 017: `ADD COLUMN IF NOT EXISTS conferencia text`, `problemas jsonb NOT NULL DEFAULT '[]'::jsonb` e `tokens_conferente integer NOT NULL DEFAULT 0`.
- Modify:
  - `src/worker/bot/registro.ts`: `LinhaBot.conferencia`, `problemas` e `tokensConferente` no INSERT.
  - `src/worker/bot/bot.ts`: passa `conferir` e `modelos` ao `responder` e grava os três campos.
  - `src/worker/index.ts`: cria o bot e o `bot-perguntar` com `conferir` e `modelos`; o `bot-perguntar` imprime `conferencia`, `problemas` e `tokensConferente`.
- Test:
  - `test/worker/bot-bot.test.ts`: os campos novos chegam ao `gravar`.
  - `test/integracao/bot-registro.test.ts`: aplica a 018 e lê `problemas` como array.

- [ ] **Step 1: Testes que falham, implementação e suíte verde**, no ciclo das tasks anteriores.

Run: `npm test` e o teste de integração do registro com `TEST_DATABASE_URL`.

- [ ] **Step 2: Commit**

`feat(zeca): registra o veredito do conferente (fase 3)`

- [ ] **Step 3: Deploy**

Run: `bash scripts/deploy.sh ambos --migracao 018`
Expected: testes verdes, migração aplicada, painel e worker no ar.

- [ ] **Step 4: Conjunto de perguntas em produção**

Escrever as perguntas em `<scratchpad>/zeca-fase3-perguntas.txt`, **fora do repo**, e rodar cada uma com `bot-perguntar`, uma por vez. As perguntas:
- as três do Matheus: o vermelho, citando o diário e sem citar; "quanto eu gastei com mercado no mês passado"; "o que falta pagar este mês"
- as perguntas distintas de `financas_bot_conversas` dos últimos 30 dias
- variações: uma pessoa e o casal; período sem gasto (`hoje` de madrugada, ou um mês antigo filtrado por uma loja que não existe); pergunta sem dado ("quanto vou gastar em dezembro com presente?"); uma pergunta de loja ("quanto foi de ifood em setembro?"); uma de entrada ("quanto entrou em outubro?")

Antes de rodar, conferir à mão os números esperados no painel e anotar no mesmo arquivo.

Expected, em todas:
- nenhum número errado ou com rótulo trocado contra o painel
- responde o que foi perguntado
- no vermelho, diz o porquê e cita os gastos do dia a dia que puxaram o ritmo (sem aluguel)
- registrar por pergunta: tokens do Zeca + conferente e o veredito

- [ ] **Step 5: Medir tokens**

Comparar com a fase 1 (mercado 2.621, contas 2.559, vermelho 5.749). Se a soma Zeca + conferente passar de cerca de 8.000 em alguma pergunta típica, registrar e propor o corte no PR, sem cortar às cegas.

- [ ] **Step 6: PR**

Abrir o PR com a tabela do conjunto: pergunta, veredito, tokens e número conferido (sim ou não). Os textos das respostas não vão para o PR, porque o repo é público e eles têm valores reais.
