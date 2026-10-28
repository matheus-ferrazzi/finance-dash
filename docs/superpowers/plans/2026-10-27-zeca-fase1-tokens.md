# Zeca fase 1 — tokens: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** medir quantos tokens cada pergunta ao Zeca gasta e cortar esse gasto, sem mudar o que ele responde.

**Architecture:** o cliente do Groq passa a devolver o `usage`. O agente soma por pergunta e o registro grava numa coluna nova. A descrição das ferramentas deixa de listar categorias: o código traduz o nome em português e, se o nome for inválido, devolve a lista. Uma função por código escolhe as ferramentas e os trechos do prompt que servem à pergunta. Se o modelo responder sem usar ferramenta, o agente refaz uma vez com o conjunto completo.

**Tech Stack:** TypeScript, vitest, Postgres (migração SQL), worker Node em Docker na VPS, Groq (API compatível com OpenAI).

**Spec:** `docs/superpowers/specs/2026-10-27-zeca-analista-design.md` (seção "Fase 1 — Tokens")

## Global Constraints

- Groq gratuito; a cota é por modelo (`GROQ_MODELOS=openai/gpt-oss-120b,openai/gpt-oss-20b`).
- Repositório público: nenhum dado real (pergunta, valor, loja, telefone) em teste ou arquivo commitado. As perguntas do histórico só ficam no scratchpad.
- Comentários e textos em português, no estilo do código vizinho (data `27/10:` no comentário que explica a mudança).
- Commit com `git commit -F arquivo`; termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Deploy só por `bash scripts/deploy.sh`, fora das janelas 16h–16h40 e 22h–22h40 de SP.
- O comportamento das respostas não muda nesta fase: os testes existentes de `test/worker/bot-*.test.ts` continuam passando sem alteração de expectativa, exceto onde a tarefa diz.

## Review Focus

- **Pergunta de correção sem palavra-chave** ("aquele pix do João é mercado"): o filtro não oferece as ferramentas de proposta. Esperado: a refeita com o conjunto completo (Tarefa 4) resolve. Teste na Tarefa 3.
- **"quero o L3"** (texto reescrito pelo `bot.ts` depois de uma lista): precisa oferecer as ferramentas de proposta. Teste na Tarefa 3.
- **Categoria em português com acento ou caixa diferente** ("mercado", "Saúde"): tem que resolver para o código interno. Teste na Tarefa 2.
- **Resposta do Groq sem `usage`** (modelo reserva ou erro parcial): tokens contam 0 e nada quebra. Teste na Tarefa 1.
- **Mensagem citada sem palavra-chave na pergunta** ("e isso?"): as ferramentas e o trecho de explicação de mensagem entram por causa da citação. Teste na Tarefa 3.

---

### Task 1: Medir tokens por pergunta

**Files:**
- Create: `db/migrations/016_bot_tokens.sql`
- Modify: `src/worker/bot/groq.ts` (retorno de `chat`)
- Modify: `src/worker/bot/agente.ts` (`RespostaBot`, soma por rodada)
- Modify: `src/worker/bot/registro.ts` (`LinhaBot`, INSERT)
- Modify: `src/worker/bot/bot.ts` (passa `tokens` ao `gravar`)
- Modify: `src/worker/index.ts` (o `bot-perguntar` imprime `tokens` no JSON final)
- Test: `test/worker/bot-groq.test.ts`, `test/worker/bot-agente.test.ts`

**Interfaces:**
- Produces: `ClienteGroq.chat(...)` passa a devolver `{ content, toolCalls, modelo, tokens: number }` (`tokens` = `usage.total_tokens`, 0 se ausente). `RespostaBot.tokens: number` (soma de todas as rodadas). `LinhaBot.tokens: number`. Coluna `financas_bot_conversas.tokens integer NOT NULL DEFAULT 0`.

- [ ] **Step 1: Testes que falham**

