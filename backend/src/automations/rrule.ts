export const VALID_FREQUENCIES = ["MINUTELY", "HOURLY", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = typeof VALID_FREQUENCIES[number];

export interface RRuleSpec {
  freq: Frequency;
  interval: number;
  byHour?: number[];
  byMinute?: number[];
  byDay?: string[];
  byMonth?: number[];
  byMonthDay?: number[];
  count?: number;
}

const ALLOWED_KEYS = new Set([
  "FREQ", "INTERVAL", "BYHOUR", "BYMINUTE", "BYDAY", "BYMONTH", "BYMONTHDAY", "COUNT",
]);
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseIntegers(value: string, key: string, min: number, max: number): number[] {
  const result = value.split(",").map((part) => Number(part));
  if (!result.length || result.some((value) => !Number.isInteger(value) || value < min || value > max)) {
    throw new Error(`${key} contains an invalid value`);
  }
  return [...new Set(result)].sort((a, b) => a - b);
}

export function parseRRule(input: string): RRuleSpec {
  if (typeof input !== "string" || !input.trim()) throw new Error("rrule is required");
  if (/\b(?:DTSTART|TZID)\s*=/i.test(input)) throw new Error("rrule must be bare and must not include DTSTART or TZID");
  if (/^\s*(?:CRON|FREQ=ONCE)\b/i.test(input)) throw new Error("use RFC 5545 syntax; cron and FREQ=ONCE are not supported");

  const values = new Map<string, string>();
  for (const component of input.split(";")) {
    const equals = component.indexOf("=");
    if (equals < 1) throw new Error(`invalid RRULE component: ${component}`);
    const key = component.slice(0, equals).trim().toUpperCase();
    const value = component.slice(equals + 1).trim();
    if (!ALLOWED_KEYS.has(key)) throw new Error(`unsupported RRULE component: ${key}`);
    if (!value || values.has(key)) throw new Error(`invalid or duplicate RRULE component: ${key}`);
    values.set(key, value);
  }

  const freq = values.get("FREQ") as Frequency | undefined;
  if (!freq || !VALID_FREQUENCIES.includes(freq)) throw new Error(`FREQ must be one of ${VALID_FREQUENCIES.join(", ")}`);
  const interval = values.has("INTERVAL") ? Number(values.get("INTERVAL")) : 1;
  if (!Number.isInteger(interval) || interval < 1) throw new Error("INTERVAL must be a positive integer");
  const byDay = values.get("BYDAY")?.split(",").map((day) => day.toUpperCase());
  if (byDay?.some((day) => !WEEKDAYS.includes(day))) throw new Error("BYDAY must contain weekday codes such as MO,WE,FR");
  const count = values.has("COUNT") ? Number(values.get("COUNT")) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) throw new Error("COUNT must be a positive integer");

  return {
    freq,
    interval,
    byHour: values.has("BYHOUR") ? parseIntegers(values.get("BYHOUR")!, "BYHOUR", 0, 23) : undefined,
    byMinute: values.has("BYMINUTE") ? parseIntegers(values.get("BYMINUTE")!, "BYMINUTE", 0, 59) : undefined,
    byDay,
    byMonth: values.has("BYMONTH") ? parseIntegers(values.get("BYMONTH")!, "BYMONTH", 1, 12) : undefined,
    byMonthDay: values.has("BYMONTHDAY") ? parseIntegers(values.get("BYMONTHDAY")!, "BYMONTHDAY", 1, 31) : undefined,
    count,
  };
}

interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(epoch: number, timezone: string): LocalDateTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(epoch));
  } catch {
    throw new Error(`invalid timezone: ${timezone}`);
  }
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function localEpoch(parts: LocalDateTime, timezone: string): number {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = desired;
  for (let i = 0; i < 5; i++) {
    const observed = localParts(guess, timezone);
    const actual = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second);
    guess += desired - actual;
  }
  return guess;
}

function addDays(parts: LocalDateTime, days: number): LocalDateTime {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: parts.hour, minute: parts.minute, second: parts.second };
}

