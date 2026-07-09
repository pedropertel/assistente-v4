#!/usr/bin/env bash
# Typecheck das Edge Functions (3.5.D.5) — roda ANTES de cada deploy.
# Uso:  bash supabase/functions/checar.sh
# Pega erro de tipo/import ANTES de subir pra Edge compartilhada (que é
# produção — decisão 3.5.D.7). Precisa do deno instalado (brew install deno).
# Fluxo completo: checar.sh → supabase functions deploy → fumaca.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")" && pwd)"
# Roda de dentro da pasta: o deno descobre config a partir do CWD e, sem
# isso, subiria até um package.json fora do projeto e exigiria node_modules.
cd "$RAIZ"
falhas=0

for fn in "$RAIZ"/*/index.ts; do
  nome="$(basename "$(dirname "$fn")")"
  [ "$nome" = "_shared" ] && continue
  echo "== deno check: $nome =="
  if deno check "$fn"; then echo "  ✅ $nome"; else echo "  ❌ $nome"; falhas=$((falhas+1)); fi
done

echo
if [ "$falhas" -eq 0 ]; then echo "🟢 Typecheck passou. Pode deployar."; else echo "🔴 $falhas function(s) com erro. NÃO deployar."; exit 1; fi
