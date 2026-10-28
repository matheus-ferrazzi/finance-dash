#!/usr/bin/env bash
# 28/10/2026 (Zeca fase 3): roda uma lista de perguntas no código desta pasta, na VPS, sem trocar o worker do grupo.
# Monta a imagem finance-worker:teste e roda `bot-perguntar` num contêiner à parte, com a rede e a configuração do
# worker no ar (a configuração fica só na VPS, em arquivo temporário apagado no fim). Só leitura: bot-perguntar não grava.
#   bash scripts/zeca-teste.sh perguntas.txt > respostas.txt
# Uma pergunta por linha; "@diario|pergunta" pergunta citando o último diário enviado. A lista e as respostas têm
# dados reais: ficam fora do repositório.
set -euo pipefail
cd "$(dirname "$0")/.."
LISTA=${1:?uso: bash scripts/zeca-teste.sh perguntas.txt}
VPS=${VPS:-vps-financas}
TS=$(date +%Y%m%d%H%M%S)
PACOTE=$(mktemp -t zeca-teste-XXXX.tgz)
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.superpowers \
    --exclude='db/*.local.sql' --exclude=tsconfig.tsbuildinfo -czf "$PACOTE" .
scp -q "$PACOTE" "$VPS:/root/zeca-teste_$TS.tgz"
scp -q "$LISTA" "$VPS:/root/zeca-teste_$TS.txt"
rm -f "$PACOTE"
ssh "$VPS" TS="$TS" 'bash -s' <<'REMOTO'
set -euo pipefail
cd /root
ENV=$(mktemp); chmod 600 "$ENV"
trap 'rm -f "$ENV" /root/zeca-teste_$TS.tgz /root/zeca-teste_$TS.txt; rm -rf /root/zeca-teste-src' EXIT
rm -rf zeca-teste-src && mkdir zeca-teste-src && tar -xzf "zeca-teste_$TS.tgz" -C zeca-teste-src
(cd zeca-teste-src && docker build -q --target worker -t finance-worker:teste . >/dev/null)
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' finance-worker | grep -v '^$' > "$ENV"
DIARIO=$(printf "SELECT texto FROM financas_notificacoes WHERE enviado AND bot = 'diario' ORDER BY id DESC LIMIT 1;\n" \
  | docker exec -i postgres-hub sh -c 'psql -U "$POSTGRES_USER" -d personal_hub_db -tA')
roda() { docker run --rm --network container:finance-worker --env-file "$ENV" finance-worker:teste node worker.js bot-perguntar "$@" 2>&1; }
i=0
while IFS= read -r linha || [[ -n "$linha" ]]; do
  [[ -z "$linha" ]] && continue
  i=$((i+1))
  if [[ "$linha" == @diario\|* ]]; then
    q=${linha#@diario|}; echo "=== $i | (citando o diário) $q"; roda "$q" --citada "$DIARIO"
  else
    echo "=== $i | $linha"; roda "$linha"
  fi
done < "zeca-teste_$TS.txt"
echo "=== FIM"
REMOTO
