#!/usr/bin/env bash
# Teste de fumaça da chat-claude (3.5.D.5) — roda DEPOIS de cada deploy.
# Uso:  bash supabase/functions/fumaca.sh
# Lê a anon key do js/core/supabase.js. Não altera dados sensíveis (só
# manda mensagens triviais de teste no chat geral).
set -euo pipefail

URL="https://msbwplsknncnxwsalumd.supabase.co/functions/v1/chat-claude"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
KEY="$(grep -o 'eyJ[A-Za-z0-9_.-]*' "$RAIZ/js/core/supabase.js" | head -1)"
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json")
falhas=0

check() { # nome, condição(0=ok)
  if [ "$2" -eq 0 ]; then echo "  ✅ $1"; else echo "  ❌ $1"; falhas=$((falhas+1)); fi
}

echo "== 1. Modo JSON (comportamento base) =="
R=$(curl -s --max-time 60 -X POST "$URL" "${H[@]}" -d '{"texto":"responde só: teste ok"}')
echo "$R" | grep -q '"ok":true'; check "responde ok:true" $?
echo "$R" | grep -q '"custo_brl"'; check "tem custo_brl (cotação viva)" $?

echo "== 2. Modo SSE (streaming) =="
S=$(curl -s -N --max-time 60 -X POST "$URL" "${H[@]}" -d '{"texto":"conta de 1 a 3","stream":true}')
echo "$S" | grep -q '^event: router'; check "evento router" $?
echo "$S" | grep -q '^event: delta'; check "evento delta (stream)" $?
echo "$S" | grep -q '^event: done'; check "evento done" $?

echo "== 3. Validação de input (400) =="
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$URL" "${H[@]}" -d '{"texto":""}')
[ "$C" = "400" ]; check "texto vazio → 400 (got $C)" $?

echo
if [ "$falhas" -eq 0 ]; then echo "🟢 Fumaça passou."; else echo "🔴 $falhas verificação(ões) falhou. NÃO promover."; exit 1; fi
