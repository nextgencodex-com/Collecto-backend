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

// Building an Intl formatter is expensive; fd() runs thousands of times in a big report, so build it once.
const fdFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "13 Oct 2026", matching the frontend's fd(). */
export const fd = (s: string | null | undefined): string =>
  s ? fdFormat.format(new Date(`${s}T00:00:00Z`)) : "—";

/** Offset of `tz` from UTC, in minutes, at the given instant. */
function offsetMinutes(at: Date, tz: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/.exec(name);
  if (!m || !m[1]) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** The instant at which the wall clock in `tz` reads `date` `time` ("YYYY-MM-DD", "HH:mm"). */
export function atLocal(date: string, time: string, tz: string = env.APP_TZ): Date {
  const [y, mo, d] = date.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  // re-evaluate at the candidate instant so a DST change between guess and result is honoured
  return new Date(guess - offsetMinutes(new Date(first), tz) * 60_000);
}
