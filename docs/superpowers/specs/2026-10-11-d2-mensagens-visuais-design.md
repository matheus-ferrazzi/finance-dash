# D2 — Mensagens visuais: gráfico como imagem e texto com emoji

**Data:** 11/10/2026 · **Base:** D (`feat/d-whatsapp`, PR #15) · **Aprovado em conversa:** desenho e protótipo de 11/10.

## Por quê

O D entrega o texto certo, mas é preciso ler para entender. O pedido do Matheus: bater o olho e saber o que está acontecendo — o visual do texto ajuda a entender o que está escrito, e o gráfico vai como imagem junto da mensagem. O gráfico como imagem já estava no plano original do WhatsApp ("imagem só no semanal/mensal") e ficou de fora da spec do D sem decisão; entra aqui, também no diário.

## O que muda para quem recebe

| Mensagem | Imagem | Texto (legenda da imagem) |
|---|---|---|
| **Diário** 8h | "Gasto do mês × o que cabe": linha do gasto livre acumulado até hoje, reta do que cabe no mês, ponto de hoje e, tracejado, onde o ritmo atual leva até o fim do mês. No topo: mês, dia e "hoje: R$ X" em destaque | ☀️ bom dia · 💸 hoje dá pra gastar · 🔥/🐢 ritmo com 🔴/🟢 · 📉/📈 fecha em · 🧾 contas de hoje/amanhã · 👉 link |
| **Semanal** segunda 9h | Barras horizontais por grupo livre (até 6, os de maior gasto ou média): barra = a semana, traço = a média; vermelho acima da média, verde abaixo | 📊 semana · 💰 total com 🔺/🔻 % × média · por grupo emoji do grupo + ⬆️ ⬇️ ⏫ (≥ 2× a média) ⏬ (≤ metade) · 🧭 trilha com barrinha ▰▱▱▱ · ➡️ próximo passo · links |
| **Mensal** dia 1 9h | Barras da sobra dos últimos 6 meses fechados (verde sobrou, vermelho faltou), o mês que fechou destacado | 📅 mês fechou + 🎉 se sobrou · 🟢/🔴 sobrou/faltou × previsto · 🏦 saldo no fim com 🟢/🔴 · 🧭 trilha ▰▱▱▱ (🚀 se mudou de fase) · 🔮 mês novo começa fechando em · link |
| **Técnico** 12h30 | — | 🛠️ aviso técnico · 🔴 por item quebrado, 🟡 por consentimento a vencer |

- Emoji só no texto. A imagem não tem emoji (não há fonte de emoji no servidor); usa cor e forma.
- Tom continua contido (sem gíria); emoji faz o papel de ícone, um por linha, no começo.
- Mês sem dado para o gráfico (ex.: dia 1 sem gasto, semana sem grupos, menos de 2 meses fechados): vai só o texto.

## Como

### Gráfico
- **SVG montado em código** (funções puras em `src/worker/notificacoes/graficos.ts`), no estilo do painel: fundo claro, cantos arredondados, uma fonte, vermelho `#E24B4A` para acima/faltou, verde `#1D9E75` para abaixo/sobrou, cinza para referência. Largura 800 px, altura 480 px (lê bem no celular).
- **PNG com `@resvg/resvg-js`** (binário nativo pré-compilado, inclusive para Alpine/musl; sem navegador). `loadSystemFonts: false` e a fonte vem de um arquivo do repositório (`assets/fonts/`, licença OFL), copiado para a imagem do worker.
- Nada sai da VPS para gerar gráfico (sem QuickChart ou serviço externo).
- O worker é bundle do esbuild: `@resvg/resvg-js` fica `--external` e o estágio `worker` do Dockerfile copia o pacote (e o binário musl) do `node_modules`.

### Dados (rotas do painel, mesmo JSON + campos novos)
- `/api/resumo/diario`: + `serie` — gasto livre acumulado por dia do mês até hoje (`[{dia, acumulado}]`, o mesmo filtro do `variavelJaGasto`: débito, despesa, fora casa e contas travadas, sem espelho), + `cabeNoMes` = gasto livre já feito + `max(0, sobraParaODiaADia)` (o total livre do mês que não fecha no vermelho), + `diasNoMes`.
- `/api/resumo/semanal`: + `todosGrupos` — todos os grupos livres com semana e média (o `grupos` com os 3 que mais mudaram continua para o texto).
- `/api/resumo/mensal`: + `historico` — sobra real dos últimos 6 meses fechados (`[{mes, mesLabel, sobra}]`), de `getMesesPassados(..., 6)`.
- Campos novos são opcionais para o worker: rota antiga (sem o campo) = só texto.

### Envio
- `Canal` ganha `enviarImagem?(png: Buffer, legenda: string)`. `CanalWhatsApp` implementa com `POST /message/sendMedia/{inst}` `{ number, mediatype: 'image', mimetype: 'image/png', fileName, caption, media: <base64> }`, `apikey` no header, timeout 30 s, erro sem a chave.
- Motor: `montar` devolve `{ texto, imagem?: () => Promise<Buffer> }` para diário/semanal/mensal. Em modo real, com canal que envia imagem: gera o PNG e manda com legenda; **se gerar ou enviar a imagem falhar, manda só o texto** e registra o erro da imagem em `erro` com o prefixo `imagem: ` (enviado = true se o texto foi). Telegram (fallback) e bots do C2: só texto, como hoje.
- Legenda do WhatsApp aceita ~1.000 caracteres; as mensagens ficam abaixo disso. Acima de 1.000, manda a imagem sem legenda e o texto em seguida.
- `--dry-run` não gera imagem; `--png <arquivo>` (CLI, só com dry-run) grava o PNG para conferência.
- Registro (`financas_notificacoes`): sem mudança de esquema; o texto gravado é a legenda; a imagem não é gravada.

## Fora do escopo
- Imagem nos bots do C2 e no Telegram.
- Mudar horários, destinos, catálogo ou o cálculo dos números (só apresentação + séries para o gráfico).
- Gráfico no técnico.

## Testes
- `graficos.ts`: SVG de cada mensagem com dados fixos — contém as barras/linhas esperadas (contagem, cor por estado), sem `NaN`/`Infinity`, rótulos em pt-BR; casos vazios devolvem `null`.
- PNG: renderiza o SVG de cada mensagem com a fonte do repositório e confere assinatura PNG e dimensões 800×480.
- Textos: emoji e setas por estado (acima/abaixo, ⏫/⏬, sobrou/faltou, mudou de fase, último dia do mês, sem contas, sem gasto) — os testes atuais de `textosD` são atualizados para o texto novo.
- `CanalWhatsApp.enviarImagem`: corpo do `sendMedia`, chave fora do erro, timeout.
- Motor: imagem falhando → texto enviado e erro `imagem: …` registrado; canal sem `enviarImagem` → só texto; legenda longa → imagem + texto separado.
- Rotas: integração com os campos novos (série acumulada crescente e coerente com `ritmoAtualDia × dia`; histórico com até 6 meses).
- Produção: um disparo de cada no grupo de teste (número do Matheus), conferido no celular.

## Riscos
- `@resvg/resvg-js` no Alpine: o binário musl precisa estar no estágio `worker`. Conferido no build antes do deploy (`node -e "require('@resvg/resvg-js')"` no container).
- Tamanho da imagem do worker sobe (~10–15 MB do binário + fonte).
- Primeira geração de PNG pode levar centenas de ms; irrelevante para 1 mensagem/dia.
