import { env } from "../config/env.js";

const dayFmt = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }); // YYYY-MM-DD

/** "Today" as YYYY-MM-DD in APP_TZ, or the APP_TODAY override. */
export const today = (): string => env.APP_TODAY ?? dayFmt(env.APP_TZ).format(new Date());

/** Current wall-clock "HH:mm" in APP_TZ. */
export const nowHHmm = (): string => timeOf(new Date());

/** Instant -> "HH:mm" in APP_TZ. */
export const timeOf = (d: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: env.APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);

/** Instant -> YYYY-MM-DD in APP_TZ. */
export const dayOf = (d: Date): string => dayFmt(env.APP_TZ).format(d);

/** @db.Date value (UTC midnight) -> YYYY-MM-DD. */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** YYYY-MM-DD -> Date at UTC midnight, the form Prisma expects for @db.Date columns. */
export const toDbDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);

/** "13 Oct 2026", matching the frontend's fd(). */
export const fd = (s: string | null | undefined): string =>
  s
    ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
