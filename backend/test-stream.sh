#!/usr/bin/env bash
set -euo pipefail

EMAIL="test@lab.dev"
PASS="password123"
BASE="http://localhost:7777"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token: ${TOKEN:0:20}..."

AGENT=$(curl -s "$BASE/api/agents" -H "authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['agents'][0]['id'])")
echo "Agent: $AGENT"

CHAT=$(curl -s -X POST "$BASE/api/chats" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"agentId\":\"$AGENT\",\"title\":\"smoke\"}" | python3 -c "import sys,json; print(json.load(sys.stdin)['chat']['id'])")
echo "Chat: $CHAT"

echo "=== Stream ==="
curl -sN --max-time 15 -X POST "$BASE/api/chats/$CHAT/messages" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"content":"hello there"}' | head -50

echo ""
echo "=== Backend log ==="
tail -20 /tmp/lab-backend.log
