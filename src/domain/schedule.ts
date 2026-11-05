// Server-side port of the frontend's calc.ts schedule maths (src/lib/calc.ts).
// Money is handled in integer paise so there is no float drift; dates are ISO "YYYY-MM-DD" strings
// handled in UTC so they never shift with the server's time zone.

export type Freq = "WEEKLY" | "MONTHLY";

/** Rupees (number or Decimal-like string) -> integer paise. */
export const toPaise = (v: number | string | { toString(): string }): number =>
  Math.round(Number(v.toString()) * 100);

/** Integer paise -> rupees as a number with at most 2 decimals. */
export const fromPaise = (p: number): number => p / 100;

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (s: string, n: number): string => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Adds months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export const addMonths = (s: string, n: number): string => {
  const d = parse(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return iso(d);
};

export const daysBetween = (from: string, to: string): number =>
  Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);

type MoneyLike = number | string | { toString(): string };

export interface PlanInput {
  price: MoneyLike;
  amount: MoneyLike;
  freq: Freq;
  start: string;
}

const MS_DAY = 86_400_000;
const pad2 = (n: number) => (n < 10 ? "0" + n : String(n));
const daysIn = (y: number, m: number) =>
  m === 2
    ? y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
      ? 29
      : 28
    : m === 4 || m === 6 || m === 9 || m === 11
      ? 30
      : 31;

/** Straightforward version built from addDays/addMonths. Slow; kept as the reference the fast one is tested against. */
export function scheduleReference(plan: PlanInput): string[] {
  const n = Math.ceil(toPaise(plan.price) / toPaise(plan.amount));
  return Array.from({ length: n }, (_, i) =>
    plan.freq === "WEEKLY" ? addDays(plan.start, 7 * i) : addMonths(plan.start, i),
  );
}

// A schedule is a pure function of (price, amount, frequency, start), and the same items are scheduled
// again on almost every request, so keep recent results. Cleared wholesale when full (cheap, bounded).
const cache = new Map<string, readonly string[]>();
const CACHE_MAX = 20_000;

/**
 * Due dates of every instalment: ceil(price / amount) of them. The returned array is shared and frozen;
 * copy it before modifying.
 */
export function schedule(plan: PlanInput): string[] {
  const price = toPaise(plan.price);
  const amount = toPaise(plan.amount);
  const key = `${price}|${amount}|${plan.freq}|${plan.start}`;
  const hit = cache.get(key);
  if (hit) return hit as string[];

  const n = Math.ceil(price / amount);
  const [y, m, d] = plan.start.split("-").map(Number) as [number, number, number];
  const out = new Array<string>(n);
  if (plan.freq === "WEEKLY") {
    const base = Date.UTC(y, m - 1, d);
    for (let i = 0; i < n; i++) out[i] = new Date(base + i * 7 * MS_DAY).toISOString().slice(0, 10);
  } else {
    const first = y * 12 + (m - 1);
    for (let i = 0; i < n; i++) {
      const t = first + i;
      const ty = Math.floor(t / 12);
      const tm = (t % 12) + 1;
      out[i] = `${ty}-${pad2(tm)}-${pad2(Math.min(d, daysIn(ty, tm)))}`; // clamp 31 Jan + 1 month = 28/29 Feb
    }
  }
  if (cache.size >= CACHE_MAX) cache.clear();
  Object.freeze(out);
  cache.set(key, out);
  return out;
}

/** Cumulative amount (paise) that must be paid once instalment `i` (0-based) is due. */
export const cumulativePaise = (plan: Pick<PlanInput, "price" | "amount">) => {
  const price = toPaise(plan.price);
  const amount = toPaise(plan.amount);
  return (i: number): number => Math.min(price, (i + 1) * amount);
};
