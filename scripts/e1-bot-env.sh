#!/usr/bin/env bash
# E1: chave da Groq e token do webhook do bot, SEM mostrar valores. Rodar na VPS, como root.
#   bash e1-bot-env.sh            (pede a chave da Groq; não aparece na tela)
#   bash e1-bot-env.sh --do-n8n   (usa a mesma chave de uma credencial da Groq do n8n; você escolhe qual pelo nome)
#   bash e1-bot-env.sh --token    (só gera um token novo do webhook; depois rode e1-bot-webhook.sh --ligar)
set -euo pipefail
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
umask 077
touch "$ARQ"
troca() { grep -v "^$1=" "$ARQ" > "$ARQ.tmp" || true; echo "$1=$2" >> "$ARQ.tmp"; mv "$ARQ.tmp" "$ARQ"; }

case "${1:-}" in
  --token) ;;
  --do-n8n)
    # export descriptografado só dentro do container, nome único, apagado logo depois; só a chave escolhida sai
    F=/tmp/e1_cred_$(date +%s)_$$.json
    trap 'docker exec n8n_financeiro rm -f "$F" >/dev/null 2>&1 || true' EXIT
    docker exec n8n_financeiro n8n export:credentials --all --decrypted --output="$F" >/dev/null 2>&1
    docker exec n8n_financeiro cat "$F" | python3 -c '
import sys, json
cs = [c for c in json.load(sys.stdin) if c.get("type") == "groqApi"]
for i, c in enumerate(cs, 1): print("%3d  %s" % (i, c.get("name")))' >&2
    read -r -p "Número da credencial da Groq a usar: " N
    K=$(docker exec n8n_financeiro cat "$F" | python3 -c '
import sys, json
cs = [c for c in json.load(sys.stdin) if c.get("type") == "groqApi"]
n = int(sys.argv[1])
if not 1 <= n <= len(cs): sys.exit(1)
print((cs[n-1].get("data") or {}).get("apiKey", ""))' "$N") || { echo "Escolha fora da lista; nada gravado."; exit 1; }
    [[ "$K" == gsk_* ]] || { echo "A credencial não tem uma chave gsk_; nada gravado."; exit 1; }
    troca GROQ_API_KEY "$K"; unset K;;
  *)
    read -r -s -p "Chave da Groq (gsk_...; não aparece na tela): " K; echo
    K=$(printf '%s' "$K" | tr -d '[:space:]"'"'")
    [[ "$K" == gsk_* && ${#K} -ge 40 ]] || { echo "Chave com formato inesperado; nada gravado."; exit 1; }
    troca GROQ_API_KEY "$K"; unset K;;
esac
grep -q '^GROQ_MODELOS=' "$ARQ" || troca GROQ_MODELOS "openai/gpt-oss-120b"
grep -q '^BOT_TOKEN=' "$ARQ" && [[ "${1:-}" != "--token" ]] || troca BOT_TOKEN "$(openssl rand -hex 24)"
chmod 600 "$ARQ"
echo "Gravado em $ARQ (permissão 600). Valores não exibidos. Campos: $(cut -d= -f1 "$ARQ" | tr '\n' ' ')"
