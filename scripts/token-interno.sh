#!/usr/bin/env bash
# Auditoria 13/10/2026: token das rotas internas do painel (/api/bot/*, /api/resumo/*), que só o worker usa.
# Rodar na VPS, como root:   bash token-interno.sh
# Gera um token aleatório e grava em /root/n8n-docker/.env.painel-interno (600), que o painel e o worker leem
# (env_file no docker-compose.yml). O valor não é exibido. Depois, recriar os dois (comando no fim).
set -euo pipefail
DIR=${D_ENV_DIR:-/root/n8n-docker}
ARQ=$DIR/.env.painel-interno

if [[ -f "$ARQ" && "${1:-}" != "--trocar" ]]; then
  echo "Já existe $ARQ. Nada feito (use --trocar para gerar outro)."
  exit 0
fi

umask 077
echo "PAINEL_TOKEN_INTERNO=$(openssl rand -hex 32)" > "$ARQ"
chmod 600 "$ARQ"
echo "Pronto: $ARQ (permissão 600). O valor não foi exibido."
echo "Agora (fora de 16h–16h40 e 22h–22h40), recrie os dois:"
echo "  cd $DIR && docker compose up -d --no-deps --force-recreate finance-dashboard finance-worker"
