# Plano realista para parar de criar dívida — desenho

Data: 13/11/2026. Conversa com o Matheus em 12–13/11, depois da auditoria de 11/11.

## Por que

O plano que o app mostra hoje nunca foi cumprido, e não por falta de vontade: ele pede algo que os dados dizem que
não é o jeito de o casal viver.

- A meta é de gasto **no débito**. Em set/26 o débito foi o menor do ano, mas o gasto só mudou de lugar: foi para o
  cartão. O total do dia a dia (débito + crédito, fora casa, travados e dívida antiga) é estável, de R$ 6,9 mil a
  R$ 8 mil por mês, média de R$ 7,5 mil. Dá para "cumprir" a meta do débito sem gastar um real a menos.
- A Trilha põe "sair das dívidas" como fase 1 e só a fecha na última parcela, em dez/28. Parece inalcançável e não
  é o que incomoda: parcela renegociada e em dia está resolvida.
- A dívida que suja o nome (a do Inter) nem existe para o app.
- No piso da renda faltam cerca de R$ 2.500 por mês. Esse buraco vem sendo coberto pelo cartão, e foi isso que
  virou três renegociações em 2026.

## O que o Matheus decidiu

1. **Renda do plano = o piso.** O salário dele com o plantão de sempre (cerca de R$ 5,5 mil) e o da Ariane
   (R$ 4.368). O plantão maior dele, as férias que ela cobre e as trocas de turno entram quando vierem: adiantam
   o plano, mas o plano não depende deles.
2. **Sair da dívida é, nesta ordem:** o nome dele limpo (o dela já está), sobrar dinheiro todo mês, e parte da
   sobra virar reserva de emergência.
3. **As fases andam juntas, com "parar de criar dívida" primeiro.** Fatura paga inteira, sem cheque especial, sem
   juros. As parcelas do Nubank (até jul/27) e do Bradesco (até dez/28) correm ao lado, como dívidas em dia, sem
   travar fase nenhuma.
4. **Onde há espaço para gastar menos:** mercado, compras, lazer e comer fora com delivery. No mercado a mudança já
   começou (R$ 400 por ida, e o VR dele numa compra maior no começo do mês; o VR não passa pela Pluggy). No
   delivery, de 8 para 4 pedidos por mês. Nas assinaturas, cancelar algumas.
5. **Onde não se mexe:** casa, consórcio, seguro, MEI e as parcelas. A ração do cachorro é uma compra a cada dois
   meses.
6. **A redução é gradual:** "durante a fase 1 ir diminuindo os gastos".
7. **Dívidas fora do banco entram no app.** Ele vai procurar uma forma de buscá-las sem digitar; até lá, cadastro.
8. **A conta nova da Pluggy com o Inter entra no worker**, para conferir com o cálculo do Tesouro e para medir se o
   Inter volta a falhar na sincronização.

## Objetivos

- Um plano que o casal consiga cumprir, mesmo que leve mais tempo.
- A meta do mês mede o que decide o resultado: o total do dia a dia, por grupo.
- A tela diz em que mês deixa de faltar dinheiro, pelo piso da renda, e quanto um mês com extra adianta.
- "Nome limpo" passa a ser algo que o app enxerga e acompanha.

## O que fica de fora

- Recomendar qual dívida pagar antes, negociar ou quitar. O app mostra custo e prazo de cada caminho; a escolha é
  do casal.
- Buscar dívida no Serasa ou no Registrato. Não há consulta automática para pessoa física (pesquisado em 13/11).
- Investimentos além da reserva.

## O que seria fracasso mesmo funcionando

- Uma meta que dá para cumprir passando compra para o cartão.
- Um plano que quebra no primeiro mês sem plantão maior.
- A tela continuar dizendo uma data distante que não muda com o que o casal faz.
- Meta por grupo medindo a coisa errada (resolvido antes, no PR da classificação).

## As partes

### 1. O plano (tela nova, no lugar da "meta de gasto no débito" da Previsão)

Uma conta só, visível inteira:

| | De onde vem |
|---|---|
| Entra (piso) | as fontes de receita recorrentes que o modelo já calcula |
| Casa | compromissos cadastrados + média das contas sem cadastro |
| Travados | consórcio, seguro, imposto (média) |
| Parcelas das dívidas | as já lançadas, mês a mês, com a data em que cada uma acaba |
| Dia a dia | **os tetos do plano**, por grupo |
| Sobra do mês | a diferença |

Os **tetos por grupo** são o plano. Cada grupo com espaço (Mercado, Compras, Lazer e digital, Comer fora) tem um
teto que o casal escolhe na tela; ao lado, a média real dos últimos 3 meses e o menor mês, para a escolha ter
referência. Os grupos em que não se mexe (Saúde, Pet, Transporte, Resto) entram pela média, sem teto.

**Degraus.** O casal escolhe em quantos meses quer chegar aos tetos (padrão: 3). A meta de cada mês desce em
degraus iguais da média de hoje até o teto. Decisão minha, a partir do "ir diminuindo": pode ser trocada por
"teto cheio desde já".