Em `bot-groq.test.ts`:
```ts
it('27/10: devolve os tokens do usage; sem usage, 0', async () => {
  const com = new ClienteGroq('K', ['m1'], (async () => resp(200, { ...okChat, usage: { total_tokens: 1234 } })) as any);
  expect((await com.chat([], [])).tokens).toBe(1234);
  const sem = new ClienteGroq('K', ['m1'], (async () => resp(200, okChat)) as any);
  expect((await sem.chat([], [])).tokens).toBe(0);
});
```
Em `bot-agente.test.ts`, os passos do `groqRoteiro` aceitam `tokens`:
```ts
it('27/10: soma os tokens de todas as rodadas', async () => {
  const g = groqRoteiro([
    { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm', tokens: 3000 },
    { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 3500 },
  ]);
  expect((await responder(p, { ...base, groq: g })).tokens).toBe(6500);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-groq.test.ts test/worker/bot-agente.test.ts`
Expected: FAIL nos dois testes novos (`tokens` undefined).

- [ ] **Step 3: Implementar**

`groq.ts`: lê `json.usage?.total_tokens ?? 0`. `agente.ts`: acumula `r.tokens ?? 0` a cada chamada e põe em todo `fimCom`. Os passos dos testes antigos não têm `tokens`, então a soma usa `?? 0`. `registro.ts`: coluna `tokens` no INSERT. `bot.ts`: `tokens: r.tokens`.

Migração `016_bot_tokens.sql`, no padrão do `009` (com `BEGIN`/`COMMIT`):
```sql
-- 27/10/2026: tokens do Groq por pergunta (soma das rodadas), para medir o corte de tokens (Zeca fase 1).
ALTER TABLE financas_bot_conversas ADD COLUMN IF NOT EXISTS tokens integer NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Rodar a suíte, o typecheck e o build**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build:worker`
Expected: tudo verde.

- [ ] **Step 5: Commit**

Mensagem: `feat(zeca): mede tokens por pergunta (fase 1)`.

- [ ] **Step 6: Deploy do worker com a migração e medição do "antes"**

Run: `bash scripts/deploy.sh worker --migracao 016`
Expected: `OK: tudo respondeu.`

Depois, na VPS, rodar com intervalo de 60 s entre elas (limite por minuto):
```bash
ssh vps-financas 'for q in "quanto gastei com mercado mes passado?" "o que falta pagar este mes?" "pq estamos caminhando para o vermelho?"; do docker exec finance-worker node worker.js bot-perguntar "$q" 2>&1 | tail -1; sleep 60; done'
```
Expected: três linhas JSON com `"tokens": N`. Anotar os três valores como o **antes**, para o relatório final.

---

### Task 2: Categorias fora da descrição das ferramentas

**Files:**
- Modify: `src/worker/bot/ferramentas.ts` (descrição e parâmetro `categoria` de `propor_categoria` e `propor_gasto_dinheiro`)
- Modify: `src/worker/bot/locais.ts` (resolve o nome e valida antes de chamar o painel)
- Test: `test/worker/bot-locais.test.ts`, `test/worker/bot-ferramentas-tamanho.test.ts` (novo)

**Interfaces:**
- Produces: `resolverCategoria(nome: string, validas: readonly string[]): string | null` em `src/worker/bot/locais.ts` (exportada). Aceita o código interno ("Groceries") ou o nome em português do `traduzCategoria`, sem diferenciar acento nem caixa. Devolve o código ou `null`.
- Parâmetro `categoria` das duas ferramentas: `{ type: 'string', description: 'nome da categoria como aparece no painel (ex.: Mercado)' }`, **sem `enum`**.

- [ ] **Step 1: Testes que falham**

`bot-locais.test.ts`:
```ts
describe('27/10: categoria pelo nome do painel', () => {
  it('resolve código, nome em português, sem acento e sem caixa; desconhecida é null', () => {
    const v = ['Groceries', 'Health'];
    expect(resolverCategoria('Groceries', v)).toBe('Groceries');
    expect(resolverCategoria(traduzCategoria('Groceries').toLowerCase(), v)).toBe('Groceries');
    expect(resolverCategoria(traduzCategoria('Health').normalize('NFD').replace(/\p{M}/gu, ''), v)).toBe('Health');
    expect(resolverCategoria('Xyz', v)).toBeNull();
  });
  it('propor_gasto_dinheiro com categoria inválida: erro listando as válidas em português, sem criar proposta', async () => { /* montar() do arquivo; espera ok:false, erro contendo traduzCategoria(CATEGORIAS_GASTO[0]) e criadas vazio */ });
  it('propor_categoria com categoria inválida: mesmo erro com CATEGORIAS_PAINEL, sem chamar a prévia', async () => { /* posts vazio */ });
});
```
`bot-ferramentas-tamanho.test.ts` (novo):
```ts
it('27/10: a descrição de nenhuma ferramenta passa de 1.300 caracteres (propor_categoria tinha 3.843)', () => {
  for (const t of TOOLS) expect(JSON.stringify(t).length, t.function.name).toBeLessThanOrEqual(1300);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-locais.test.ts test/worker/bot-ferramentas-tamanho.test.ts`
