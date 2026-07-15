import { db } from "../db/index.ts";

const DEFAULT_TIMEZONE = "UTC";

export async function getUserTimezone(userId: string): Promise<string> {
  const row = await db.prepare("SELECT timezone FROM users WHERE id = ?").get(userId) as { timezone?: string } | undefined;
  return row?.timezone || DEFAULT_TIMEZONE;
}

export async function setUserTimezone(userId: string, timezone: string): Promise<string> {
  let valid = DEFAULT_TIMEZONE;
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
    valid = timezone;
  } catch {
    throw new Error("invalid IANA timezone");
  }
  await db.prepare("UPDATE users SET timezone = ? WHERE id = ?").run(valid, userId);
  return valid;
}
