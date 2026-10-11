#!/usr/bin/env bash
# D: prepara os segredos da Evolution API (WhatsApp) SEM mostrar valores. Rodar na VPS, como root:
#   bash d-evolution-env.sh            (cria uma vez; não sobrescreve)
#   bash d-evolution-env.sh --refazer  (gera chave e senha novas)
# Cria: banco evolution_db + usuário evolution no postgres-hub; /root/n8n-docker/.env.evolution (chave e
# conexão do banco); WA_API_KEY em /root/n8n-docker/.env.worker-whatsapp. Tudo com permissão 600.
set -euo pipefail
DIR=${D_ENV_DIR:-/root/n8n-docker}
EVO=$DIR/.env.evolution
WORKER=$DIR/.env.worker-whatsapp
PG=${D_PG_CONTAINER:-postgres-hub}

if [[ -f "$EVO" && "${1:-}" != "--refazer" ]]; then
  echo "Já existe $EVO. Nada feito (use --refazer para gerar de novo)."
  exit 0
fi

. "${D_FINANCAS_ENV:-/root/.financas.env}"   # PG_SENHA (usuário dono do banco)
CHAVE=$(openssl rand -hex 32)
SENHA=$(openssl rand -hex 24)

# usuário e banco da Evolution (senha só pelo stdin do psql, nunca na linha de comando)
docker exec -i -e PGPASSWORD="$PG_SENHA" "$PG" psql -U mferrazzi -d personal_hub_db -v ON_ERROR_STOP=1 -q >/dev/null <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'evolution') THEN CREATE ROLE evolution LOGIN; END IF;
END \$\$;
ALTER ROLE evolution PASSWORD '$SENHA';
SQL
if ! docker exec -e PGPASSWORD="$PG_SENHA" "$PG" psql -U mferrazzi -d personal_hub_db -Atc "SELECT 1 FROM pg_database WHERE datname='evolution_db'" | grep -q 1; then
  docker exec -e PGPASSWORD="$PG_SENHA" "$PG" psql -U mferrazzi -d personal_hub_db -q -c "CREATE DATABASE evolution_db OWNER evolution" >/dev/null
fi

umask 077
{
  echo "AUTHENTICATION_API_KEY=$CHAVE"
  echo "DATABASE_CONNECTION_URI=postgresql://evolution:$SENHA@$PG:5432/evolution_db?schema=public"
} > "$EVO"
# worker: mantém WA_GRUPO/WA_MATHEUS se já existirem, troca só a chave
touch "$WORKER"
grep -v '^WA_API_KEY=' "$WORKER" > "$WORKER.tmp" || true
echo "WA_API_KEY=$CHAVE" >> "$WORKER.tmp"
mv "$WORKER.tmp" "$WORKER"
chmod 600 "$EVO" "$WORKER"
unset CHAVE SENHA
echo "Pronto: $EVO e WA_API_KEY em $WORKER (permissão 600). Os valores não foram exibidos."
