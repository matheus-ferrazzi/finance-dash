#!/usr/bin/env bash
# Deploy único do painel e do worker (auditoria 13/10/2026; o roadmap pedia "teste antes, conferência depois").
# Rodar no PC, na raiz do repositório, no Git Bash:
#   bash scripts/deploy.sh painel|worker|ambos [--migracao 014] [--sem-testes] [--simular]
# Faz: testes → confere o horário na VPS (fora de 16h–16h40, 22h–22h40 SP e do minuto :09) → empacota (com o
# package-lock.json; sem node_modules/.next/.git) → aplica a(s) migração(ões) pedida(s) → backup do fonte e tag
# da imagem anterior → build → sobe SÓ o container (--no-deps) → confere rotas/logs → imprime como reverter.
# --simular mostra o que faria e para antes de mexer na VPS.
set -euo pipefail

ALVO=${1:-}
[[ "$ALVO" =~ ^(painel|worker|ambos)$ ]] || { echo "uso: bash scripts/deploy.sh painel|worker|ambos [--migracao NNN] [--sem-testes] [--simular]"; exit 1; }
shift
MIGRACOES=(); TESTES=1; SIMULAR=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --migracao) MIGRACOES+=("$2"); shift 2 ;;
    --sem-testes) TESTES=0; shift ;;
    --simular) SIMULAR=1; shift ;;
    *) echo "opção desconhecida: $1"; exit 1 ;;
  esac
done

VPS=${VPS:-vps-financas}
TS=$(date +%Y%m%d%H%M%S)
PACOTE=/tmp/deploy_$TS.tgz
etapa() { printf '\n== %s\n' "$*"; }

for m in "${MIGRACOES[@]}"; do
  ls db/migrations/${m}_*.sql >/dev/null 2>&1 || { echo "migração $m não existe em db/migrations"; exit 1; }
done

if [[ $TESTES -eq 1 ]]; then
  etapa "testes"
  npx tsc --noEmit -p . && npx vitest run >/tmp/deploy_testes_$TS.log 2>&1 || { tail -30 /tmp/deploy_testes_$TS.log; echo "TESTES FALHARAM: nada enviado"; exit 1; }
  grep -E "Tests " /tmp/deploy_testes_$TS.log | tail -1
fi

etapa "horário na VPS"
read -r HM MIN <<<"$(ssh "$VPS" 'TZ=America/Sao_Paulo date "+%H:%M %M"')"
echo "agora em SP: $HM"
H=${HM%%:*}; M=${MIN#0}
if { [[ "$H" == "16" || "$H" == "22" ]] && (( M <= 40 )); } || [[ "$MIN" == "09" ]]; then
  echo "Janela de ingestão (16h–16h40 / 22h–22h40) ou minuto :09: espere e rode de novo."; exit 1
fi

etapa "pacote"
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude=.superpowers \
    --exclude='db/*.local.sql' --exclude=tsconfig.tsbuildinfo -czf "$PACOTE" .
ls -l "$PACOTE" | awk '{print $5" bytes"}'
[[ $SIMULAR -eq 1 ]] && { echo "--simular: parando antes de enviar. Migrações: ${MIGRACOES[*]:-nenhuma}"; rm -f "$PACOTE"; exit 0; }
scp -q "$PACOTE" "$VPS:/root/deploy_$TS.tgz"
rm -f "$PACOTE"

etapa "na VPS"
ssh "$VPS" ALVO="$ALVO" TS="$TS" MIGS="${MIGRACOES[*]:-}" 'bash -s' <<'REMOTO'
set -euo pipefail
. /root/.financas.env
cd /root
P=/root/deploy_$TS.tgz
for m in $MIGS; do
  f=$(tar -tzf "$P" | grep -E "db/migrations/${m}_.*\.sql$" | head -1)
  echo "migração $f"
  tar -xzf "$P" -O "$f" | PGPASSWORD="$PG_SENHA" docker exec -i -e PGPASSWORD postgres-hub psql -U mferrazzi -d personal_hub_db -v ON_ERROR_STOP=1 -q
done
if [[ "$ALVO" == painel || "$ALVO" == ambos ]]; then
  docker tag finance-dash:1 "finance-dash:pre-$TS"
  cp -a finance-dash "finance-dash.bak-$TS"; rm -rf finance-dash; mkdir finance-dash; tar -xzf "$P" -C finance-dash
  (cd finance-dash && docker build -q -t finance-dash:1 . >/dev/null)
  (cd /root/n8n-docker && docker compose up -d --no-deps --force-recreate finance-dashboard 2>&1 | tail -1)
fi
if [[ "$ALVO" == worker || "$ALVO" == ambos ]]; then
  docker tag finance-worker:1 "finance-worker:pre-$TS"
  cp -a finance-worker-src "finance-worker-src.bak-$TS"; rm -rf finance-worker-src; mkdir finance-worker-src; tar -xzf "$P" -C finance-worker-src
  (cd finance-worker-src && docker build -q --target worker -t finance-worker:1 . >/dev/null)
  (cd /root/n8n-docker && docker compose up -d --no-deps --force-recreate finance-worker 2>&1 | tail -1)
fi
rm -f "$P"

echo "== conferência"
sleep 8
FALHAS=0
if [[ "$ALVO" == painel || "$ALVO" == ambos ]]; then
  for r in / /gastos /faturas /contas /previsibilidade /trilha /buscar /diagnostico /api/previsao; do
    c=$(docker run --rm --network n8n-docker_n8n_network curlimages/curl:latest -s -o /dev/null -w "%{http_code}" "http://finance-dashboard:3000$r")
    echo "  $r $c"; [[ "$c" == 200 ]] || FALHAS=$((FALHAS+1))
  done
fi
if [[ "$ALVO" == worker || "$ALVO" == ambos ]]; then
  docker logs --tail 3 finance-worker 2>&1 | sed 's/^/  /'
  docker logs --tail 3 finance-worker 2>&1 | grep -q "worker no ar" || FALHAS=$((FALHAS+1))
fi
echo
if [[ $FALHAS -gt 0 ]]; then echo "ATENÇÃO: $FALHAS conferência(s) falharam."; else echo "OK: tudo respondeu."; fi
echo "Reverter:"
[[ "$ALVO" != worker ]] && echo "  painel: docker tag finance-dash:pre-$TS finance-dash:1 && cd /root/n8n-docker && docker compose up -d --no-deps --force-recreate finance-dashboard   (fonte: /root/finance-dash.bak-$TS)"
[[ "$ALVO" != painel ]] && echo "  worker: docker tag finance-worker:pre-$TS finance-worker:1 && cd /root/n8n-docker && docker compose up -d --no-deps --force-recreate finance-worker   (fonte: /root/finance-worker-src.bak-$TS)"
exit $FALHAS
REMOTO
