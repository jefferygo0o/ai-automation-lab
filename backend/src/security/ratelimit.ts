/**
 * Per-user rate limiter (token bucket, in-memory).
 * Long-window counter is persisted hourly in DB to survive restarts.
 */

import { db } from "../db/index.ts";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  perMinute?: number;
  perHour?: number;
}

const DEFAULT: Required<RateLimitConfig> = { perMinute: 120, perHour: 5000 };

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  reason?: string;
}

export function rateLimit(key: string, limits: RateLimitConfig = {}): RateLimitResult {
  const cfg = { ...DEFAULT, ...limits };
  const now = Date.now();
  const minuteMs = 60_000;
  const b = buckets.get(key) ?? { tokens: cfg.perMinute, lastRefill: now };
  const elapsedMin = now - b.lastRefill;
  const refilled = Math.min(cfg.perMinute, b.tokens + (elapsedMin / minuteMs) * cfg.perMinute);
  b.tokens = refilled;
  b.lastRefill = now;

  if (b.tokens < 1) {
    buckets.set(key, b);
    return {
      allowed: false,
      retryAfterMs: Math.ceil((1 - b.tokens) * (minuteMs / cfg.perMinute)),
      reason: "per-minute rate limit",
    };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { allowed: true, retryAfterMs: 0 };
}

export function incrementHourly(userId: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const hour = new Date().getUTCHours();
  db.prepare(
    `INSERT INTO rate_counters (user_id, day, hour, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day, hour) DO UPDATE SET count = count + 1`
  ).run(userId, day, hour);
  const r = db.prepare(
    `SELECT count FROM rate_counters WHERE user_id = ? AND day = ? AND hour = ?`
  ).get(userId, day, hour) as { count: number } | undefined;
  return r?.count ?? 0;
}