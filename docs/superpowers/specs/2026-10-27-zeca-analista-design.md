# Zeca analista — design

27/10/2026. Conversa com o Matheus nesta data; o que é dele está marcado como **decidido**, o resto como **decisão do Claude** ou **para o construtor**.

## Por que

Os envios agendados do Zeca (diário, semanal, mensal, meta, alerta da meta, gasto grande) estão certos e devem continuar como estão. O problema é a conversa no grupo: quando o Matheus ou a Ariane perguntam algo, o Zeca responde travado ("isto é isto, fim") em vez de olhar os números e explicar o que está acontecendo.

Medido em 27/10, depois do PR #67:

- O Zeca só escreve número que veio pronto de uma ferramenta fixa (a "trava"). Quando o texto dele não passa, a resposta vira o texto montado curto. É isso que deixa a resposta dura.
- Para explicar o diário, o PR #67 deu a ele frases prontas com a conta. Funciona, mas ainda não responde o **porquê**. Na pergunta "pq estamos caminhando para o vermelho?" ele mostrou a conta e não disse o que puxou o gasto (R$ 4.957,95 no dia a dia em 26 dias, ~7× o que cabia, nem os maiores gastos). Ainda errou um rótulo ("pela média ainda saem -R$ 72,86": o que sai é R$ 207,98; -72,86 é onde fecha) e pôs bolinhas soltas no fim das linhas.
- Perguntas que fogem das 9 ferramentas fixas não têm resposta.

**Decidido:** o Zeca passa a consultar o banco e fazer as próprias contas para responder do jeito que a pessoa precisa, em texto natural. Para que número errado não chegue ao grupo, um conferente sem o contexto da conversa revisa a resposta antes do envio.

## Exemplos que ele tem que responder bem

Do Matheus:

1. "A mensagem de hoje diz que a gente vai fechar no vermelho. Por que? O que está acontecendo?" (citando ou não o diário)
2. "Quanto eu gastei com [tal coisa] no último mês?"
3. "O que falta pagar no mês atual?"

Resposta boa para o 1 (ilustrativa): diz que sobram R$ 135 para 5 dias (R$ 27/dia), que o dia a dia está em R$ 190/dia, ~7× o que cabe, e que nesse passo fecha em -R$ 818. Cita os 2 ou 3 maiores gastos do mês que puxaram isso e lembra que, pela média do fim do mês, fecha em -R$ 73. Tudo em frases normais, sem lista de definições.

## Objetivos

- Resposta natural, que responde à pergunta com os números e o porquê, sem "isto é isto".
- Responde qualquer pergunta de leitura sobre as finanças do casal que os dados permitam (gastos por período, pessoa, categoria, loja, forma de pagamento; entradas; contas e faturas; previsão do mês; explicação das mensagens do Zeca).
- Nenhum número errado no grupo: todo valor da resposta é rastreável a uma consulta ou a uma conta registrada, e o conferente aprova antes do envio.
- **Decidido:** continua no Groq gratuito, com menos tokens por pergunta.
- **Decidido:** quando bater no limite do Groq, o Zeca avisa que está aguardando e responde quando a cota voltar, em vez de falhar.

## Não objetivos

- Mexer nos envios agendados (textos, horários, gráficos).
- O Zeca gravar algo direto. As propostas (categoria, conta avulsa, gasto em dinheiro) continuam como hoje: proposta, "sim" e gravação pelo código.
- Modelo pago.
- Conversa longa com memória além do que existe hoje (as últimas trocas recentes).

## Anti-objetivos (falhou mesmo que "funcione")

- Um número errado ou com o rótulo trocado chega ao grupo com cara de certo.
- A resposta volta a ser lista de definições ou o texto montado curto em pergunta que dava para responder.
- O Zeca some (sem resposta e sem aviso) porque bateu no limite.
- Regra de negócio diferente do painel: o Zeca soma um "gasto" que o painel não soma (dívida antiga, espelho do cartão, transferência entre o casal, conta da casa onde não cabe).

