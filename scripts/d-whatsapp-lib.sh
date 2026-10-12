#!/usr/bin/env bash
# D: função compartilhada pelos scripts do WhatsApp. Chama a Evolution API pela rede interna usando o node
# do container do worker; a chave vai pelo stdin (nunca na linha de comando nem no ps).
# Uso: evo METODO CAMINHO [JSON]   → imprime a resposta; sai 0 se HTTP 2xx.
EVO_ENV=${EVO_ENV:-/root/n8n-docker/.env.evolution}
EVO_URL=${EVO_URL:-http://evolution:8080}

evo() {
  local chave
  chave=$(grep '^AUTHENTICATION_API_KEY=' "$EVO_ENV" | cut -d= -f2-)
  printf '%s\n%s\n%s\n%s\n%s' "$chave" "$EVO_URL" "$1" "$2" "${3:-}" | docker exec -i finance-worker node -e '
const [k, base, metodo, caminho, corpo] = require("fs").readFileSync(0, "utf8").split("\n");
fetch(base + caminho, { method: metodo, headers: { apikey: k, "Content-Type": "application/json" }, body: corpo || undefined })
  .then(async (r) => { process.stdout.write(await r.text()); process.exit(r.ok ? 0 : 1); })
  .catch((e) => { console.error("falha ao falar com a Evolution: " + (e && e.message)); process.exit(2); });'
}
