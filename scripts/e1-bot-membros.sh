#!/usr/bin/env bash
# E1: quem é quem no grupo (JID de telefone e LID) e os JIDs do número conectado. Grava BOT_MEMBROS e BOT_JIDS
# em .env.worker-bot (600) sem mostrar valores — a lista mostra só os 4 últimos dígitos de cada número.
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
ARQ=${E1_ENV:-/root/n8n-docker/.env.worker-bot}
GRUPO=$(grep '^WA_GRUPO=' "${D_ENV_DIR:-/root/n8n-docker}/.env.worker-whatsapp" | cut -d= -f2-)
[[ -n "$GRUPO" ]] || { echo "WA_GRUPO não configurado (rode d-whatsapp-grupos.sh)."; exit 1; }
PART=$(evo GET "/group/participants/financas?groupJid=$GRUPO")
DONO=$(evo GET "/instance/fetchInstances?instanceName=financas" | python3 -c 'import sys,json; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(d.get("ownerJid") or "")')
printf '%s' "$PART" | python3 -c '
import sys, json
d = json.load(sys.stdin); ps = d.get("participants", d) if isinstance(d, dict) else d
for i, p in enumerate(ps, 1):
    tel = (p.get("phoneNumber") or "").split("@")[0]
    print("%3d  número terminado em %s" % (i, tel[-4:] if tel else "????"))'
read -r -p "Número da lista que é o Matheus: " NM
read -r -p "Número da lista que é a Ariane (Enter se ela não está no grupo): " NA
SAIDA=$(printf '%s' "$PART" | python3 -c '
import sys, json
d = json.load(sys.stdin); ps = d.get("participants", d) if isinstance(d, dict) else d
dono = sys.argv[3]
def jids(n):
    n = int(n)
    if not 1 <= n <= len(ps): sys.exit(1)
    p = ps[n-1]
    return sorted({x for x in (p.get("id"), p.get("phoneNumber")) if x})
membros = {"Matheus": jids(sys.argv[1])}
if sys.argv[2]: membros["Ariane"] = jids(sys.argv[2])
# número conectado: se for um dos membros (hoje, o Matheus), os JIDs dele; senão (chip), o JID do dono
bot = next((js for js in membros.values() if dono in js), [dono] if dono else [])
print(";".join("%s=%s" % (k, "|".join(v)) for k, v in membros.items()))
print("|".join(bot))' "$NM" "${NA:-}" "$DONO") || { echo "Escolha fora da lista; nada gravado."; exit 1; }
umask 077; touch "$ARQ"
troca() { grep -v "^$1=" "$ARQ" > "$ARQ.tmp" || true; echo "$1=$2" >> "$ARQ.tmp"; mv "$ARQ.tmp" "$ARQ"; }
troca BOT_MEMBROS "$(printf '%s\n' "$SAIDA" | sed -n 1p)"
troca BOT_JIDS "$(printf '%s\n' "$SAIDA" | sed -n 2p)"
chmod 600 "$ARQ"; unset PART SAIDA DONO
echo "Gravado BOT_MEMBROS e BOT_JIDS em $ARQ (600). Valores não exibidos."
