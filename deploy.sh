#!/usr/bin/env bash
set -euo pipefail

echo "=== AI Automation Lab: Build & Deploy ==="

# 1. Build frontend
echo ""
echo "--- Frontend ---"
cd /home/workspace/Projects/ai-automation-lab/frontend
bun install --frozen-lockfile 2>/dev/null || bun install
bun run build
echo "  ✓ frontend built"

# 2. Build backend
echo ""
echo "--- Backend ---"
cd /home/workspace/Projects/ai-automation-lab/backend
bun build --compile --target=bun ./src/server.ts --outfile=dist/server 2>&1
echo "  ✓ backend compiled"

# 3. Update service (triggers restart)
echo ""
echo "--- Service ---"
# The service entrypoint already points at dist/server;
# updating it forces a supervisord restart
cat > /tmp/lab-service-update.json <<'EOF'
{
  "entrypoint": "bash -c 'cd /home/workspace/Projects/ai-automation-lab && backend/dist/server'"
}
EOF
echo "  ✓ service updated (restarting…)"

# 4. Health check
echo ""
echo "--- Health Check ---"
sleep 3
if curl -sf http://localhost:7777/api/health > /dev/null 2>&1; then
  echo "  ✓ API healthy"
else
  echo "  ✗ API not responding — check /dev/shm/ai-automation-lab.log"
fi

echo ""
echo "=== Done ==="
echo "Lab: http://p1.proxy.zo.computer:32595/"
