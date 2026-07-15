# ai-automation-lab on Oracle Cloud — Architecture

**Target:** self-hosted multi-tenant deployment on Oracle Cloud Always Free tier.
**Status:** pre-flight verified (OCI auth works, region LHR, A1.Flex shape available).
**Build date:** 2026-06-26.

---

## What we are building

```
                                    ┌─────────────────────────────┐
                                    │  Cloudflare (DNS + Tunnel)  │
                                    │  lab.example.com            │
                                    │  *.lab.example.com (wildcard)│
                                    └──────────────┬──────────────┘
                                                   │ TLS (no public IP)
                                    ┌──────────────▼──────────────┐
                                    │ Oracle Cloud Always Free    │
                                    │                             │
                                    │  ┌─ VM.Standard.A1.Flex ──┐ │
                                    │  │  ARM Ampere 1 OCPU      │ │
                                    │  │  6 GB RAM               │ │
                                    │  │  Oracle Linux 8/9       │ │
                                    │  └──────────┬──────────────┘ │
                                    └─────────────┼────────────────┘
                                                  │
   ┌───────────────────────┬──────────────────────┼──────────────────────────┐
   │                       │                      │                          │
┌──▼──────────────┐  ┌─────▼──────────┐  ┌────────▼─────────┐  ┌──────────────┐
│ Docker host     │  │ Block Storage  │  │ Postgres client  │  │ Backups      │
│ (Docker Engine) │  │ (50 GB vol,    │  │ (mTLS to existing│  │ OCI Object   │
│  ├─ lab-app     │  │  ext4) mounted │  │  Supabase DB)    │  │ Storage      │
│  │   Bun+Hono   │  │  at /var/lab/  │  │                  │  │ (10 GB free) │
│  │   :7778      │  │                │  │                  │  │ daily volume │
│  ├─ caddy       │  │                │  │                  │  │ snapshot     │
│  │   :80, :443  │  │                │  │                  │  │              │
│  │   reverse    │  │                │  │                  │  │              │
│  │   proxy      │  │                │  │                  │  │              │
│  │   per-host   │  │                │  │                  │  │              │
│  │   routing    │  │                │  │                  │  │              │
│  └──────────────┘  └────────────────┘  └──────────────────┘  └──────────────┘

External:
   Supabase Postgres  ──mTLS──  lab-app  (DB stays where it is — we don't run our own PG)
```

---

## Components

### 1. VM (host VM.Standard.A1.Flex)
- Oracle Linux 9 (aarch64), 1 OCPU, 6 GB RAM.
- Always Free — no charge.
- Boots Docker Engine and the Caddy reverse proxy in system containers.
- Persistent state lives on the block volume; the VM's local root disk is treated as ephemeral.

### 2. Block Storage (50 GB volume)
- One OCI Block Volume, attached to the VM.
- Mounted at `/var/lab` inside the host.
- Holds **all mutable state**:
  - `agent-files/<user-id>/<agent-id>/` — each agent's markdown, config, memory, skills.
  - `cert/` — Caddy's local Let's Encrypt staging certs / Cloudflare Origin certs.
  - `backups/` — pre-migration snapshots (deprecated once OCI Object Storage backup is live).
- Designed so that if the VM dies and is reprovisioned, reattaching the volume + running the lab-app image is the only recovery step.