**O que a tela responde:**
- em que mês a sobra passa a ser zero ou mais, só com o piso;
- quanto sobra por mês depois que a parcela do Nubank acaba (jul/27) e depois da do Bradesco (dez/28);
- "com os extras de sempre": a mesma conta somando a mediana dos extras, como segunda linha;
- se os tetos escolhidos não fecham a conta, a tela diz quanto falta, sem sugerir onde cortar.

### 2. A meta do mês passa a ser a do plano

O cartão da home, a mensagem de terça e sexta do Zeca e os alertas (80%, estourou, ritmo) já medem débito +
crédito. Muda só de onde vem o número: hoje é a média de 6 meses menos 10%; passa a ser o total do plano no mês
(tetos no degrau do mês + os grupos sem teto). Sem plano gravado, fica a regra de hoje.

A tela de Orçamento continua, lendo os mesmos tetos do plano. Os seis tetos antigos (por categoria) são
convertidos nos quatro grupos na primeira vez; decisão minha.

### 3. A Trilha com as fases novas

1. **Parar de criar dívida.** Cumprida com 3 meses seguidos sem juros de atraso, sem conta negativa e com as
   faturas pagas inteiras. O "quando" vem do plano.
2. **Nome limpo.** Lista as dívidas fora do banco. Cumprida quando nenhuma está negativada. O "quando" aparece só
   se houver sobra no plano: o valor em aberto dividido pela sobra mensal.
3. **Reserva de emergência.** Como hoje (meses de gasto travado), alimentada pelo que sobra.
4. **Patrimônio.** Como hoje.

À parte, sem travar nada: **dívidas em dia**, com parcela, quantas faltam, quando acaba e, quando nasceu de
renegociação, o custo (já existe).

### 4. Dívidas fora do banco

Cadastro simples na Trilha: credor, de quem é (Matheus ou Ariane), valor, se está negativada, de quando é a
informação, observação. Dá para marcar como quitada (some da fase 2, fica no histórico). Tabela nova, escrita só
pelo painel. O Zeca não cadastra dívida nesta versão.

**De onde vêm os dados (em aberto).** Em 13/11 o Matheus achou na API Brasil consultas pagas por CPF: dívidas
bancárias do SCR do Banco Central (com ou sem score) e relatórios da Serasa (score e restrições), de R$ 4,80 a
R$ 16,88 por consulta. Antes de decidir: uma consulta de teste de cada tipo no CPF dele, para ver o que de fato
volta (se a dívida do Inter aparece, se vem por instituição, se a negativação vem com credor e valor). Se servir, o
cadastro passa a ser preenchido por uma tarefa mensal do worker, com a mesma tela; o cadastro à mão continua
existindo para o que a consulta não trouxer. Cuidados: o CPF e o token não entram no repositório (público); cada
um autoriza a consulta do próprio CPF; a compra de créditos é com o Matheus.

### 5. Segunda chave da Pluggy (Inter)

O worker passa a aceitar mais de uma credencial. Cada conexão diz de qual chave é. A conta e o cartão do Inter
voltam a ser lidos por essa chave; o Tesouro continua calculado pelo preço público por um mês, lado a lado com o
que a Pluggy devolver, e o aviso técnico diz se divergirem. A vigia de sincronização que já existe cobre a
conexão nova. Antes de construir: rodar `scripts/pluggy-inventario.mjs` para ver o que a chave devolve.

## Ordem

1. Classificação pelo destino (feito em 13/11, PRs #81 e #82: 88 lançamentos reclassificados).
2. Dívidas fora do banco + Trilha com as fases novas.
3. O plano (tela, tetos, degraus) e a meta do mês lendo o plano.
4. Segunda chave da Pluggy.

Cada passo é um PR com teste, validado contra o dado real antes do deploy.

## Limites conhecidos

- O VR não aparece: o teto de mercado é só o que passa do VR.
- O piso é o valor típico de cada fonte; um mês abaixo dele quebra a conta daquele mês, e a tela mostra.
- A parcela de compra que ainda vai ser contratada entra na previsão de 3 meses em diante, não no plano: o plano
  conta o gasto no mês da compra, do jeito que a meta já conta.

## Decisões fechadas em 13/11

1. **Tetos de partida** propostos pelos dados e ajustáveis na tela: Mercado R$ 1.600 (nível de out/26), Comer fora e
   delivery R$ 850 (delivery de ~10 para 4 pedidos), Lazer e digital R$ 650 (assinaturas no menor mês + ingresso e
   livro, sem viagem), Compras R$ 1.000. Saúde, pet, transporte e resto entram pela média. Dia a dia: de R$ 7.494
   para R$ 5.564. No piso da renda isso ainda dá −R$ 561 por mês até jul/27 (fim da parcela do Nubank).
2. **Degraus em 3 meses.**
3. **O Zeca avisa qual grupo está acima do teto.**
4. **Dívidas: consulta sob demanda** na API Brasil (botão no app), com uma consulta inicial para popular. Produtos:
   Endividamento Bancário PF (SCR + score) e Dossiê de Crédito PF (pendências com credor e valor). O app guarda só
   dívidas e score; dados cadastrais e PDF são descartados. Construído contra o modo de homologação.
5. **"Parar de criar dívida"** junta o que eram duas fases: 3 meses seguidos com sobra, sem juros de atraso, sem
   conta negativa e com as faturas pagas inteiras. Decisão minha de desenho, a partir da ordem que o Matheus deu.
