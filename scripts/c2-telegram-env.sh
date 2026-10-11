#!/usr/bin/env bash
# C2: grava o token do bot e o chat do grupo do Telegram para o finance-worker, SEM mostrar os valores.
# Rodar na VPS (ssh vps-financas), como root:   bash c2-telegram-env.sh
# Depois: incluir no serviço finance-worker do /root/n8n-docker/docker-compose.yml
#   env_file:
#     - /root/n8n-docker/.env.worker-telegram
# e recriar o worker fora das janelas de ingestão (16h–16h40 e 22h–22h40 SP):
#   cd /root/n8n-docker && docker compose up -d --force-recreate finance-worker
set -euo pipefail
ARQ=/root/n8n-docker/.env.worker-telegram

# colagem costuma trazer espaço, \r (terminal do Windows) ou aspas: tira tudo isso
limpar() { printf '%s' "$1" | tr -d '\r\n\t "'"'"; }

read -r -s -p "Token do bot do Telegram (não aparece): " TOKEN; echo
read -r -s -p "Chat id do grupo (não aparece): " CHAT; echo
TOKEN=$(limpar "$TOKEN"); CHAT=$(limpar "$CHAT")
TOKEN=${TOKEN#bot}   # se colou "bot123:ABC..." (como aparece na URL da API)

# diagnóstico sem mostrar o valor
if ! [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]]; then
  echo "Token com formato inesperado; nada gravado."
  [[ -z "$TOKEN" ]] && echo "  - veio vazio (a colagem não pegou)"
  [[ "$TOKEN" != *:* ]] && echo "  - não tem ':' (o token é número:letras, ex.: 123456789:AAH...)"
  [[ "$TOKEN" =~ ^[0-9]+: ]] || echo "  - não começa com números seguidos de ':'"
  [[ "$TOKEN" =~ [^0-9A-Za-z:_-] ]] && echo "  - tem caractere que não é letra, número, ':', '_' ou '-'"
  echo "  (tamanho lido: ${#TOKEN} caracteres; um token costuma ter 45 a 50)"
  exit 1
fi
if ! [[ "$CHAT" =~ ^-?[0-9]+$ ]]; then
  echo "Chat id com formato inesperado; nada gravado. Deve ser só número, normalmente negativo (ex.: -100...)."
  exit 1
fi

umask 077
{
  echo "TELEGRAM_BOT_TOKEN=$TOKEN"
  echo "TELEGRAM_CHAT_ID=$CHAT"
} > "$ARQ"
chmod 600 "$ARQ"
unset TOKEN CHAT
echo "Gravado em $ARQ (permissão 600). Os valores não foram exibidos."