function addMonths(parts: LocalDateTime, months: number): LocalDateTime {
  const date = new Date(Date.UTC(parts.year, parts.month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: Math.min(parts.day, lastDay), hour: parts.hour, minute: parts.minute, second: parts.second };
}

function addYears(parts: LocalDateTime, years: number): LocalDateTime {
  return addMonths(parts, years * 12);
}

function weekday(parts: LocalDateTime): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function dayMatches(spec: RRuleSpec, day: LocalDateTime, anchor: LocalDateTime): boolean {
  if (spec.byDay?.length && !spec.byDay.map((value) => WEEKDAYS.indexOf(value)).includes(weekday(day))) return false;
  if (spec.byMonth?.length && !spec.byMonth.includes(day.month)) return false;
  if (spec.byMonthDay?.length && !spec.byMonthDay.includes(day.day)) return false;
  if (spec.freq === "WEEKLY" && !spec.byDay?.length && weekday(day) !== weekday(anchor)) return false;
  return true;
}

function times(spec: RRuleSpec, anchor: LocalDateTime): Array<{ hour: number; minute: number }> {
  const hours = spec.byHour ?? [anchor.hour];
  const minutes = spec.byMinute ?? [anchor.minute];
  return hours.flatMap((hour) => minutes.map((minute) => ({ hour, minute }))).sort((a, b) => a.hour - b.hour || a.minute - b.minute);
}

function candidatesForDay(spec: RRuleSpec, day: LocalDateTime, anchor: LocalDateTime, after: number, timezone: string): number[] {
  if (!dayMatches(spec, day, anchor)) return [];
  return times(spec, anchor)
    .map(({ hour, minute }) => localEpoch({ ...day, hour, minute, second: 0 }, timezone))
    .filter((epoch) => epoch > after && epoch >= localEpoch(anchor, timezone))
    .sort((a, b) => a - b);
}

function nextWithoutCount(spec: RRuleSpec, after: number, anchorEpoch: number, timezone: string): number | null {
  const anchor = localParts(anchorEpoch, timezone);
  const afterParts = localParts(Math.max(after + 1, anchorEpoch), timezone);

  if (spec.freq === "MINUTELY" || spec.freq === "HOURLY") {
    const step = spec.freq === "MINUTELY" ? spec.interval : spec.interval * 60;
    const anchorMinutes = anchor.hour * 60 + anchor.minute;
    const afterMinutes = afterParts.hour * 60 + afterParts.minute;
    const dayDelta = Math.floor((Date.UTC(afterParts.year, afterParts.month - 1, afterParts.day) - Date.UTC(anchor.year, anchor.month - 1, anchor.day)) / 86_400_000);
    const elapsed = Math.max(0, dayDelta * 1440 + afterMinutes - anchorMinutes);
    let stepIndex = Math.max(0, Math.ceil((elapsed + 1) / step));

    for (let i = 0; i < 300_000; i++, stepIndex++) {
      const totalMinutes = anchorMinutes + stepIndex * step;
      const day = addDays(anchor, Math.floor(totalMinutes / 1440));
      const minute = totalMinutes % 1440;
      const candidate = { ...day, hour: Math.floor(minute / 60), minute: minute % 60, second: 0 };
      if (!dayMatches(spec, candidate, anchor)) continue;
      if (spec.byHour?.length && !spec.byHour.includes(candidate.hour)) continue;
      if (spec.byMinute?.length && !spec.byMinute.includes(candidate.minute)) continue;
      const epoch = localEpoch(candidate, timezone);
      if (epoch > after && epoch >= anchorEpoch) return epoch;
    }
    return null;
  }

  const anchorDate = { ...anchor, hour: 0, minute: 0, second: 0 };
  const maxPeriods = spec.freq === "YEARLY" ? 500 : spec.freq === "MONTHLY" ? 6000 : 10000;
  for (let period = 0; period < maxPeriods; period++) {
    let periodStart: LocalDateTime;
    if (spec.freq === "DAILY") periodStart = addDays(anchorDate, period * spec.interval);
    else if (spec.freq === "WEEKLY") periodStart = addDays(anchorDate, period * spec.interval * 7);
    else if (spec.freq === "MONTHLY") periodStart = addMonths(anchorDate, period * spec.interval);
    else periodStart = addYears(anchorDate, period * spec.interval);

    const days: LocalDateTime[] = [];
    if (spec.freq === "WEEKLY" || spec.byDay?.length) {
      for (let offset = 0; offset < (spec.freq === "WEEKLY" ? 7 : 1); offset++) days.push(addDays(periodStart, offset));
    } else if (spec.freq === "MONTHLY" && spec.byMonthDay?.length) {
      for (const day of spec.byMonthDay) days.push({ ...periodStart, day });
    } else if (spec.freq === "YEARLY" && spec.byMonth?.length) {
      for (const month of spec.byMonth) days.push({ ...periodStart, month, day: spec.byMonthDay?.[0] ?? anchor.day });
    } else {
      days.push(periodStart);
    }

    for (const day of days.sort((a, b) => localEpoch(a, timezone) - localEpoch(b, timezone))) {
      const candidates = candidatesForDay(spec, day, anchor, after, timezone);
      if (candidates.length) return candidates[0];
    }
  }
  return null;
}

function withinCount(spec: RRuleSpec, candidate: number, anchor: number, timezone: string): boolean {
  if (!spec.count) return true;
  let seen = 0;
  let cursor = anchor - 1;
  for (let i = 0; i < 100_000; i++) {
    const occurrence = nextWithoutCount(spec, cursor, anchor, timezone);
    if (occurrence === null || occurrence > candidate) return false;
    seen++;
    if (occurrence === candidate) return seen <= spec.count;
    cursor = occurrence;
  }
  return false;
}

export function nextOccurrence(rrule: string, after: number, timezone = "UTC"): number | null {
  const spec = parseRRule(rrule);
  const candidate = nextWithoutCount(spec, after, after, timezone);
  return candidate !== null && withinCount(spec, candidate, after, timezone) ? candidate : null;
}

export function nextScheduledRun(rrule: string, createdAt: number, lastRunAt: number | null, timezone = "UTC"): number | null {
  const spec = parseRRule(rrule);
  const after = lastRunAt ?? createdAt - 1;
  const candidate = nextWithoutCount(spec, after, createdAt, timezone);
  return candidate !== null && withinCount(spec, candidate, createdAt, timezone) ? candidate : null;
}

export function validateRRule(rrule: string): string | null {
  try {
    parseRRule(rrule);
    return null;
  } catch (error: any) {
    return error?.message ?? String(error);
  }
}
