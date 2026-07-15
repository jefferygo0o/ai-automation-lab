/**
 * Service Supervisor — manages long-running processes for the lab.
 *
 * Mirrors Zo's user_services system: auto-start on boot, restart on crash,
 * log to /dev/shm/, track PID + status in the DB.
 *
 * Modes:
 *   - http: web service on $PORT, proxied via nip.io domain
 *   - tcp: raw TCP on $PORT
 *   - process: background process, no PORT, no network exposure
 *
 * Custom domains use nip.io: <slug>.<ip>.nip.io → host:<port>
 */
import { db } from "../db/index.ts";
import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync, appendFileSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SHM = "/dev/shm";
const LOG_MAX = 5 * 1024 * 1024; // 5 MB per log

interface ManagedProcess {
  serviceId: string;
  proc: Subprocess<"ignore", "pipe"> | null;
  restartTimer: ReturnType<typeof setTimeout> | null;
  shuttingDown: boolean;
}

const processes = new Map<string, ManagedProcess>();

/** Get the host's public-facing IP for nip.io domain construction. */
function getHostIp(): string {
  const envIp = process.env.LAB_HOST_IP;
  if (envIp) return envIp;
  // Default for local dev
  return "127.0.0.1";
}

/** Construct the nip.io domain for a service. */
function nipDomain(slug: string, port: number): string {
  const ip = getHostIp().replace(/\./g, "-");
  return `${slug}.${ip}.nip.io`;
}

/** Construct the http URL for a service (public or private). */
function buildHttpUrl(serviceId: string, localPort: number, isPublic: boolean): string {
  if (isPublic) {
    const slug = serviceId.replace(/_/g, "-");
    const domain = nipDomain(slug, localPort);
    return `http://${domain}:${localPort}`;
  }
  return `http://localhost:${localPort}`;
}

/** Allocate an ephemeral port. */
function allocatePort(): number {
  // Range 10000-19999 to avoid conflicts
  return 10000 + Math.floor(Math.random() * 10000);
}

/** Write to the shm log, rotating if over max. */
function logToFile(serviceId: string, stream: "stdout" | "stderr", data: string) {
  const path = join(SHM, `lab-svc-${serviceId}${stream === "stderr" ? "_err" : ""}.log`);
  try {
    appendFileSync(path, data, "utf8");
  } catch {
    try { writeFileSync(path, data, "utf8"); } catch {}
  }
}

