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

read -r -s -p "Token do bot do Telegram (não aparece): " TOKEN; echo
read -r -s -p "Chat id do grupo (não aparece): " CHAT; echo
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]] || { echo "Token com formato inesperado; nada gravado."; exit 1; }
[[ "$CHAT" =~ ^-?[0-9]+$ ]] || { echo "Chat id com formato inesperado; nada gravado."; exit 1; }

umask 077
{
  echo "TELEGRAM_BOT_TOKEN=$TOKEN"
  echo "TELEGRAM_CHAT_ID=$CHAT"
} > "$ARQ"
chmod 600 "$ARQ"
unset TOKEN CHAT
echo "Gravado em $ARQ (permissão 600). Os valores não foram exibidos."
