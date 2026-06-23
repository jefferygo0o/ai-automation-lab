import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const DEFAULT_URL = "postgresql://postgres:postgres@localhost:5432/lab";

function buildPool(): Pool {
  const url = process.env.POSTGRES_URL || process.env.SUPABASE_URL || DEFAULT_URL;
  return new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 30000 });
}

export const pool = buildPool();

function convertParams(sql: string, params?: any[]): [string, any[]] {
  if (!params || params.length === 0) return [sql, params || []];
  let idx = 0;
  const converted = sql.replace(/\?/g, () => `$${++idx}`);
  return [converted, params];
}

function convertInsertOrReplace(sql: string): string {
  return sql.replace(/INSERT\s+OR\s+REPLACE\s+INTO/gi, "INSERT INTO");
}

class PGStatement<T = any> {
  private pool: Pool;
  private sql: string;
  constructor(pool: Pool, sql: string) {
    this.pool = pool;
    this.sql = convertInsertOrReplace(sql);
  }
  all(params?: any[]): Promise<T[]> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => r.rows as T[]);
  }
  get(params?: any[]): Promise<T | null> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => (r.rows[0] ?? null) as T | null);
  }
  run(params?: any[]): Promise<{ changes: number; lastInsertRowid: number }> {
    const [sql, p] = convertParams(this.sql, params);
    return this.pool.query(sql, p).then(r => ({
      changes: r.rowCount ?? 0,
      lastInsertRowid: 0,
    }));
  }
}

class PgDbShim {
  private pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  exec(sql: string): Promise<{ changes: number }> {
    return this.pool.query(sql).then(r => ({ changes: r.rowCount ?? 0 }));
  }

  prepare<T = any>(sql: string): PGStatement<T> {
    return new PGStatement<T>(this.pool, sql);
  }

  query<T = any>(sql: string): PGStatement<T> {
    return new PGStatement<T>(this.pool, sql);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn();
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  close(): Promise<void> { return this.pool.end(); }
}

export const db = new PgDbShim(pool);

export async function initSchema(): Promise<void> {
  const candidates = [
    join(resolve(import.meta.dir || "."), "schema.pg.sql"),
  ];
  for (const p of candidates) {
    try {
      const schema = readFileSync(p, "utf8");
      await db.exec(schema);
      console.log("[db] schema applied from", p);
      return;
    } catch {}
  }
  console.warn("[db] No schema.pg.sql found");
}
