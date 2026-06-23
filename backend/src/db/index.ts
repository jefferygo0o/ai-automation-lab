/**
 * Database initialisation — PostgreSQL.
 *
 * Uses `pg` (node-postgres) with a connection pool. Schema is loaded from
 * schema.pg.sql. Database URL comes from PG_URL env var or falls back to
 * SUPABASE_URL / DATABASE_URL.
 *
 * Top-level await blocks module resolution until the pool is ready and
 * schema is applied, so server.ts can keep its side-effect import pattern.
 */

import { db, pool, initSchema } from "./pg.ts";

await initSchema();

export { db, pool };
export default db;
