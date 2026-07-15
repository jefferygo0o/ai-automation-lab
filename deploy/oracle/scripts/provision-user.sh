#!/bin/bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <username> [supabase_db_url] [lab_master_key]"
  echo ""
  echo "Creates a new lab container for <username>."
  echo "Requires VM_IP env var or first argument after username."
  exit 1
fi

USERNAME="$1"
SUPABASE_DB_URL="$2"
LAB_MASTER_KEY="$3"
VM_IP="${VM_IP:-}"

if [ -z "$VM_IP" ]; then
  VM_IP=$(curl -s ifconfig.me)
fi

if [ -z "$SUPABASE_DB_URL" ] || [ -z "$LAB_MASTER_KEY" ]; then
  echo "Error: SUPABASE_DB_URL and LAB_MASTER_KEY are required."
  echo "Pass them as arguments or set SUPABASE_DB_URL and LAB_MASTER_KEY env vars."
  exit 1
fi

DATA_DIR="/mnt/lab/users/$USERNAME"
mkdir -p "$DATA_DIR"

docker run -d \
  --name "lab-app-$USERNAME" \
  --restart unless-stopped \
  --network lab \
  --label "traefik.enable=true" \
  --label "traefik.http.routers.${USERNAME}.rule=Host(\`${USERNAME}.${VM_IP}.nip.io\`)" \
  --label "traefik.http.routers.${USERNAME}.entrypoints=web" \
  --label "traefik.http.services.${USERNAME}.loadbalancer.server.port=7778" \
  -v "${DATA_DIR}:/var/data/lab" \
  -e "PORT=7778" \
  -e "NODE_ENV=production" \
  -e "SUPABASE_DB_URL=${SUPABASE_DB_URL}" \
  -e "LAB_MASTER_KEY=${LAB_MASTER_KEY}" \
  -e "LAB_USER_ID=${USERNAME}" \
  -e "LAB_PROJECT_ROOT=/app" \
  -e "LAB_DATA_DIR=/var/data/lab" \
  -e "LAB_DIST=" \
  lab-app:latest

echo "Provisioned lab-app-$USERNAME"
echo "URL: http://${USERNAME}.${VM_IP}.nip.io"
