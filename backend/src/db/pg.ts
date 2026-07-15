import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  let url = process.env.SUPABASE_DB_URL;
  let envSource = "SUPABASE_DB_URL";
  if (!url) { url = process.env.POSTGRES_URL; envSource = "POSTGRES_URL"; }
  if (!url) { url = process.env.DATABASE_URL; envSource = "DATABASE_URL"; }
  if (!url) {
    console.error(
      "[db] FATAL: no Postgres connection string configured. Set SUPABASE_DB_URL (Supabase transaction-mode pooler, port 6543) or DATABASE_URL (Render Postgres) in the environment, then restart."
    );
    throw new Error("SUPABASE_DB_URL is not set");
  }

  // Mask password in logged URL for security
  const masked = url.replace(/\/\/[^:]+:[^@]+@/, "//****:****@");
  const isLocal = url.includes("localhost") || url.includes("127.0.0.1") || url.includes("::1");

  console.log(`[db] connecting via ${envSource}: ${masked} (ssl=${!isLocal})`);

  _pool = new Pool({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    keepAlive: true,
  });
  _pool.on("error", (err) => {
    console.error("[db] idle client error:", err?.message ?? err);
  });

  // Probe connection immediately so failures surface at startup
  _pool.query("SELECT 1").then(() => {
    console.log("[db] connection verified OK");
  }).catch((err) => {
    console.error("[db] *** INITIAL CONNECTION PROBE FAILED ***");
    console.error(`[db] ${envSource} refused. Possible causes:`);
    console.error(`[db]   1. Supabase project is PAUSED (free tier pauses after 1 wk)`);
    console.error(`[db]   2. SUPABASE_DB_URL uses wrong hostname — see DEPLOY_RENDER.md`);
    console.error(`[db]   3. Special chars in password need URL encoding`);
    console.error("[db] error:", err?.message ?? err);
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
    const firstCol = cols[0];
    const assigns = cols.map(c => `${c} = EXCLUDED.${c}`).join(", ");
    return `${sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/i, "INSERT INTO")} ON CONFLICT (${firstCol}) DO UPDATE SET ${assigns}`;
  }
  const im = sql.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)/i);
  if (im) {
    const cols = im[2].split(",").map(c => c.trim().replace(/["`]/g, ""));
    const firstCol = cols[0];
    return `${sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/i, "INSERT INTO")} ON CONFLICT (${firstCol}) DO NOTHING`;
  }
  return sql.replace(/INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO/gi, "INSERT INTO");
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inDollarQuote = false;
  let dollarQuoteMarker = "";
  let i = 0;
  while (i < sql.length) {
    const char = sql[i];
    if (inSingleQuote) {
      if (char === "'") {
        if (sql[i + 1] === "'") {
          current += "'";
          i += 2;
          continue;
        } else {
          inSingleQuote = false;
          current += "'";
        }
      } else {
        current += char;
      }
    } else if (inDoubleQuote) {
      if (char === '"') {
        if (sql[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inDoubleQuote = false;
          current += '"';
        }
      } else {
        current += char;
      }
    } else if (inDollarQuote) {
      if (char === "$" && sql.slice(i, i + dollarQuoteMarker.length) === dollarQuoteMarker) {
        inDollarQuote = false;
        current += dollarQuoteMarker;
        i += dollarQuoteMarker.length;
        dollarQuoteMarker = "";
        continue;
      } else {
        current += char;
      }
    } else {
      if (char === "'") {
        inSingleQuote = true;
        current += "'";
      } else if (char === '"') {
        inDoubleQuote = true;
        current += '"';
      } else if (char === "$") {
        const marker = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
        if (marker) {
          dollarQuoteMarker = marker;
          inDollarQuote = true;
          current += marker;
          i += marker.length;
          continue;
        } else {
          current += char;
        }
      } else if (char === ";") {
        statements.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    i++;
  }
  if (current) {
    statements.push(current);
  }
  return statements;
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
    const statements = splitSqlStatements(sql);
    let totalChanges = 0;
    const runNext = async (): Promise<{ changes: number }> => {
      for (const stmt of statements) {
        if (!stmt.trim()) continue;
        const r = await getPool().query(stmt);
        totalChanges += r.rowCount ?? 0;
      }
      return { changes: totalChanges };
    };
    return runNext();
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
    const migrationsDir = join(dir, "migrations");
    const migrations = readdirSync(migrationsDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".sql")).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      await db.exec(readFileSync(join(migrationsDir, migration), "utf8"));
      console.log("[db] migration applied:", migration);
    }
    console.log("[db] schema applied from", p);
  } catch (e: any) {
    console.error("[db] schema apply failed:", e?.message ?? e, "(path:", p, ")");
  }
}
