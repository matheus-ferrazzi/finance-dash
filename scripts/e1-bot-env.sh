#!/usr/bin/env bash
# E1: chave da Groq, modelos reserva e token do webhook do bot, SEM mostrar valores. Rodar na VPS, como root.
#   bash e1-bot-env.sh            (pede a chave da Groq; não aparece na tela)
#   bash e1-bot-env.sh --do-n8n   (usa a mesma chave de uma credencial da Groq do n8n; você escolhe qual pelo nome)
#   bash e1-bot-env.sh --token    (só gera um token novo do webhook; depois rode e1-bot-webhook.sh --ligar)
# Com a chave, consulta na Groq quais modelos existem e grava até 3 da lista de preferência em GROQ_MODELOS.
set -euo pipefail
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
PREFERIDOS="openai/gpt-oss-120b openai/gpt-oss-20b llama-3.3-70b-versatile qwen/qwen3-32b moonshotai/kimi-k2-instruct meta-llama/llama-4-maverick-17b-128e-instruct"
umask 077
touch "$ARQ"
troca() { grep -v "^$1=" "$ARQ" > "$ARQ.tmp" || true; echo "$1=$2" >> "$ARQ.tmp"; mv "$ARQ.tmp" "$ARQ"; }
K=""

case "${1:-}" in
  --token) ;;
  --do-n8n)
    # export descriptografado só dentro do container, legível só pelo dono, nome único; lido numa passada
    # e apagado ANTES da pergunta (nada fica no disco enquanto o script espera você)
    F=/tmp/e1_cred_$(date +%s)_$$.json
    trap 'docker exec n8n_financeiro rm -f "$F" >/dev/null 2>&1 || true' EXIT
    docker exec n8n_financeiro sh -c "umask 077; n8n export:credentials --all --decrypted --output=$F" >/dev/null 2>&1
    LISTA=$(docker exec n8n_financeiro cat "$F" | python3 -c '
import sys, json
for c in json.load(sys.stdin):
    if c.get("type") == "groqApi":
        print("%s\t%s" % (c.get("name", "").replace("\t", " "), (c.get("data") or {}).get("apiKey", "")))')
    docker exec n8n_financeiro rm -f "$F"
    [[ -n "$LISTA" ]] || { echo "Nenhuma credencial da Groq no n8n; nada gravado."; exit 1; }
    printf '%s\n' "$LISTA" | cut -f1 | nl -w3 -s'  '
    read -r -p "Número da credencial da Groq a usar: " N
    [[ "$N" =~ ^[0-9]+$ ]] || { echo "Escolha fora da lista; nada gravado."; exit 1; }
    K=$(printf '%s\n' "$LISTA" | sed -n "${N}p" | cut -f2)
    unset LISTA
    [[ "$K" == gsk_* ]] || { echo "Escolha fora da lista (ou credencial sem chave gsk_); nada gravado."; exit 1; };;
  *)
    read -r -s -p "Chave da Groq (gsk_...; não aparece na tela): " K; echo
    K=$(printf '%s' "$K" | tr -d '[:space:]"'"'")
    [[ "$K" == gsk_* && ${#K} -ge 40 ]] || { echo "Chave com formato inesperado; nada gravado."; exit 1; };;
esac

if [[ -n "$K" ]]; then
  troca GROQ_API_KEY "$K"
  # modelos que existem hoje na Groq (a chave vai pelo stdin do node, nunca na linha de comando)
  DISP=$(printf '%s' "$K" | docker exec -i finance-worker node -e '
const k = require("fs").readFileSync(0, "utf8").trim(); // MODELOS_GROQ
fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + k } })
  .then(async (r) => { if (!r.ok) process.exit(1); (await r.json()).data.forEach((m) => console.log(m.id)); })
  .catch(() => process.exit(1));' 2>/dev/null) || DISP=""
  unset K
  ESCOLHA=""
  for m in $PREFERIDOS; do
    if printf '%s\n' "$DISP" | grep -qxF "$m"; then ESCOLHA="${ESCOLHA:+$ESCOLHA,}$m"; fi
    [[ $(printf '%s' "$ESCOLHA" | tr ',' '\n' | grep -c .) -ge 3 ]] && break
  done
  if [[ -n "$ESCOLHA" ]]; then
    troca GROQ_MODELOS "$ESCOLHA"; echo "Modelos (em ordem de uso): $ESCOLHA"
  else
    grep -q '^GROQ_MODELOS=' "$ARQ" || troca GROQ_MODELOS "openai/gpt-oss-120b"
    echo "Não deu para listar os modelos da Groq agora; ficou: $(grep '^GROQ_MODELOS=' "$ARQ" | cut -d= -f2-). Rode de novo depois."
  fi
fi
if [[ "${1:-}" == "--token" ]] || ! grep -q '^BOT_TOKEN=' "$ARQ"; then troca BOT_TOKEN "$(openssl rand -hex 24)"; fi
chmod 600 "$ARQ"
echo "Gravado em $ARQ (permissão 600). Valores não exibidos. Campos: $(cut -d= -f1 "$ARQ" | tr '\n' ' ')"
