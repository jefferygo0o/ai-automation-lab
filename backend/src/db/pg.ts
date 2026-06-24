import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url =
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    "";
  if (!url) {
    console.error(
      "[db] FATAL: no Postgres connection string configured. Set SUPABASE_DB_URL (Supabase transaction-mode pooler, port 6543) in the environment, then restart."
    );
    throw new Error("SUPABASE_DB_URL is not set");
  }
  _pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: url.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  });
  _pool.on("error", (err) => {
    console.error("[db] idle client error:", err?.message ?? err);
  });
  return _pool;
}

function convertParams(sql: string, params?: any[]): [string, any[]] {
  if (!params || params.length === 0) return [sql, params || []];
  let idx = 0;
  const converted = sql.replace(/\?/g, () => `$${++idx}`);
  return [converted, params];
}

function convertInsertOrReplace(sql: string): string {
  const rm = sql.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (rm) {
    const cols = rm[2].split(",").map(c => c.trim().replace(/["`]/g, ""));
    const assigns = cols.map(c => `${c} = EXCLUDED.${c}`).join(", ");
    return `${sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, "INSERT INTO")} ON CONFLICT DO UPDATE SET ${assigns}`;
  }
  const im = sql.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (im) {
    return `${sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO")} ON CONFLICT DO NOTHING`;
  }
  return sql.replace(/INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO/gi, "INSERT INTO");
}

class PGStatement<T = any> {
  private pool: Pool;
  private sql: string;
  constructor(pool: Pool, sql: string) {
    this.sql = convertInsertOrReplace(sql);
    this.pool = pool;
  }
  all(...params: any[]): Promise<T[]> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => r.rows as T[]);
  }
  get(...params: any[]): Promise<T | null> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => (r.rows[0] ?? null) as T | null);
  }
  run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => ({ changes: r.rowCount ?? 0, lastInsertRowid: 0 }));
  }
}

class PgDbShim {
  query<T = any>(sql: string): PGStatement<T> { return new PGStatement<T>(getPool(), sql); }
  prepare<T = any>(sql: string): PGStatement<T> { return new PGStatement<T>(getPool(), sql); }
  exec(sql: string): Promise<{ changes: number }> {
    return getPool().query(sql).then(r => ({ changes: r.rowCount ?? 0 }));
  }
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await getPool().connect();
    try { await client.query("BEGIN"); const r = await fn(); await client.query("COMMIT"); return r; }
    catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  close(): Promise<void> { return _pool ? _pool.end() : Promise.resolve(); }
}

export const db = new PgDbShim();

export async function initSchema(): Promise<void> {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const p = join(dir, "schema.pg.sql");
  try {
    // pgcrypto is required for gen_random_uuid() on Supabase.
    await db.exec("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    console.log("[db] pgcrypto extension ensured");
  } catch (e: any) {
    console.error("[db] pgcrypto extension ensure failed:", e?.message ?? e);
  }
  try {
    await db.exec(readFileSync(p, "utf8"));
    console.log("[db] schema applied from", p);
  } catch (e: any) {
    console.error("[db] schema apply failed:", e?.message ?? e, "(path:", p, ")");
  }
}
