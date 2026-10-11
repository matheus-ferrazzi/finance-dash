#!/usr/bin/env bash
# D: escolhe o grupo que recebe as mensagens (WA_GRUPO) e o número do Matheus para o aviso técnico
# (WA_MATHEUS). Rodar na VPS, como root, com o número já conectado. Grava em .env.worker-whatsapp (600).
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
WORKER=${D_ENV_DIR:-/root/n8n-docker}/.env.worker-whatsapp

LISTA=$(evo GET "/group/fetchAllGroups/financas?getParticipants=false")
printf '%s' "$LISTA" | python3 -c '
import sys, json
gs = json.load(sys.stdin)
for i, g in enumerate(gs, 1):
    print("%3d  %s" % (i, g.get("subject") or "(sem nome)"))
' || { echo "Não deu para listar os grupos."; exit 1; }

read -r -p "Número do grupo na lista acima: " N
GRUPO=$(printf '%s' "$LISTA" | python3 -c "import sys,json; gs=json.load(sys.stdin); print(gs[int(sys.argv[1])-1]['id'])" "$N")
unset LISTA
read -r -p "Seu número para o aviso técnico (com DDI e DDD, só dígitos): " ME
ME=$(printf '%s' "$ME" | tr -cd '0-9')
[[ ${#ME} -ge 12 ]] || { echo "Número curto demais; nada gravado."; exit 1; }

umask 077
touch "$WORKER"
grep -v -e '^WA_GRUPO=' -e '^WA_MATHEUS=' "$WORKER" > "$WORKER.tmp" || true
{ echo "WA_GRUPO=$GRUPO"; echo "WA_MATHEUS=$ME"; } >> "$WORKER.tmp"
mv "$WORKER.tmp" "$WORKER"
chmod 600 "$WORKER"
echo "Gravado em $WORKER. Agora recrie o worker (fora de 16h–16h40 e 22h–22h40)."
