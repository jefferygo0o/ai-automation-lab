#!/bin/bash
set -euo pipefail

exec > /var/log/lab-bootstrap.log 2>&1
echo "[bootstrap] Starting at $(date)"

# Mount block volume
BLOCK_DEVICE="/dev/oracleoci/oraclevdb"
if [ ! -b "$BLOCK_DEVICE" ]; then
  for dev in /dev/sdb /dev/nvme1n1 /dev/xvdb; do
    if [ -b "$dev" ]; then BLOCK_DEVICE="$dev"; break; fi
  done
fi
if [ -b "$BLOCK_DEVICE" ]; then
  mkfs.ext4 -F "$BLOCK_DEVICE" 2>/dev/null || true
  mkdir -p /mnt/lab
  mount "$BLOCK_DEVICE" /mnt/lab
  echo "LABEL=lab /mnt/lab ext4 defaults 0 2" >> /etc/fstab
else
  echo "[bootstrap] WARNING: No block device found, using /mnt/lab on root volume"
  mkdir -p /mnt/lab
fi

mkdir -p /mnt/lab/users /mnt/lab/backups

# Install Docker
echo "[bootstrap] Installing Docker…"
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo 2>/dev/null || true
dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin 2>/dev/null || \
  dnf install -y docker-engine docker-compose-plugin 2>/dev/null || \
  curl -fsSL get.docker.com | bash
systemctl enable --now docker

# Write compose files
mkdir -p /mnt/lab/compose /mnt/lab/scripts

cat > /mnt/lab/compose/Dockerfile << 'DOCKERFILE_EOF'
FROM oven/bun:1.3.11 AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS install
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends python3 build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

FROM install AS runtime
WORKDIR /app
RUN apt-get update -qq && apt-get install -y --no-install-recommends curl ca-certificates nodejs npm python3 python3-pip && rm -rf /var/lib/apt/lists/* && curl -fsSL https://astral.sh/uv/install.sh | sh && rm -rf /root/.cargo
ENV PATH="/root/.local/bin:$PATH"
COPY --from=install /app/node_modules ./node_modules
COPY backend/ ./backend/

ENV PORT=7778
ENV LAB_PROJECT_ROOT=/app
ENV LAB_DIST=/app/backend/dist-spa
ENV LAB_DATA_DIR=/app/backend/data
EXPOSE 7778
WORKDIR /app/backend
CMD ["bun", "run", "src/server.ts"]

DOCKERFILE_EOF

cat > /mnt/lab/compose/docker-compose.yml << 'COMPOSE_EOF'
services:
  traefik:
    image: traefik:v3.3
    container_name: traefik
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
    ports:
      - "80:80"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
    networks:
      - lab

networks:
  lab:
    name: lab

COMPOSE_EOF

cat > /mnt/lab/scripts/provision-user.sh << 'USER_EOF'
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

USER_EOF
chmod +x /mnt/lab/scripts/provision-user.sh

cat > /mnt/lab/scripts/backup.sh << 'BACKUP_EOF'
#!/bin/bash
set -euo pipefail

BUCKET="$1"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
ARCHIVE="/tmp/backup-${TIMESTAMP}.tar.gz"

echo "=== Lab Backup $TIMESTAMP ==="

# Tar user data (exclude caches/tmp)
tar czf "$ARCHIVE" \
  -C /mnt/lab \
  --exclude='users/*/tmp' \
  --exclude='users/*/cache' \
  users/

# Upload to Object Storage
oci os object put \
  --bucket-name "$BUCKET" \
  --name "backups/${TIMESTAMP}.tar.gz" \
  --file "$ARCHIVE"

rm "$ARCHIVE"

echo "Backup uploaded to oci://${BUCKET}/backups/${TIMESTAMP}.tar.gz"

# Retention: keep last 30 backups
oci os object list \
  --bucket-name "$BUCKET" \
  --prefix "backups/" \
  --query 'data[].name' \
  --raw-output \
  --all | tr ',' '\n' | tr -d ' "' | sort | head -n -30 \
  | while read -r obj; do
    if [ -n "$obj" ]; then
      oci os object delete --bucket-name "$BUCKET" --name "$obj" --force
      echo "Deleted old backup: $obj"
    fi
  done

BACKUP_EOF
chmod +x /mnt/lab/scripts/backup.sh

# Download and build lab code
echo "[bootstrap] Downloading lab source…"
mkdir -p /opt/lab
cd /opt/lab
curl -fsSL -o lab-source.tar.gz "<INSERT_PAR_URL_AFTER_UPLOAD>"
tar xzf lab-source.tar.gz
rm lab-source.tar.gz

echo "[bootstrap] Building lab-app Docker image…"
cp /mnt/lab/compose/Dockerfile .
docker build -t lab-app:latest -f Dockerfile .

echo "[bootstrap] Starting Docker Compose stack…"
cd /mnt/lab/compose
docker compose up -d

echo "[bootstrap] Done at $(date)"
echo "[bootstrap] Public IP: $(curl -s http://icanhazip.com || echo 'unknown')"
