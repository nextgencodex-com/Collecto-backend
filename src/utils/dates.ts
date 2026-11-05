import { env } from "../config/env.js";

const fmtDate = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }); // YYYY-MM-DD

/** "Today" as YYYY-MM-DD in APP_TZ, or the APP_TODAY override. */
export const today = (): string => env.APP_TODAY ?? fmtDate(env.APP_TZ).format(new Date());

/** Current wall-clock "HH:mm" in APP_TZ. */
export const nowHHmm = (): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: env.APP_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

/** YYYY-MM-DD -> Date at UTC midnight, the form Prisma expects for @db.Date columns. */
export const toDbDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