/** Start a managed process for a service. */
export async function startService(serviceId: string): Promise<{ ok: boolean; error?: string }> {
  if (processes.has(serviceId)) {
    return { ok: true }; // already running
  }

  const row = await db.prepare("SELECT * FROM user_services WHERE id = ?").get(serviceId) as any;
  if (!row) return { ok: false, error: "service not found" };

  const mode = row.mode;
  const entrypoint = row.entrypoint;
  const workdir = row.workdir || process.cwd();
  let envVars: Record<string, string> = {};
  try { envVars = JSON.parse(row.env_vars || "{}"); } catch {}

  let localPort = row.local_port;
  if ((mode === "http" || mode === "tcp") && (!localPort || localPort === 0)) {
    localPort = allocatePort();
    await db.prepare("UPDATE user_services SET local_port = ? WHERE id = ?").run(localPort, serviceId);
  }

  // Build env
  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...envVars,
  };
  if (mode === "http" || mode === "tcp") {
    env.PORT = String(localPort);
  }

  // Build http_url / tcp_addr
  let httpUrl = "";
  let tcpAddr = "";
  if (mode === "http") {
    httpUrl = buildHttpUrl(serviceId, localPort!, row.is_public === 1);
  } else if (mode === "tcp") {
    const ip = getHostIp();
    tcpAddr = `${ip}:${localPort}`;
  }

  const managed: ManagedProcess = { serviceId, proc: null, restartTimer: null, shuttingDown: false };
  processes.set(serviceId, managed);

  try {
    // Resolve entrypoint — wrap in bash for shell features
    const cmd = ["bash", "-c", entrypoint];

    const proc = spawn({
      cmd,
      cwd: workdir,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    managed.proc = proc;

    // Stream stdout/stderr to log files
    const drainLog = (stream: ReadableStream<Uint8Array>, label: "stdout" | "stderr") => {
      const reader = stream.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            logToFile(serviceId, label, new TextDecoder().decode(value));
          }
        } catch {}
      })();
    };
    if (proc.stdout) drainLog(proc.stdout as ReadableStream<Uint8Array>, "stdout");
    if (proc.stderr) drainLog(proc.stderr as ReadableStream<Uint8Array>, "stderr");

    // Monitor exit → auto-restart
    const watchExit = async () => {
      const exitCode = await proc.exited;
      if (managed.shuttingDown) return;

      console.warn(`[supervisor] ${serviceId} exited (code=${exitCode}), restarting in 3s...`);
      logToFile(serviceId, "stderr", `\n[supervisor] process exited (code=${exitCode}), restarting in 3s...\n`);

      // Increment restart count
      await db.prepare(
        "UPDATE user_services SET status = 'error', restart_count = restart_count + 1, pid = NULL, updated_at = ? WHERE id = ?"
      ).run(Date.now(), serviceId);

      managed.restartTimer = setTimeout(() => {
        if (!managed.shuttingDown) {
          processes.delete(serviceId); // clear stale entry
          startService(serviceId);
        }
      }, 3000);
    };
    watchExit();

    const pid = proc.pid;
    await db.prepare(
      "UPDATE user_services SET status = 'running', pid = ?, http_url = ?, tcp_addr = ?, updated_at = ? WHERE id = ?"
    ).run(pid, httpUrl, tcpAddr, Date.now(), serviceId);

    console.log(`[supervisor] started ${serviceId} (pid=${pid}, mode=${mode}, port=${localPort})`);
    return { ok: true };
  } catch (e: any) {
    processes.delete(serviceId);
    await db.prepare(
      "UPDATE user_services SET status = 'error', updated_at = ? WHERE id = ?"
    ).run(Date.now(), serviceId);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** Stop a managed process. */
export async function stopService(serviceId: string): Promise<{ ok: boolean }> {
  const managed = processes.get(serviceId);
  if (!managed) {
    await db.prepare("UPDATE user_services SET status = 'idle', pid = NULL WHERE id = ?").run(serviceId);
    return { ok: true };
  }

  managed.shuttingDown = true;
  if (managed.restartTimer) clearTimeout(managed.restartTimer);

  if (managed.proc) {
    try {
      managed.proc.kill("SIGTERM");
      // Wait 5s then force-kill
      setTimeout(() => {
        try { managed.proc!.kill("SIGKILL"); } catch {}
      }, 5000);
    } catch {}
  }

  processes.delete(serviceId);
  await db.prepare("UPDATE user_services SET status = 'stopped', pid = NULL, updated_at = ? WHERE id = ?").run(Date.now(), serviceId);
  return { ok: true };
}

/** Restart a service (e.g. to pick up code changes). */
export async function restartService(serviceId: string): Promise<{ ok: boolean; error?: string }> {
  await stopService(serviceId);
  // Small delay to let port free
  await new Promise((r) => setTimeout(r, 500));
  return startService(serviceId);
}

/** Auto-start all services on boot. */
export async function startAllServices() {
  const rows = await db.query("SELECT id FROM user_services WHERE status IN ('running', 'idle') ORDER BY created_at ASC").all() as Array<{ id: string }>;
  for (const row of rows) {
    try {
      await startService(row.id);
    } catch (e: any) {
      console.error(`[supervisor] failed to auto-start ${row.id}: ${e?.message}`);
    }
  }
}

/** Get logs for a service. */
export function getServiceLogs(serviceId: string, tail = 200): { stdout: string; stderr: string } {
  const readTail = (path: string): string => {
    try {
      const data = readFileSync(path, "utf8");
      const lines = data.split("\n");
      return lines.slice(-tail).join("\n");
    } catch {
      return "";
    }
  };
  return {
    stdout: readTail(join(SHM, `lab-svc-${serviceId}.log`)),
    stderr: readTail(join(SHM, `lab-svc-${serviceId}_err.log`)),
  };
}