Expected: FAIL (`resolverCategoria` não existe; `propor_categoria` com 3.843).

- [ ] **Step 3: Implementar**

Em `locais.ts`, as duas propostas chamam `resolverCategoria` (contra `CATEGORIAS_PAINEL` e `CATEGORIAS_GASTO`) antes de tudo. Se der `null`, devolvem `{ ok: false, dados: { erro: 'categoria desconhecida; use uma destas: <nomes em português separados por vírgula>' } }`. O agente já repassa esse motivo como `recusa`. Depois disso, o fluxo segue com o código resolvido, igual a hoje. Em `ferramentas.ts`, o parâmetro fica como no bloco de Interfaces.

- [ ] **Step 4: Suíte, typecheck e build**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build:worker`
Expected: verde.

- [ ] **Step 5: Commit**

Mensagem: `perf(zeca): categorias fora da descricao das ferramentas (fase 1)`.

---

### Task 3: Ferramentas e prompt pela pergunta

**Files:**
- Create: `src/worker/bot/escolha.ts`
- Modify: `src/worker/bot/agente.ts` (`SISTEMA` passa a receber os grupos; `responder` usa a escolha)
- Test: `test/worker/bot-escolha.test.ts` (novo), `test/worker/bot-agente.test.ts`

**Interfaces:**
- Produces, em `escolha.ts`:
  - `type Grupo = 'base' | 'propostas' | 'mensagens' | 'compra' | 'patrimonio'`
  - `GRUPO_DA: Record<string, Grupo>`, ferramenta → grupo:
    - base: `situacao_mes`, `gasto_periodo`, `maiores_gastos`, `comparar`, `faturas`, `contas_do_mes`
    - propostas: `buscar_lancamentos`, `propor_categoria`, `propor_conta_avulsa`, `propor_gasto_dinheiro`
    - mensagens: `mensagens_do_zeca`
    - compra: `simular_compra`
    - patrimonio: `trilha`, `investimentos`
  - `escolherGrupos(p: Pergunta, contexto: { pergunta: string }[]): Set<Grupo>`: `base` sempre. Os outros entram pelas palavras da pergunta **ou da última pergunta do contexto**, sem acento e sem caixa:
    - propostas: `corrig|categoria|muda|errad|lanc|anot|registr|dinheiro|avuls|conta nova|quero o l\d|^l\d$`
    - mensagens: `p.citada` presente, ou `mensage|diario|semanal|mensal|alerta|aviso|explica|o que (voce|vc) (mandou|disse)`
    - compra: `compr|cabe|parcel|posso gastar|da pra pagar`
    - patrimonio: `trilha|fase|reserva|invest|carteira|aplica|tesouro|cdb|divida`
  - `ferramentasDe(grupos: Set<Grupo>): object[]`: o filtro de `TOOLS`, na ordem original.
- `SISTEMA(quem: string, hoje: string, grupos: Set<Grupo>): string` em `agente.ts`. As linhas de proposta (as de `propor_*` e "você nunca grava nada") só entram com `propostas`. Todo o bloco de explicação de mensagem (de "Se a pergunta vier com uma Mensagem citada" até o fim do glossário) só entra com `mensagens`. O resto entra sempre.

- [ ] **Step 1: Testes que falham**

`bot-escolha.test.ts` (perguntas inventadas, não do histórico):
```ts
const P = (texto: string, citada?: string) => ({ id: 'x', pessoa: 'Matheus', texto, ...(citada ? { citada } : {}) });
const g = (texto: string, citada?: string, ctx: string[] = []) => [...escolherGrupos(P(texto, citada), ctx.map((pergunta) => ({ pergunta })))].sort();
it('base sempre; sem palavra de outro grupo, só base', () => expect(g('quanto gastei com mercado mes passado?')).toEqual(['base']));
it('correção e lançamento: propostas', () => {
  expect(g('muda o pix da padaria pra mercado')).toContain('propostas');
  expect(g('paguei 30 em dinheiro na feira')).toContain('propostas');
  expect(g('quero o L3')).toContain('propostas');
});
it('citada sem palavra-chave: mensagens', () => expect(g('e isso?', '🔴 *Mês no vermelho*')).toContain('mensagens'));
it('explica o diário: mensagens', () => expect(g('me explica o diário')).toContain('mensagens'));
it('a última pergunta do contexto conta ("e pra mercado?" depois de uma correção)', () =>
  expect(g('e pra mercado?', undefined, ['corrige aquele pix'])).toContain('propostas'));
