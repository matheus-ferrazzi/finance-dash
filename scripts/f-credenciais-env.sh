#!/usr/bin/env bash
# F: credenciais novas, SEM mostrar valores. Rodar na VPS (ssh vps-financas), como root.
#   bash f-credenciais-env.sh --pluggy-inter   chave da segunda conta da Pluggy (só o Inter) + item-id da conexão
#   bash f-credenciais-env.sh --apibrasil      token da API Brasil + CPFs a consultar (o da Ariane é opcional)
# Cada parte grava o próprio arquivo em /root/n8n-docker (permissão 600) e confere o que dá para conferir:
#   - Pluggy: autentica e lê a conexão (nome do banco e estado), de dentro do finance-worker; segredo vai pelo stdin
#   - API Brasil: só formato do token e dígito verificador dos CPFs (consulta real custa crédito; o teste em
#     homologação fica para quando o código estiver pronto)
# Nada é ligado aqui: os arquivos entram no docker-compose.yml quando o código que os usa for deployado.
set -euo pipefail
DIR=${F_ENV_DIR:-/root/n8n-docker}
umask 077

# colagem costuma trazer espaço, \r (terminal do Windows) ou aspas: tira tudo isso
limpar() { printf '%s' "$1" | tr -d '\r\n\t "'"'"; }
troca() { touch "$1"; grep -v "^$2=" "$1" > "$1.tmp" || true; echo "$2=$3" >> "$1.tmp"; mv "$1.tmp" "$1"; chmod 600 "$1"; }
fim() { echo "Gravado em $1 (permissão 600). Valores não exibidos. Campos: $(cut -d= -f1 "$1" | tr '\n' ' ')"; }

cpf_ok() {
  local c=$1 s d i
  [[ "$c" =~ ^[0-9]{11}$ ]] || return 1
  [[ "$c" =~ ^(.)\1{10}$ ]] && return 1
  for d in 9 10; do
    s=0
    for ((i = 0; i < d; i++)); do s=$((s + ${c:i:1} * (d + 1 - i))); done
    s=$(( (s * 10) % 11 % 10 ))
    [[ "$s" == "${c:d:1}" ]] || return 1
  done
}

pluggy_inter() {
  local ARQ=$DIR/.env.worker-pluggy-inter ID SEC ITEM RES
  read -r -s -p "Client ID da conta nova da Pluggy (não aparece): " ID; echo
  read -r -s -p "Client Secret (não aparece): " SEC; echo
  read -r -p "Item-id da conexão do Inter (aparece; não é segredo): " ITEM
  ID=$(limpar "$ID"); SEC=$(limpar "$SEC"); ITEM=$(limpar "$ITEM")
  local UUID='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  [[ "$ID" =~ $UUID ]] || { echo "Client ID com formato inesperado (esperava um UUID; lido ${#ID} caracteres); nada gravado."; exit 1; }
  [[ ${#SEC} -ge 20 ]] || { echo "Client Secret curto demais (${#SEC} caracteres); nada gravado."; exit 1; }
  [[ "$ITEM" =~ $UUID ]] || { echo "Item-id com formato inesperado (esperava um UUID); nada gravado."; exit 1; }

  # confere de dentro do worker (tem node e rede); as três linhas vão pelo stdin, nunca na linha de comando
  RES=$(printf '%s\n%s\n%s\n' "$ID" "$SEC" "$ITEM" | docker exec -i finance-worker node -e '
const [clientId, clientSecret, item] = require("fs").readFileSync(0, "utf8").split("\n");
(async () => {
  const a = await fetch("https://api.pluggy.ai/auth", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }) });
  if (!a.ok) { console.log("RECUSOU auth HTTP " + a.status); return; }
  const { apiKey } = await a.json();
  const r = await fetch("https://api.pluggy.ai/items/" + item, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) { console.log("ITEM HTTP " + r.status); return; }
  const i = await r.json();
  console.log("OK " + (i.connector?.name ?? "?") + " · " + i.status + "/" + i.executionStatus + " · atualizada " + String(i.lastUpdatedAt ?? "").slice(0, 10));
})().catch((e) => console.log("ERRO " + e.message));' 2>&1) || RES="ERRO docker exec"

  case "$RES" in
    OK*) echo "Pluggy aceitou a chave. Conexão: ${RES#OK }" ;;
    "RECUSOU"*) echo "A Pluggy recusou o Client ID/Secret (${RES#RECUSOU }); nada gravado."; exit 1 ;;
    "ITEM"*) echo "Chave aceita, mas o item-id não abriu (${RES#ITEM }): confira se é da conexão desta conta; nada gravado."; exit 1 ;;
    *) echo "Não deu para conferir agora ($RES); nada gravado. Rode de novo."; exit 1 ;;
  esac
  troca "$ARQ" PLUGGY_INTER_CLIENT_ID "$ID"
  troca "$ARQ" PLUGGY_INTER_CLIENT_SECRET "$SEC"
  troca "$ARQ" PLUGGY_INTER_ITEM_ID "$ITEM"
  unset ID SEC
  fim "$ARQ"
}

apibrasil() {
  local ARQ=$DIR/.env.apibrasil T C1 C2
  read -r -s -p "Token da API Brasil (Bearer; não aparece): " T; echo
  T=$(limpar "$T"); T=${T#Bearer}
  [[ ${#T} -ge 30 && "$T" =~ ^[A-Za-z0-9._|-]+$ ]] || { echo "Token com formato inesperado (lido ${#T} caracteres); nada gravado."; exit 1; }
  read -r -s -p "CPF do Matheus, só números (não aparece): " C1; echo
  C1=$(printf '%s' "$C1" | tr -cd '0-9')
  cpf_ok "$C1" || { echo "CPF do Matheus inválido (dígito verificador não bate); nada gravado."; exit 1; }
  echo "CPF da Ariane: só grave se ela concordou com a consulta. Enter vazio pula."
  read -r -s -p "CPF da Ariane, só números (não aparece): " C2; echo
  C2=$(printf '%s' "$C2" | tr -cd '0-9')
  if [[ -n "$C2" ]] && ! cpf_ok "$C2"; then echo "CPF da Ariane inválido; nada gravado."; exit 1; fi

  troca "$ARQ" APIBRASIL_TOKEN "$T"
  troca "$ARQ" APIBRASIL_CPF_MATHEUS "$C1"
  if [[ -n "$C2" ]]; then troca "$ARQ" APIBRASIL_CPF_ARIANE "$C2"; else grep -q '^APIBRASIL_CPF_ARIANE=' "$ARQ" || echo "(sem CPF da Ariane por enquanto)"; fi
  unset T C1 C2
  fim "$ARQ"
}

case "${1:-}" in
  --pluggy-inter) pluggy_inter ;;
  --apibrasil) apibrasil ;;
  *) echo "uso: bash $0 --pluggy-inter | --apibrasil"; exit 1 ;;
esac
