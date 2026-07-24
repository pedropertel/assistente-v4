#!/usr/bin/env bash
# Teste de fumaça da chat-claude (3.5.D.5 + SEC-1) — roda DEPOIS de cada
# deploy. Uso:  bash supabase/functions/fumaca.sh
#
# SEC-1: a Edge exige sessão de usuário autorizado. O script pede a senha
# via read -s (nunca vai pra disco, argv ou histórico) e descarta a
# variável logo após obter a sessão. Anon key segue só como apikey do
# gateway. Não altera dados sensíveis (só mensagens triviais no chat geral).
set -euo pipefail

BASE="https://msbwplsknncnxwsalumd.supabase.co"
URL="$BASE/functions/v1/chat-claude"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ANON="$(grep -o 'eyJ[A-Za-z0-9_.-]*' "$RAIZ/js/core/supabase.js" | head -1)"
EMAIL="pedro.pertel@gmail.com"
falhas=0

check() { # nome, condição(0=ok)
  if [ "$2" -eq 0 ]; then echo "  ✅ $1"; else echo "  ❌ $1"; falhas=$((falhas+1)); fi
}
# Formas seguras com set -e (comando que falha dentro de if não derruba o script)
check_grep() { # nome, conteudo, padrao
  if printf '%s' "$2" | grep -q "$3"; then check "$1" 0; else check "$1" 1; fi
}
check_eq() { # nome, obtido, esperado
  if [ "$2" = "$3" ]; then check "$1 (got $2)" 0; else check "$1 (got $2)" 1; fi
}

echo "== 0. SEC-1 — gate de autenticação (sem sessão) =="
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$URL" \
  -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"texto":"x"}')
check_eq "sem Authorization → 401" "$C" "401"
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$URL" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H "Content-Type: application/json" -d '{"texto":"x"}')
check_eq "anon key como Bearer → 401" "$C" "401"
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$URL" \
  -H "apikey: $ANON" -H "Authorization: Bearer token-invalido" \
  -H "Content-Type: application/json" -d '{"texto":"x"}')
check_eq "token inválido → 401" "$C" "401"

echo "== Login ($EMAIL) =="
read -rs -p "  Senha: " SENHA; echo
# JSON montado via python3 com a senha entrando por STDIN (não em argv
# nem no env do subprocesso); resposta do login NUNCA é impressa.
BODY="$(printf '%s' "$SENHA" | EMAIL="$EMAIL" python3 -c \
  'import json,os,sys;print(json.dumps({"email":os.environ["EMAIL"],"password":sys.stdin.read()}))')"
unset SENHA
# Body via stdin (--data @-): a senha nunca entra no argv do curl (ps).
LOGIN="$(printf '%s' "$BODY" | curl -s --max-time 30 -X POST \
  "$BASE/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" --data @-)"
unset BODY
TOKEN="$(printf '%s' "$LOGIN" | python3 -c \
  'import json,sys;print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)"
unset LOGIN
if [ -z "$TOKEN" ]; then
  echo "  🔴 Login falhou (sem access_token). Senha errada ou Auth fora. Abortando."
  exit 1
fi
echo "  ✅ sessão obtida"
H=(-H "apikey: $ANON" -H "Content-Type: application/json")
# Token via arquivo de config do curl em process substitution (/dev/fd):
# não entra no argv (ps) nem toca disco.
auth_cfg() { printf 'header = "Authorization: Bearer %s"\n' "$TOKEN"; }

echo "== 1. Modo JSON (comportamento base) =="
R=$(curl -s --max-time 60 -X POST "$URL" "${H[@]}" --config <(auth_cfg) -d '{"texto":"responde só: teste ok"}')
check_grep "responde ok:true" "$R" '"ok":true'
check_grep "tem custo_brl (cotação viva)" "$R" '"custo_brl"'

echo "== 2. Modo SSE (streaming) =="
S=$(curl -s -N --max-time 60 -X POST "$URL" "${H[@]}" --config <(auth_cfg) -d '{"texto":"conta de 1 a 3","stream":true}')
check_grep "evento router" "$S" '^event: router'
check_grep "evento delta (stream)" "$S" '^event: delta'
check_grep "evento done" "$S" '^event: done'

echo "== 3. Validação de input (400) =="
C=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 -X POST "$URL" "${H[@]}" --config <(auth_cfg) -d '{"texto":""}')
check_eq "texto vazio → 400" "$C" "400"

echo
if [ "$falhas" -eq 0 ]; then echo "🟢 Fumaça passou."; else echo "🔴 $falhas verificação(ões) falhou. NÃO promover."; exit 1; fi