it('compra e patrimônio', () => {
  expect(g('cabe uma tv de 3000 em 10x?')).toContain('compra');
  expect(g('quanto tem investido?')).toContain('patrimonio');
});
it('ferramentasDe: base tem as 6 da base, na ordem de TOOLS', () =>
  expect(ferramentasDe(new Set(['base'])).map((t: any) => t.function.name)).toEqual(['situacao_mes', 'gasto_periodo', 'maiores_gastos', 'comparar', 'faturas', 'contas_do_mes']));
```
Em `bot-agente.test.ts`:
```ts
it('27/10: pergunta de gasto não leva as ferramentas de proposta nem o bloco de mensagens', async () => {
  const vistas: any[] = [];
  const g = { chat: async (msgs: any, tools: any) => { vistas.push({ msgs, tools }); return { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 0 }; } };
  await responder(p, { ...base, groq: g });
  expect(vistas[0].tools.map((t: any) => t.function.name)).not.toContain('propor_categoria');
  expect(vistas[0].msgs[0].content).not.toContain('Mensagem citada');
});
```
(Este teste também exercita a Tarefa 4: a resposta sem ferramenta faz a segunda chamada. Aqui só a primeira, `vistas[0]`, é conferida.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-escolha.test.ts test/worker/bot-agente.test.ts`
Expected: FAIL (`escolha.ts` não existe).

- [ ] **Step 3: Implementar `escolha.ts` e ligar no agente**

Normalizar com `normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`. No `responder`: `const grupos = escolherGrupos(p, d.contexto)`, depois `SISTEMA(p.pessoa, d.hoje, grupos)` e `d.groq.chat(msgs, ferramentasDe(grupos))`. A ferramenta chamada fora do conjunto (o modelo inventou) continua caindo em "ferramenta ou argumentos inválidos", como hoje.