## Restrições

- Groq gratuito. O erro de 27/10 ("Rate limit reached for model `openai/gpt-oss-20b` … TPM: Limit 8000") mostra que a cota é **por modelo**. Hoje `GROQ_MODELOS=openai/gpt-oss-120b,openai/gpt-oss-20b`.
- Volume baixo: 30 perguntas nos últimos 30 dias. O problema é o pico por minuto, não o total.
- Repositório público: nenhum dado real (valores, nomes de lojas, telefones) em teste ou fixture que vá para o GitHub.
- O banco fica na VPS. O painel lê com `bot_readonly` e o worker usa `pluggy_worker`. Hoje o worker consulta o painel pelas rotas `/api/bot/*`, protegidas por `x-interno`.
- Deploy pelo `scripts/deploy.sh`, fora das janelas de ingestão.
- As regras de "o que é gasto" já existem em SQL em `src/lib/recorteGasto.ts` (`GASTO_META`, `VALOR_GASTO`, `DIVIDA_ANTIGA`, `SEM_ESPELHO`, `CASA_CATS`, `FIXO_META`, `PARCELA`) e em `src/lib/queries.ts`. A tabela é `financas_lancamentos` (3.229 linhas, de 03/2025 até lançamentos futuros de parcelas).

## Ordem (decisão do Claude; o Matheus deixou livre)

1. **Tokens:** medir e cortar.
2. **Espera:** aviso e retentativa. Vem antes do analista porque o analista com conferente vai bater no limite logo.
3. **Analista com conferente.**

Cada fase sobe separada, com teste e deploy próprios.

## Fase 1 — Tokens

Medido em 27/10: a descrição das 14 ferramentas tem ~9.500 caracteres e vai inteira em toda chamada. **Só `propor_categoria` ocupa 3.800 (40%)**, porque lista todas as categorias no texto e no enum. O prompt do sistema tem ~4.200 caracteres. Cada rodada reenvia tudo, mais as respostas das ferramentas, em até 4 rodadas. Nos testes de 27/10, uma pergunta pediu entre 3.800 e 5.400 tokens.

- **Registrar o gasto real:** guardar por pergunta os tokens que o Groq devolve em `usage` (soma das rodadas), em coluna nova de `financas_bot_conversas` (migração). Medir antes e depois de cada fase.
- **Cortar a lista de categorias** da descrição de `propor_categoria` e `propor_gasto_dinheiro`. O código valida, e a categoria inválida volta como erro listando as válidas. Assim o custo só aparece quando é usado.
- **Mandar só as ferramentas que servem à pergunta** (decisão do Claude: por código, sem chamada extra ao modelo). Exemplo: as de proposta só quando a pergunta fala em corrigir, lançar ou mudar; as de explicação de mensagem só quando há citação ou menção a mensagem ou alerta. Se o filtro errar, o modelo não tem como pedir a ferramenta que não vê. Então, quando ele responder sem usar ferramenta nenhuma (o caso "ainda não sei responder"), o código refaz a pergunta **uma vez** com o conjunto completo (decisão do Claude). A regra exata fica **para o construtor**, testada contra o histórico de perguntas de `financas_bot_conversas`.
- **Enxugar o prompt:** tirar o que vira código nas fases 2 e 3.
- **Meta:** medir e reportar. Não há número-alvo fixo, mas a pergunta típica deve caber com folga em 8.000 tokens por minuto, mesmo com o conferente (fase 3).

## Fase 2 — Espera

