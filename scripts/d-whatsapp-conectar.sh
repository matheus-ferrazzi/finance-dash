#!/usr/bin/env bash
# D: conecta um número de WhatsApp à instância "financas" da Evolution por CÓDIGO DE PAREAMENTO (sem QR).
# Rodar na VPS, como root, com a Evolution no ar:
#   bash d-whatsapp-conectar.sh            (primeira vez)
#   bash d-whatsapp-conectar.sh --trocar   (desconecta o número atual e conecta outro, ex.: o chip)
# O código aparece só no seu terminal. No celular do número: WhatsApp → Aparelhos conectados →
# Conectar um aparelho → "Conectar com número de telefone" → digite o código.
set -euo pipefail
cd "$(dirname "$0")"
. ./d-whatsapp-lib.sh
INST=financas

if [[ "${1:-}" == "--trocar" ]]; then
  # D-M5: diz o que de fato aconteceu (antes dizia "desconectado" mesmo com o logout falhando)
  if evo DELETE "/instance/logout/$INST" >/dev/null 2>&1; then
    echo "Número anterior desconectado."
  else
    EST=$(evo GET "/instance/connectionState/$INST" 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("instance",{}).get("state",""))' 2>/dev/null || true)
    if [[ "$EST" == "open" ]]; then echo "Não consegui desconectar o número atual (estado: open). Nada feito."; exit 1; fi
    echo "Nenhum número conectado (estado: ${EST:-desconhecido}); seguindo."
  fi
fi

EXISTE=$(evo GET "/instance/fetchInstances?instanceName=$INST" 2>/dev/null || true)
if [[ "$EXISTE" != *"\"$INST\""* ]]; then
  evo POST /instance/create "{\"instanceName\":\"$INST\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":false}" >/dev/null
  echo "Instância $INST criada."
fi

read -r -p "Número que vai conectar (com DDI e DDD, só dígitos, ex.: 55119...): " NUM
NUM=$(printf '%s' "$NUM" | tr -cd '0-9')
[[ ${#NUM} -ge 12 ]] || { echo "Número curto demais; nada feito."; exit 1; }

RESP=$(evo GET "/instance/connect/$INST?number=$NUM")
COD=$(printf '%s' "$RESP" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("pairingCode") or "")')
unset RESP
if [[ -z "$COD" ]]; then echo "A Evolution não devolveu código de pareamento. Tente de novo em 1 minuto."; exit 1; fi
echo
echo "  Código de pareamento:  $COD"
echo
echo "  No celular do número: WhatsApp → Aparelhos conectados → Conectar um aparelho →"
echo "  \"Conectar com número de telefone\" → digite o código acima."
echo
for i in $(seq 1 24); do
  sleep 5
  EST=$(evo GET "/instance/connectionState/$INST" 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("instance",{}).get("state",""))' 2>/dev/null || true)
  if [[ "$EST" == "open" ]]; then echo "Conectado (estado: open)."; exit 0; fi
done
echo "Ainda não conectou (estado: ${EST:-desconhecido}). Se o código expirou, rode de novo."
exit 1