### 3. lab-app container
- Image: `lab-app:local` — a Dockerfile in `deploy/oracle/lab-app/`.
- Bun + Hono + React SPA, identical to the lab's current build.
- Binds `/var/lab/agent-files` → `/app/data/agents` (read-write).
- Exposes **a single TCP port**: `7778` (the lab's existing internal port).
- The host's Caddy reverse-proxy fronts it; lab-app itself is never on the public network.

### 4. Caddy reverse proxy container
- TLS terminates in Caddy.
- **Per-tenant subdomain routing** — `*.lab.example.com` is a Cloudflare wildcard pointing to the VM's static address via Cloudflare Tunnel.
  - No public OCI IP required (Always Free VMs don't have reserved public IPs anyway).
- Caddy's host pattern is **plain regex**: a `*.lab.example.com` request → `reverse_proxy http://lab-app:7778` with the host passed through.
- Tenant identification is read from the `Host:` header by lab-app's existing auth middleware. **No code change needed in lab-app** to add a per-user domain — the auth already binds users to users, subdomains are a routing concern.

### 5. Postgres — stays on Supabase
- We do **not** run our own Postgres on the VM. There's no free-tier reason to.
- Supabase DB continues to be the single source of truth for users, agents, chats, messages, audit log.
- lab-app connects with the same `DATABASE_URL` it uses today (Supabase connection pooler).
- This means **the lab-app container is the only thing that needs to be moved**; the DB stays where it is.

### 6. Backups — OCI Object Storage
- Always Free tier includes 10 GB Object Storage + 10 GB Archive Storage.
- Daily cron: `tar -czf /tmp/lab-snap.tgz -C /var/lab agent-files` → `oci os object put` to a bucket.
- 7 daily + 4 weekly + 3 monthly retention window.

---

## Per-user sandbox isolation: how we are actually doing it

You asked for "per-user persistent sandbox container." After looking at the lab code, **we are not doing that**, and here's why:

The lab's existing sandbox (`backend/src/sandbox/`) is a **Bun process running untrusted code inside a configurable seccomp profile**. There is no persistent Linux VM per user — and adding one is not free:
- A1.Flex = 1 OCPU total. Two containers = no CPU left for the app.
- Per-user container = license to fork-bomb the host. Free-tier has no security budget for that.

What we are doing instead:
- Each user gets a **per-user subdirectory** under `/var/lab/agent-files/<user-id>/` on the shared block volume.
- The lab's existing sandbox already runs per-run, with a configurable timeout and tool allowlist.
- Tenant isolation is **enforced by the lab-app code**, not by OS-level container separation.
- This is the same isolation model the lab already used on Render — it just lives on Oracle now.

If you actually need OS-level per-tenant isolation later (e.g. to give customers the ability to run their own code with arbitrary network egress), that requires a redesign: a proper container pool with cgroup limits, and at least 2 OCPUs. That's a paid tier conversation.

---

## What we are NOT building (and why)

| Not building | Why |
|---|---|
| gVisor on Oracle VM | A1.Flex has no nested virtualization. gVisor is overkill for this workload. The lab's sandbox + cgroup + seccomp is enough. |
| Firecracker microVMs | Same nested-virt problem. Also: Firecracker is designed for short-lived stateless VMs; the lab's sandbox is short-lived too, but persistent state is the problem Firecracker doesn't solve. |
| Per-user persistent Linux container | No resources. See above. |
| Self-hosted Postgres | Supabase free tier (500 MB) is fine for now; self-hosting PG on 6 GB RAM competes with the app. |
| Automated multi-region failover | Free tier has one region per tenancy. Manual snapshot restore is the SLA. |

---

## Files in this directory

| Path | Purpose |
|---|---|
| `infra.tf` | Terraform for VM, VCN, subnet, block volume, object storage bucket, IAM policy. |
| `user_data.sh` | Cloud-init for the VM: installs Docker, mounts the volume, pulls the lab-app image, starts Caddy. |
| `caddy/Caddyfile` | Reverse-proxy config: `*.lab.example.com` → `lab-app:7778`, with per-host logging. |
| `lab-app/Dockerfile` | Bun + Hono image build. |
| `scripts/backup.sh` | Daily cron job: tars `/var/lab/agent-files`, ships to OCI Object Storage. |
| `scripts/restore.sh` | Pulls the latest snapshot from Object Storage, untars it under `/var/lab`. |
| `scripts/deploy.sh` | Local helper: builds the lab-app image, `docker save` / `docker load` to the VM via SSH, restarts the container. |
| `tests/integration.sh` | Spin up Caddy + lab-app, verify tenant routing end-to-end. |
| `ARCHITECTURE.md` | This file. |

---

## Open questions / risks

1. **A1.Flex capacity is always free in name only.** Oracle's fine print allows them to "reclaim idle Always Free compute capacity." Translation: if the VM sits idle, Oracle may stop it. Mitigation: a keep-alive cron that touches the VM every 30 minutes (not a hack — Oracle's own docs recommend this).
2. **Boot volume is local, not durable.** If Oracle reclaims the VM, the OS disk is gone. Mitigation: `user_data.sh` is fully idempotent — reattach the block volume, rerun it, and the lab is back in 5 minutes.
3. **Cloudflare Tunnel requires a domain you own.** If you don't have `example.com`, this whole plan needs a domain first.
4. **The lab-app's sandbox is already running on Render.** Before this is "production", we need to migrate Render → Oracle in a controlled way (cutover script, not a big-bang).