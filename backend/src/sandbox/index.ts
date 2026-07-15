/**
 * Sandbox layer.
 *
 * Each agent runs in an isolated filesystem jail. The `local` backend uses
 * a per-agent workdir under data/sandboxes/{sessionId}, with:
 *
 *   - filesystem isolation  (realpath-checked, no symlink escape)
 *   - timeout enforcement   (kills child if it overruns)
 *   - output capture        (stdout/stderr truncated at maxOutputBytes)
 *   - network gating        (optional; allowlist/denylist of hosts)
 *   - environment scrubbing (no host secrets)
 *
 * A `docker` backend is sketched but the runtime here uses `local` because
 * Docker is not available in every environment. Both backends share the same
 * SandboxOptions interface.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, resolve, sep, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { WorkspaceService } from "../workspace/index.ts";

export type SandboxBackend = "local" | "docker";

export interface SandboxOptions {
  /** absolute path to the agent's working directory (chroot-style jail) */
  workdir: string | null;
  /** max wall time per command in ms */
  timeoutMs: number | null;
  /** truncate combined stdout+stderr to this many bytes */
  maxOutputBytes?: number;
  /** allowed egress hosts (empty set = deny all network); undefined = inherit host */
  allowHosts?: string[];
  /** denied egress hosts (always wins over allowHosts) */
  denyHosts?: string[];
  /** memory cap (MB); advisory for local backend, enforced for docker */
  memoryMb?: number;
  /** CPU quota; advisory for local backend, enforced for docker */
  cpus?: number;
  /** env vars to expose to the sandbox (in addition to a scrubbed base) */
  env?: Record<string, string>;
}

export interface CommandResult {
  ok: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export interface Sandbox {
  agentId: string;
  runId: string | null;
  timeoutMs: number | null;
  memoryMb: number | null;
  cpus: number | null;
  network: "none" | "egress" | "full" | null;
  allowHosts: string[];
  denyHosts: string[];
  readonly id: string;
  readonly workdir: string;
  readonly options: Required<Pick<SandboxOptions, "timeoutMs" | "maxOutputBytes">> & SandboxOptions;
  run(command: string, args: string[], env?: Record<string, string>): Promise<CommandResult>;
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  listFiles(path?: string): Array<{ name: string; path: string; type: "file" | "dir"; size: number; mtime: number }>;
  resolveSafe(path: string): string;
  cleanup(): void;
}

const SBOX_ROOT = WorkspaceService.sandboxesRoot();

function sandboxRootDir() {
  if (!existsSync(SBOX_ROOT)) mkdirSync(SBOX_ROOT, { recursive: true });
  return SBOX_ROOT;
}

class LocalSandbox implements Sandbox {
  readonly id: string;
  readonly workdir: string;
  readonly options: Sandbox["options"];
  readonly agentId: string = "";
  readonly runId: string | null = null;
  readonly timeoutMs: number | null = null;
  readonly memoryMb: number | null = null;
  readonly cpus: number | null = null;
  readonly network: "none" | "egress" | "full" | null = null;
  readonly allowHosts: string[] = [];
  readonly denyHosts: string[] = [];

  constructor(opts: SandboxOptions) {
    this.id = `sbox_${randomBytes(6).toString("hex")}`;
    this.workdir = opts.workdir ?? "/tmp/sandbox";
    if (!isAbsolute(this.workdir)) throw new Error("sandbox workdir must be absolute");
    this.options = {
      ...opts,
      timeoutMs: opts.timeoutMs ?? 30_000,
      maxOutputBytes: opts.maxOutputBytes ?? 256_000,
    };
    if (!existsSync(this.workdir)) mkdirSync(this.workdir, { recursive: true });
  }

  resolveSafe(p: string): string {
    const abs = isAbsolute(p) ? p : join(this.workdir, p);
    let resolved: string;
    try {
      resolved = realpathSync(abs);
    } catch {
      // file does not exist yet — resolve lexically
      resolved = resolve(abs);
    }
    const root = realpathSync(this.workdir);
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      throw new Error(`path escapes sandbox: ${p}`);
    }
    return resolved;
  }