- No 429, ler quanto esperar (cabeçalho `retry-after` ou o "try again in Xs" da mensagem) e tentar de novo o **mesmo** modelo depois desse tempo, em vez de pular para o próximo da lista e falhar.
- Se a espera passar de ~10 s, mandar **uma** mensagem curta no grupo antes ("⏳ Tô no limite do serviço agora, respondo em cerca de 1 minuto"). Tom contido, sem gíria técnica. Depois mandar a resposta normalmente.
- Limite diário (não por minuto) ou espera longa demais (decisão do Claude: acima de 10 minutos): avisar com clareza que não vai dar para responder agora, em vez de prometer e sumir.
- A fila continua uma pergunta por vez. Perguntas que chegam durante a espera aguardam na fila (até o máximo atual de 5).
- Registrar no log da conversa quanto tempo esperou.

## Fase 3 — Analista com conferente

### Consulta ao banco: ferramenta estruturada, não SQL livre (decisão do Claude)

O Matheus pediu que o Zeca consulte o banco e faça as próprias contas. O jeito escolhido é uma ferramenta `consultar` com parâmetros que o **código** transforma em SQL usando as regras que já existem, e não o modelo escrevendo SQL. Motivos:

- Regra de negócio igual ao painel, sempre. Escrevendo SQL, o modelo esqueceria `DIVIDA_ANTIGA` ou o espelho do cartão e somaria gasto que não existe, que é justamente o anti-objetivo principal.
- Gasta muito menos token do que descrever o schema.
- Não tem SQL inválido nem consulta pesada.

O formato é **para o construtor**, mas precisa cobrir pelo menos:

- **O quê:** gastos (o recorte da meta, igual ao painel), entradas, ou lançamentos em geral.
- **Filtros:** período (os mesmos de hoje: hoje, semana, mês, mês passado, AAAA-MM, intervalo), pessoa (casal, Matheus, Ariane, "eu"), grupo ou categoria do painel, texto (loja, descrição, contraparte), forma de pagamento, faixa de valor.
- **Agrupar por:** nada (total), categoria, grupo, loja/contraparte, dia, semana, mês, pessoa.
- **Ordenar e limitar:** no máximo 20 linhas, sempre com o total geral junto, mesmo quando a lista corta.
- Gastos e entradas seguem as mesmas definições das telas do painel (decisão do Claude): gasto inclui o gasto em dinheiro vivo (`financas_gastos_dinheiro`), marcado à parte como hoje no `gasto_periodo`; entradas e gastos ignoram a transferência entre o casal (`transferencia_casal`, `par_transferencia`). Na dúvida, vale o que a tela correspondente do painel mostra: o número do Zeca tem que bater com ela.
- A resposta diz em uma linha que regra aplicou ("gasto no recorte da meta: sem contas da casa e sem dívida antiga"), para o Zeca poder dizer e o conferente checar.

Executa no painel numa rota nova `/api/bot/consulta` (mesmo padrão `x-interno`, mesmo usuário só-leitura), com tempo limite. As ferramentas fixas de hoje (`situacao_mes` com a `explicacao`, `contas_do_mes`, `faturas`, `trilha`, `simular_compra`, `investimentos`, `mensagens_do_zeca`, busca e propostas) continuam. `gasto_periodo`, `maiores_gastos` e `comparar` podem virar casos de `consultar`, a critério do construtor, desde que os números batam com os de hoje.

### Calculadora

Ferramenta `calcular` (expressão simples: + − × ÷, porcentagem, arredondamento) para as contas que o Zeca quiser fazer ("7× o que cabe", "diferença para o mês passado"). O resultado é registrado e passa a valer como dado para a checagem. O modelo **não** faz conta de cabeça.

### O que o Zeca escreve

