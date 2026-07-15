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