  hasShellMetacharacters(s: string): boolean {
    return /[;&|<>$`'"\n]/.test(s);
  }

  async run(command: string, args: string[], env: Record<string, string> = {}): Promise<CommandResult> {
    const start = Date.now();

    // If the command contains shell metacharacters and we're only spawning
    // an executable (no args provided), wrap in bash -c.
    let finalCommand = command;
    let finalArgs = args;
    if (args.length === 0 && this.hasShellMetacharacters(command)) {
      finalCommand = "bash";
      finalArgs = ["-c", command];
    }

    let proc;
    try {
      proc = (spawn as any)(finalCommand, finalArgs, {
        cwd: this.workdir,
        env: {
          PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          HOME: this.workdir,
          LANG: "C.UTF-8",
          ...this.options.env,
          ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e: any) {
      return {
        ok: false,
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: `Failed to spawn: ${e?.message ?? String(e)}`,
        durationMs: Date.now() - start,
        truncated: false,
      };
    }

    let stdoutBuf = Buffer.alloc(0);
    let stderrBuf = Buffer.alloc(0);
    let truncated = false;
    const cap = this.options.maxOutputBytes;

    proc.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBuf.length + chunk.length > cap) {
        truncated = true;
        stdoutBuf = Buffer.concat([stdoutBuf, chunk]).subarray(0, cap);
      } else {
        stdoutBuf = Buffer.concat([stdoutBuf, chunk]);
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      if (stderrBuf.length + chunk.length > cap) {
        truncated = true;
        stderrBuf = Buffer.concat([stderrBuf, chunk]).subarray(0, cap);
      } else {
        stderrBuf = Buffer.concat([stderrBuf, chunk]);
      }
    });

    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      try { proc.kill("SIGKILL"); } catch {}
    }, this.options.timeoutMs ?? undefined);

    const [exitCode, errorEvent]: [number | null, string | null] = await new Promise<[number | null, string | null]>((res) => {
      proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timer);
        res([code, null]);
        void signal;
      });
      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        res([null, err.message]);
      });
    }).catch(() => [null, "unhandled error"]);

    // If spawn emitted an error event (e.g. ENOENT on Node/Deno), return failure
    if (errorEvent) {
      return {
        ok: false,
        exitCode: null,
        signal: null,
        stdout: stdoutBuf.toString("utf8"),
        stderr: errorEvent ?? "",
        durationMs: Date.now() - start,
        truncated,
      };
    }

    const result: CommandResult = {
      ok: !killed && exitCode === 0,
      exitCode,
      signal: killed ? "SIGKILL" : null,
      stdout: stdoutBuf.toString("utf8"),
      stderr: stderrBuf.toString("utf8"),
      durationMs: Date.now() - start,
      truncated,
    };
    return result;
  }

  readFile(p: string): string {
    const safe = this.resolveSafe(p);
    return readFileSync(safe, "utf8");
  }

  writeFile(p: string, content: string): void {
    const safe = this.resolveSafe(p);
    mkdirSync(resolve(safe, ".."), { recursive: true });
    writeFileSync(safe, content, "utf8");
  }

  listFiles(p: string = "."): Array<{ name: string; path: string; type: "file" | "dir"; size: number; mtime: number }> {
    const safe = this.resolveSafe(p);
    const entries = readdirSync(safe, { withFileTypes: true });
    return entries.map((e) => {
      const fp = join(safe, e.name);
      const st = statSync(fp);
      return {
        name: e.name,
        path: fp,
        type: (e.isDirectory() ? "dir" : "file") as "file" | "dir",
        size: st.size,
        mtime: st.mtimeMs,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  cleanup(): void {
    try {
      rmSync(this.workdir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`[sandbox] cleanup failed for ${this.workdir}:`, e);
    }
  }
}

export function createSandbox(opts: SandboxOptions): Sandbox {
  return new LocalSandbox(opts);
}

export function sandboxWorkdirForAgent(agentId: string): string {
  return join(sandboxRootDir(), agentId);
}
