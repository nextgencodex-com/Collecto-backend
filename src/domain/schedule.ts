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

export interface PlanInput {
  price: number | string;
  amount: number | string;
  freq: Freq;
  start: string;
}

/** Due dates of every instalment: ceil(price / amount) of them. */
export function schedule(plan: PlanInput): string[] {
  const n = Math.ceil(toPaise(plan.price) / toPaise(plan.amount));
  return Array.from({ length: n }, (_, i) =>
    plan.freq === "WEEKLY" ? addDays(plan.start, 7 * i) : addMonths(plan.start, i),
  );
}

/** Cumulative amount (paise) that must be paid once instalment `i` (0-based) is due. */
export const cumulativePaise =
  (plan: Pick<PlanInput, "price" | "amount">) =>
  (i: number): number =>
    Math.min(toPaise(plan.price), (i + 1) * toPaise(plan.amount));
