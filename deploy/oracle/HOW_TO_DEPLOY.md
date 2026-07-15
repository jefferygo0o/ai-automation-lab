# ai-automation-lab — Oracle Cloud Manual Setup Guide

This guide assumes you've already created the** Networking and an A1.Flex VM** in the OCI console.

## What's already done for you

| Item | Status |
|---|---|
| VCN (`lab-vcn`), subnet, security list, internet gateway | Created by automation earlier this session |
| `lab-source.tar.gz` in Object Storage bucket `ai-automation-lab-backups` | ✅ Already there |
| SSH key at `deploy/oracle/lab-ssh-key` | Generated |
| `provision-user.sh` — per-user container script | Rendered |
| `backup.sh` — backup to Object Storage | Rendered |
| `Dockerfile` + `docker-compose.yml` | Rendered |
| **Cloud-init bootstrap script** (with tarball URL) | Rendered |

## Step 1: Launch the VM

In the OCI Console, create a VM instance with:

- **Name:** `lab-vm`
- **Compartment:** `ai-automation-lab`
- **Image:** Oracle Linux 9 (or Canonical Ubuntu 24.04)
- **Shape:** VM.Standard.A1.Flex (4 OCPU, 24 GB)
- **VCN:** `lab-vcn`
- **Subnet:** `lab-public-subnet-...` (the regional one, not AD-specific)
- **Boot volume:** 50 GB (free tier includes 200 GB total)
- **SSH key:** Paste the public key from `deploy/oracle/lab-ssh-key.pub`
- **Availability domain:** UK-LONDON-1-AD-3

Copy the **cloud-init script** from `deploy/oracle/scripts/user_data.sh` into the "Add initialisation script" → "Paste cloud-init script" field in the Advanced section.

## Step 2: SSH in

```bash
ssh -i deploy/oracle/lab-ssh-key opc@<PUBLIC_IP>
```

## Step 3: Build the Docker image (first time only, ~3 min)

```bash
cd /mnt/lab/app/backend
docker build -t lab-app:latest -f /mnt/lab/compose/Dockerfile /mnt/lab/app
```

## Step 4: Start Traefik

```bash
cd /mnt/lab/compose
docker compose up -d
```

## Step 5: Provision a user

```bash
export SUPABASE_DB_URL="postgresql://..."
export LAB_MASTER_KEY="your-secret-key"

sudo /mnt/lab/scripts/provision-user.sh alice "$SUPABASE_DB_URL" "$LAB_MASTER_KEY"
```

Your lab is now live at:

```
http://alice.<PUBLIC_IP>.nip.io
```

## Step 6: Add more users

```bash
sudo /mnt/lab/scripts/provision-user.sh bob "$SUPABASE_DB_URL" "$LAB_MASTER_KEY"
sudo /mnt/lab/scripts/provision-user.charlie "$SUPABASE_DB_URL" "$LAB_MASTER_KEY"
```

Each gets their own container at `{username}.<PUBLIC_IP>.nip.io`.

## Backups

```bash
sudo /mnt/lab/scripts/backup.sh
```
