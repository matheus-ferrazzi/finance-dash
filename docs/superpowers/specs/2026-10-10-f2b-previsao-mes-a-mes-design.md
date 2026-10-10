# F2b — Previsão mês a mês

Data: 10/10/2026 · Projeto: Finanças do Casal · Parte 2 de 2 do F2 (F2a modelo → **F2b tela**). Usa o modelo do P1/F2a sem mudar nenhum número.

## Objetivo

Trocar a tela de Previsão por uma navegação mês a mês, no estilo de uma planilha mensal: ver de relance como o saldo anda mês a mês (passado, mês atual e futuro), abrir qualquer mês para ver de onde vem cada número e, no passado, comparar o previsto com o que aconteceu. A tela responde no topo as decisões do F2a (quando sai do vermelho, quanto gastar no débito).

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Navegação | **Lista de meses** (saldo no fim de cada mês) — opção B; ao tocar, **abre o mês** com as linhas de entra/sai — opção A |
| Abaixo da lista | Meta de gasto no débito · compromissos e parcelas ativas · cadastro de gastos fixos |
| Simulador de compra | Sai da Previsão e vira tela própria no "Mais" |
| Abordagem | Reestruturar a tela atual (`/previsibilidade`), reaproveitando os componentes; sem tela duplicada |

## 1. Topo

- Frase de decisão (do F2a): "Sai do vermelho em **MMM/AA**" (ou "Não sai do vermelho nos próximos 24 meses"); com faixa, o pior caso entre parênteses; sem faixa, o motivo.
- Linha da meta: o texto de `textoMetaAlvo` (ex.: "Para sair do vermelho até MMM/AA: gastar até R$ X/mês no débito…").

## 2. Lista de meses

Uma linha por mês, do mais antigo ao mais distante:

| Tipo | Quais | O que a linha mostra |
|---|---|---|
| Passado ✓ | os 3 meses fechados anteriores ao atual | sobra **real** do mês, previsto pequeno ao lado, e saldo em conta no fim do mês |
| Atual • | o mês em andamento (destacado) | "fecha com" (= `fechaCom`, igual à home e a `/api/previsao`), e a faixa quando houver |
| Futuro | os 12 meses seguintes; botão "ver até 24 meses" | sobra prevista do mês e saldo em conta no fim |

- **Saldo no fim de mês passado**: reconstruído do saldo de hoje desfazendo os movimentos de débito depois do fim daquele mês (`getMovimentosDiarios`, a mesma regra da linha do mês da home, sem espelhos do cartão).
- Cor do saldo: verde ≥ 0, vermelho < 0. Cada linha é um link para o detalhe do mês.

## 3. Detalhe do mês (`?mes=AAAA-MM`)

- A URL guarda o mês (o link da home — `linkPara('previsao', { mes })` — cai direto nele). Setas ‹ › para o mês anterior/seguinte dentro do intervalo da lista; "voltar à lista".
- Mês fora do intervalo (antes dos 3 passados ou depois de 24 à frente) ou inválido: mostra a lista, sem erro.

Linhas: **Entra · Casa e fixos · Débito · Cartão · Sobra do mês · Saldo no fim**. Cada linha (menos sobra e saldo) abre os itens:

| Linha | Itens (mês futuro) |
|---|---|
| Entra | cada parte de receita prevista (nome, dia típico, valor) — `fontesReceita` |
| Casa e fixos | cada compromisso manual ativo no mês e a casa estimada por categoria não cadastrada |
| Débito | gasto do dia a dia (média) e contas travadas (média) |
| Cartão | parcelas já conhecidas que vencem no mês (por compra: nome, banco, parcela, valor) e "compras novas (média)" |

- **Mês atual**: duas colunas — **já aconteceu** (real do mês até hoje: recebido, gasto no débito, casa paga, fatura paga) e **ainda falta** (o que a projeção do mês em andamento já calcula).
- **Mês passado**: três colunas — **previsto · real · diferença**. Previsto = previsão feita na **véspera** do mês (último dia do mês anterior), a mesma régua do teste contra o passado; real = `getRealizado` do mês. Cada linha tem "ver lançamentos" para Gastos (`?mes=`) ou Faturas.

## 4. Abaixo da lista

Na ordem: meta de gasto no débito (a tabela do `tabelaMeta`), compromissos e parcelas ativas, cadastro de gastos fixos — os componentes atuais, reposicionados, sem mudança de comportamento.

## 5. Simulador de compra

Nova rota `/simulador` no "Mais" (barra e sidebar), com o mesmo componente e o veredito pelo pior caso (`compraCabe` + `textoVeredito`). A Previsão deixa de mostrar o simulador e a linha tracejada "com a compra".

## 6. Dados

- `getRealizado(mes, resp = 'casal')`: passa a filtrar pela pessoa (hoje só calcula o casal).
- `getMesesPassados(resp, hoje)`: para cada um dos 3 meses fechados — `{ mes, previsto: Componentes, real: Componentes, saldoFim }`. O previsto de mês passado não muda, então o resultado fica em cache por mês de referência (como a calibração).
- Funções puras (testadas) montam o que a tela mostra:
  - `linhasDaLista(projecao, passados, calib)` → linhas da lista (tipo, mês, sobra, previsto, saldo, faixa);
  - `detalheMesFuturo(base, projecao, parcelados, mes)` → as quatro linhas com itens;
  - `detalheMesAtual(base, projecao)` → já aconteceu × ainda falta;
  - `detalheMesPassado(passado)` → previsto × real × diferença.
- Nenhuma regra de previsão nova: todos os números vêm de `computeProjecao`, `getProjecaoBase`, `getRealizado` e do F2a.

## 7. Aceite e testes

- Unitários: as quatro funções puras (incluindo mês sem parcelas, mês sem receita prevista, sobra negativa, faixa nula).
- Integração: `getRealizado` por pessoa; `getMesesPassados` com dados sintéticos (3 meses, saldo no fim reconstruído).
- Coerência: o "fecha com" da linha do mês atual é igual ao da home e ao de `/api/previsao`; a soma das linhas do detalhe futuro é igual à sobra do mês na lista.
- Visual: prévia local (cópia dos dados só na máquina) no celular e no computador — lista, abrir um mês passado/atual/futuro, setas, voltar, `?mes` inválido.
- Produção: rotas em 200 (incluindo `/simulador`), tempo da primeira chamada medido.

## Fora do F2b

Cenário de mudança de cidade na tela; previsto × realizado além de 3 meses; editar receita prevista pela tela; trilha e reserva (F3).