- Prompt novo, curto: responder à pergunta como alguém que olhou os números; dizer o porquê com valores; sem definir termos; até ~12 linhas no WhatsApp (*negrito* com um asterisco); emoji no começo da linha com moderação; bolinhas 🟢🟡🔴 só quando cita a cor de uma linha de mensagem do Zeca.
- Para explicar uma mensagem: os dados da `explicacao` e da conta guardada no diário (PR #67) são fonte, não texto para copiar.
- "Eu" = quem perguntou. A data de hoje é de São Paulo.
- O link do painel continua sendo do sistema (`comLink`).
- Pergunta sem dado que responda: dizer o que não dá para saber, sem chutar.

### Conferente — duas camadas

1. **Por código (sempre):** todo R$ e % da resposta tem que existir nos resultados das ferramentas ou da calculadora, com o sinal e o rótulo certos. É a trava atual, estendida para os resultados de `consultar` e `calcular`, mantendo a regra dos dois "fecha em" do PR #67. Pega número inventado.
2. **Por modelo, sem contexto (sempre que a resposta tem número e foi escrita pelo modelo):** os textos do sistema (proposta, lista de candidatos, confirmação, resposta segura) não passam por aqui (decisão do Claude). Um segundo modelo, **outro que não o que escreveu a resposta naquela pergunta** (cota separada; se o Zeca caiu para o modelo reserva, o conferente usa o principal), recebe só a pergunta, um resumo compacto dos dados retornados e a resposta, e devolve aprovado ou a lista de problemas (afirmação que os dados não sustentam, rótulo trocado, total de outro período, "gastou" que é entrada). Prompt curto, sem histórico. Pega o erro de sentido, como o "-72,86 que sai".

**Se reprovar** (decisão do Claude): os problemas voltam ao Zeca para **uma** reescrita, que passa de novo pelas duas camadas. Se reprovar de novo, vai para o grupo a resposta segura: o texto montado das ferramentas usadas, ou a `explicacao` pronta, com uma linha honesta antes ("Não consegui conferir a análise; os números que tenho com certeza são estes:"). Nunca vai a resposta reprovada.

Se o conferente estiver no limite do Groq, ele espera como na fase 2. Não pular a conferência.

### Registro

Por pergunta, em `financas_bot_conversas`: tokens (Zeca e conferente), espera, veredito do conferente (aprovado de primeira, aprovado na reescrita, caiu na resposta segura) e os problemas apontados. Serve para medir e para achar as perguntas em que ele erra.

## Como saber que deu certo

- **Conjunto de perguntas de teste** (~15): as três do Matheus acima, as do histórico de `financas_bot_conversas` e variações (citando e sem citar o diário; uma pessoa e o casal; período sem gasto; pergunta sem dado). Roda pelo `bot-perguntar` com o modelo real na VPS. Os números esperados são conferidos à mão contra o painel antes. Os casos reais ficam fora do repositório (repo público); no repo vão só os testes unitários com dados inventados.
- Em todas: nenhum número errado ou com rótulo trocado; responde o que foi perguntado; no caso do vermelho, diz o porquê e o que puxou o gasto.
- Tokens por pergunta medidos antes (fase 1) e depois de cada fase.
- Os envios agendados seguem iguais (os testes de equivalência existentes passam).
- O Matheus usa uns dias no grupo e diz se a resposta está natural.

## Decisões do Claude (para o Matheus conferir)

- A ordem: espera antes do analista.
- Consulta estruturada no lugar de SQL livre escrito pelo modelo.
- Filtro de ferramentas por código; sem ferramenta usada, refaz uma vez com todas.
- Gasto e entrada com as mesmas definições do painel, incluindo o dinheiro vivo e excluindo a transferência entre o casal.
- O conferente usa um modelo diferente do que escreveu a resposta e não confere os textos do sistema.
- Reprovou duas vezes: vai a resposta segura com uma linha honesta antes. A reprovada nunca vai.
- Espera acima de 10 minutos ou limite diário: avisa que não dá para responder agora.

## Para o construtor

- O formato exato de `consultar` e `calcular`, e quais ferramentas antigas viram casos dele.
- A regra de filtro de ferramentas da fase 1, testada contra o histórico.
- Que modelo faz o quê, entre os disponíveis no Groq gratuito, com o conferente em modelo diferente do Zeca.
- O texto dos prompts e das mensagens de espera, dentro do tom descrito.
- Os nomes de colunas e migrações.
