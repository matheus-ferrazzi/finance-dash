# F1 — Home e navegação

Data: 10/10/2026 · Projeto: Finanças do Casal (painel Next.js) · Parte 1 de 4 do redesenho (F1 home e navegação → F2 previsão mês a mês → F3 trilha e reserva → F4 categorias pelo painel).

## Objetivo

O painel vira a fonte principal de informação do casal, usado no celular. Ao abrir, a primeira tela responde **"como o mês vai fechar"** sem rolar nem tocar em nada, e cada número leva à tela que aprofunda o assunto, já filtrada. Os filtros moram na URL, para que os links das mensagens (projeto D, WhatsApp) abram a tela certa.

## Decisões tomadas com o Matheus

| Tema | Decisão |
|---|---|
| Pergunta da home | Como o mês vai fechar |
| Layout | Opção **B**: linha do mês no topo + grade 2×2 com os 4 blocos; tudo cabe numa tela de celular sem rolar |
| Blocos | Ritmo do dia · Contas do mês · Para onde vai · Cartões |
| Sai da home | Os 4 cartões de totais (receita/despesa/saldo/investido), o gráfico de 6 meses e os lançamentos recentes — continuam nas telas próprias |
| Barra do celular | Início · Contas · Gastos · Previsão · Mais |
| Abordagem | Evoluir o app atual; nenhuma biblioteca nova |

## 1. Home

### Linha do mês (topo)

Um gráfico de linha, desenhado em SVG no próprio componente, com o saldo em conta do dia 1 ao último dia do mês escolhido:

- **Passado (dia 1 até hoje):** reconstruído a partir do saldo de hoje, desfazendo os movimentos líquidos da conta de cada dia (lançamentos `forma_pagamento = 'Débito'` de todas as classes, com data até hoje — agendado não entra; entrada soma, saída subtrai), da mesma pessoa do filtro. Linha cheia.
- **Hoje:** ponto marcado com o saldo atual.
- **Futuro (amanhã até o fim do mês):** linha tracejada. Cada receita prevista ainda a entrar (`receitasAReceber`, com `diaTipico`) sobe a linha no seu dia; o que ainda sai no mês (`aindaSai` da previsão) desce de forma uniforme pelos dias restantes.
- **Fechamento:** o último ponto é igual, por construção, ao `fechaCom` da previsão (o mesmo número de `/api/previsao`). Destacado em verde se ≥ 0, vermelho se < 0, com o valor ao lado do título "Fecha o mês em".
- Linha do zero tracejada, para ver quando o saldo cruza o vermelho.
- **Mês passado** escolhido no seletor: a linha é toda passado (sem tracejado) e o título vira "Fechou em".
- Toque → **Previsão** (`/previsibilidade?resp=&mes=`).

A série é uma função pura (`serieDoMes`) testada; o componente só desenha.

### Grade 2×2

| Bloco | Mostra | Toque leva para |
|---|---|---|
| **Ritmo do dia** | quanto cabe por dia até o fim do mês (`ritmoSeguroDia`) e quanto está gastando por dia (`ritmoAtualDia`, só gasto livre) | `/gastos?resp=&mes=&tipo=livre` |
| **Contas do mês** | "X/Y" contas pagas e quanto falta pagar (de `getContasDoMes`) | `/contas?resp=&mes=` |
| **Para onde vai** | barra empilhada com os 3 maiores grupos do mês (despesas do mês no débito e no crédito — a mesma base da tela Gastos —, agrupadas por `agruparGastos`) e os nomes | `/gastos?resp=&mes=&grupo=<maior grupo>`; cada pedaço da barra leva ao seu grupo |
| **Cartões** | soma das faturas abertas e o cartão com maior uso do limite (nome e %) | `/faturas?resp=&cartao=<banco>` |

Sem dado (ex.: pessoa sem cartão, mês sem contas cadastradas), o bloco mostra "—" e uma linha curta do porquê; nunca some, para a grade não pular.

### Pessoa e mês

A pessoa (Casal / Matheus / Ariane) e o mês do seletor do topo valem para toda a home e são repassados para a tela de destino em todo link. Na home, o seletor vai do passado até o mês atual (o mês seguinte só existe em Contas e Previsão).

## 2. Filtros na URL e `linkPara`

