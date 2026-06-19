#!/usr/bin/env bash
set -euo pipefail
EMAIL="test@lab.dev"
PASS="password123"
BASE="http://localhost:7777"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
AGENT=$(curl -s "$BASE/api/agents" -H "authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['agents'][0]['id'])")
CHAT=$(curl -s -X POST "$BASE/api/chats" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"agentId\":\"$AGENT\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['chat']['id'])")

echo "Chat: $CHAT"
echo "=== Headers + Stream (curl -iN) ==="
curl -isN -X POST "$BASE/api/chats/$CHAT/messages" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"content":"hello"}' --max-time 5
