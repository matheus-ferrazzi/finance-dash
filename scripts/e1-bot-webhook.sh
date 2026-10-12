#!/usr/bin/env bash
# E1: liga/desliga o webhook da instância para o bot (só MESSAGES_UPSERT, URL interna com token).
#   bash e1-bot-webhook.sh --ligar | --desligar | --estado
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
case "${1:-}" in
  --ligar)
    T=$(grep '^BOT_TOKEN=' "$ARQ" | cut -d= -f2-); [[ -n "$T" ]] || { echo "Sem BOT_TOKEN (rode e1-bot-env.sh)."; exit 1; }
    evo POST /webhook/set/financas "{\"webhook\":{\"enabled\":true,\"url\":\"http://finance-worker:8090/whatsapp?t=$T\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\"]}}" >/dev/null
    unset T; echo "Webhook ligado (só mensagens novas → worker, rede interna).";;
  --desligar)
    evo POST /webhook/set/financas '{"webhook":{"enabled":false,"url":"http://finance-worker:8090/whatsapp","events":["MESSAGES_UPSERT"]}}' >/dev/null
    echo "Webhook desligado.";;
  --estado)
    evo GET /webhook/find/financas | python3 -c 'import sys,json; d=json.load(sys.stdin) or {}; print("ligado" if d.get("enabled") else "desligado", d.get("events"))';;
  *) echo "uso: $0 --ligar | --desligar | --estado"; exit 1;;
esac
