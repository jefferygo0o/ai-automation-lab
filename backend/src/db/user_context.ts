/**
 * User-scoped DB context via AsyncLocalStorage.
 *
 * When an authenticated request arrives, the auth middleware:
 *   1. Acquires a dedicated PG client from the pool
 *   2. Begins a transaction
 *   3. Sets  SET LOCAL role = 'authenticated'
 *   4. Sets  SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'
 *   5. Stores the client here via `runUserContext()`
 *
 * Every `db.prepare()` / `db.query()` / `db.exec()` call inside the request
 * automatically routes through this client (see pg.ts PGStatement.q()).
 * After the request completes the transaction is committed and the client released.
 *
 * Background tasks (scheduler, delivery) have no user context and continue
 * using the service-role pool — RLS does not apply to them.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";

interface UserContext {
  client: PoolClient;
}

const store = new AsyncLocalStorage<UserContext>();

/**
 * Return the per-request PG client, or null when running outside a request
 * (scheduler, boot, background delivery, etc.).
 */
export function getRequestClient(): PoolClient | null {
  return store.getStore()?.client ?? null;
}

/**
 * Run `fn` inside a user-scoped AsyncLocalStorage context.
 * The caller is responsible for BEGIN / COMMIT / ROLLBACK and client.release().
 */
export function runUserContext<T>(client: PoolClient, fn: () => Promise<T>): Promise<T> {
  return store.run({ client }, fn);
}