- [ ] **Step 4: Suíte, typecheck e build**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build:worker`
Expected: verde. Se algum teste antigo de `bot-agente` (citada, proposta) quebrar porque o grupo não entrou, a correção é na **regra** de `escolherGrupos` (a pergunta do teste é um caso real de uso), nunca no teste.

- [ ] **Step 5: Commit**

Mensagem: `perf(zeca): so as ferramentas e o prompt que servem a pergunta (fase 1)`.

---

### Task 4: Sem ferramenta usada, refaz com tudo

**Files:**
- Modify: `src/worker/bot/agente.ts` (o caminho `SEM_FERRAMENTA`)
- Test: `test/worker/bot-agente.test.ts`

**Interfaces:**
- Consumes: `escolherGrupos`, `ferramentasDe`, `SISTEMA(quem, hoje, grupos)` da Tarefa 3.
- Produces: comportamento. Quando o modelo encerra sem nenhuma ferramenta, sem citada e com um conjunto que não era o completo, o agente refaz **uma vez** a conversa desde o início com todos os grupos. Se a segunda também não usar ferramenta, sai `SEM_FERRAMENTA`; nunca há terceira tentativa. Os tokens das duas tentativas somam. (A pergunta fora do assunto custa duas chamadas; com ~1 pergunta por dia, isso é aceitável e mais simples que escolher quais grupos faltantes justificam refazer.)

- [ ] **Step 1: Testes que falham**

```ts
it('27/10: sem ferramenta no conjunto reduzido, refaz com tudo e responde', async () => {
  const vistas: string[][] = [];
  const passos = [
    { content: 'não sei', toolCalls: [], modelo: 'm', tokens: 100 },
    { content: null, toolCalls: [{ id: 'c1', nome: 'gasto_periodo', args: '{"periodo":"este_mes"}' }], modelo: 'm', tokens: 200 },
    { content: '🛒 Mercado: R$ 400,00 este mês.', toolCalls: [], modelo: 'm', tokens: 300 },
  ];
  let i = 0;
  const g = { chat: async (_m: any, tools: any) => { vistas.push(tools.map((t: any) => t.function.name)); return passos[i++]; } };
  const r = await responder({ ...p, texto: 'aquele pix do fulano é mercado' }, { ...base, groq: g });
  expect(vistas[0]).not.toContain('propor_categoria');
  expect(vistas[1]).toContain('propor_categoria');
  expect(r.texto).toContain('R$ 400,00');
  expect(r.tokens).toBe(600);
});
it('27/10: a refeita com tudo também sem ferramenta: SEM_FERRAMENTA, sem terceira chamada', async () => {
  let n = 0;
  const g = { chat: async () => { n++; return { content: 'não sei', toolCalls: [], modelo: 'm', tokens: 0 }; } };
  expect((await responder({ ...p, texto: 'qual a capital da França?' }, { ...base, groq: g })).texto).toBe(SEM_FERRAMENTA);
  expect(n).toBe(2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/worker/bot-agente.test.ts`
Expected: FAIL nos dois testes novos.

- [ ] **Step 3: Implementar**

Os testes antigos de `bot-agente` que esperam `SEM_FERRAMENTA` com um único passo no `groqRoteiro` passam a precisar de um segundo passo igual. Essa é a exceção permitida pelas Global Constraints; a expectativa (`SEM_FERRAMENTA`) não muda.

Separar o laço de rodadas numa função interna `tentar(grupos)` que devolve o `RespostaBot`. O `responder` chama `tentar(escolhidos)`. Se o resultado tem `semFerramenta` e `escolhidos.size` é menor que o total de grupos, chama `tentar(todos)` e soma os tokens. A conta de `ms` cobre as duas tentativas.

- [ ] **Step 4: Suíte, typecheck e build**

Run: `npx vitest run && npx tsc --noEmit -p . && npm run build:worker`
Expected: verde.

- [ ] **Step 5: Commit**

Mensagem: `fix(zeca): sem ferramenta no conjunto reduzido, refaz com todas (fase 1)`.

---

### Task 5: Conferir no histórico, subir e medir o "depois"

**Files:** nenhum no repositório. As perguntas reais ficam no scratchpad e não são commitadas.

- [ ] **Step 1: Rodar a escolha contra as perguntas reais**

Exportar as perguntas dos últimos 90 dias para o scratchpad (só a coluna `pergunta`, mais `ferramentas` para comparar):
```bash
ssh vps-financas '. /root/.financas.env; docker exec -e PGPASSWORD="$PG_SENHA" postgres-hub psql -U mferrazzi -d personal_hub_db -Atc "SELECT json_agg(json_build_object('"'"'pergunta'"'"',pergunta,'"'"'ferramentas'"'"',ferramentas)) FROM financas_bot_conversas"' > <scratchpad>/historico.json
```
Script de uma linha no scratchpad, com `npx tsx`: para cada pergunta, imprimir os grupos escolhidos e as ferramentas que o Zeca usou de fato.
Expected: toda ferramenta usada de fato pertence a um grupo escolhido, ou a pergunta seria salva pela refeita da Tarefa 4 (grupo `propostas` ou `mensagens`). Se aparecer outro caso, voltar à regra da Tarefa 3 com um teste novo (pergunta parafraseada, não a real).

- [ ] **Step 2: Deploy do worker**

Run: `bash scripts/deploy.sh worker`
Expected: `OK: tudo respondeu.`

- [ ] **Step 3: Medir o "depois"**

O mesmo comando da Tarefa 1, Step 6.
Expected: as três respostas iguais em conteúdo às do "antes" (mesmos números) e `tokens` menor em cada uma. Reportar a tabela antes × depois ao Matheus.

- [ ] **Step 4: PR**

Push da branch, PR com a tabela antes × depois no corpo, terminando com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