`src/lib/links.ts`, função pura:

```ts
linkPara(tela: 'inicio' | 'previsao' | 'contas' | 'gastos' | 'faturas' | 'diagnostico' | 'assinaturas'
  | 'investimentos' | 'orcamento' | 'casa' | 'buscar', filtros: {
  resp?: 'casal' | 'Matheus' | 'Ariane'; mes?: 'AAAA-MM'; grupo?: string; cartao?: string; tipo?: 'livre';
}): string
```

- Omite parâmetro com valor padrão (`resp=casal`, mês atual), para os links ficarem curtos.
- Codifica valores com acento/espaço (`grupo=Comer%20fora`).
- Nunca leva valor em reais nem dado pessoal — só filtro.
- É a mesma função que o bot do WhatsApp (D) vai usar.

Telas que passam a entender filtros novos:

| Tela | Parâmetro novo | Efeito |
|---|---|---|
| Gastos | `grupo=<nome do grupo>` | só as categorias daquele grupo; título mostra o grupo e um "×" para limpar |
| Gastos | `tipo=livre` | tira as categorias da Casa e de Dívida e seguro (o mesmo "livre" do ritmo) |
| Faturas | `cartao=<banco>` | o cartão vem primeiro e já aberto |
| Previsão | `mes=` | (já lê `resp`) passa a respeitar o mês |

Filtro inválido (grupo inexistente, cartão que a pessoa não tem) é ignorado: a tela abre sem o filtro, sem erro.

## 3. Navegação

- **Barra de baixo (celular, `< md`):** Início · Contas · Gastos · Previsão · Mais.
- **Mais:** folha que sobe da barra com Faturas, Diagnóstico, Assinaturas, Investimentos, Orçamento, Casa, Buscar. Fecha ao escolher ou tocar fora.
- **Computador (`≥ md`):** barra lateral com a mesma ordem (os 4 principais, separador, os do Mais).
- **Topo:** seletor de mês (‹ mês ›), pessoa e o olho de esconder valores. O ⋯ do topo sai.
- **Atalhos 7/15/30 dias:** só aparecem em Gastos.
- **Mês seguinte** liberado em Contas e Previsão; meses passados em todas.

### Aviso de versão nova

- `GET /api/versao` devolve o identificador do build em produção.
- O painel guarda a versão com que carregou e consulta de novo quando a aba volta a ficar visível e a cada 30 minutos.
- Se mudou, aparece uma faixa fixa acima da barra: "Versão nova do painel — toque para atualizar" (recarrega ao tocar). Nunca recarrega sozinho.

## 4. Visual

- Mantém o tema escuro e as cores atuais (verde do app, rosa da Ariane, laranja do Matheus, vermelho para negativo, âmbar para atenção).
- Cartões com mais respiro e números principais maiores; texto mínimo de 11px no celular; áreas de toque com pelo menos 40px.
- As telas internas não são redesenhadas no F1 — só ganham os filtros acima e herdam a barra nova.

## 5. Números e testes

- A home usa as mesmas funções que já estão no ar (`getProjecaoBase`/`computeProjecao`/`computeRitmo`, `getContasDoMes`, `agruparGastos`, `getFaturas`). Nenhuma regra de cálculo nova além da série da linha.
- Testes unitários (Vitest):
  - `linkPara`: padrão omitido, acento codificado, cada tela, filtro desconhecido ignorado.
  - `serieDoMes`: passado reconstruído bate com o saldo de hoje; receita sobe no dia certo; último ponto = `fechaCom`; mês passado sem futuro; mês sem receita a entrar.
  - resumo dos blocos (maior grupo, cartão com maior uso, "X/Y").
- Integração (Postgres descartável): movimentos diários da conta por pessoa (base do passado da linha).
- Verificação visual na prévia local em 375px (celular) e no computador, com os dados reais copiados para um banco local (nunca no repositório).
- Depois do deploy: todas as rotas em 200 e o fechamento da home igual ao de `/api/previsao`.

## Fora do F1

Previsão mês a mês no estilo da planilha do Breno, faixa de incerteza, cenário de mudança de cidade, débito com tendência (F2); trilha e meta de reserva (F3); hierarquia de categorias e regra pelo painel (F4); redesenho visual das telas internas.
