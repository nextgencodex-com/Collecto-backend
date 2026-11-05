import { z } from "zod";
import { fromPaise, toPaise } from "../domain/schedule.js";

const twoDp = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const MAX = 9_999_999_999.99;

/** A positive amount with at most 2 decimals; accepts numbers or numeric strings (form inputs). */
export const money = (msg = "Enter a valid amount.") =>
  z.coerce
    .number({ error: msg })
    .refine((n) => Number.isFinite(n) && n > 0 && n <= MAX, msg)
    .refine(twoDp, "Amounts can have at most 2 decimal places.");

/** Like `money` but 0 is allowed (e.g. cash submitted at closing). */
export const moneyOrZero = (msg = "Enter a valid amount.") =>
  z.coerce
    .number({ error: msg })
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= MAX, msg)
    .refine(twoDp, "Amounts can have at most 2 decimal places.");

/** Paise -> the "12.34" string Prisma stores into Decimal(12,2) without float surprises. */
export const dec = (paise: number) => fromPaise(paise).toFixed(2);

/** Decimal / numeric value from Prisma -> plain JSON number. */
export const num = (v: { toString(): string }): number =>
  // Prisma's Decimal has a direct conversion; avoid the string round trip on the hot bootstrap path
  typeof (v as { toNumber?: () => number }).toNumber === "function"
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v.toString());

export const paise = toPaise;

// One formatter per style, built once (constructing Intl.NumberFormat per value is what made big reports slow).
const wholeFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const paiseFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "Rs. 1,000" for whole amounts, "Rs. 1,234.50" otherwise. Negative values keep their sign. */
export const fmtRs = (p: number) => "Rs. " + (p % 100 === 0 ? wholeFmt : paiseFmt).format(p / 100);

/** "+Rs. 200" / "−Rs. 1,000" */
export const signedRs = (p: number) => (p >= 0 ? "+" : "−") + fmtRs(Math.abs(p));
