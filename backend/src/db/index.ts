/**
 * Database - PostgreSQL backend.
 * Imports from pg.ts wrapper (async, same SQLite-like API).
 */
import { db, initSchema } from "./pg.ts";
export { db, initSchema };
