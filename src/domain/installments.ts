// Server-side port of calcItem()/derive() from the frontend (src/lib/calc.ts, src/lib/selectors.ts).
// All amounts are integer paise; dates are YYYY-MM-DD strings. Pure functions: no database access.
import { cumulativePaise, schedule, toPaise, type Freq } from "./schedule.js";

export type Status = "PAID" | "DUE" | "OVERDUE" | "UPCOMING" | "DONE";
export const RANK: Record<Status, number> = { OVERDUE: 0, DUE: 1, PAID: 2, UPCOMING: 3, DONE: 4 };
export const STATUS_LABEL: Record<Status, string> = {
  PAID: "Paid",
  DUE: "Due today",
  OVERDUE: "Overdue",
  UPCOMING: "Upcoming",
  DONE: "Completed",
};

export interface ItemInput {
  id: number;
  customerId: number;
  price: number | string | { toString(): string };
  amount: number | string | { toString(): string };
  freq: Freq;
  start: string;
}
export interface PayInput {
  itemId: number;
  paise: number;
  date: string;
}

export interface CalcItem {
  id: number;
  customerId: number;
  dates: string[];
  pricePaise: number;
  paid: number;
  balance: number;
  overdue: number;
  dueNow: number;
  dueToday: number;
  expectedToday: number;
  next: string | null;
  status: Status;
  missed: number;
  oldest: string | null;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function calcItem(it: ItemInput, pays: PayInput[], today: string): CalcItem {
  const dates = schedule(it);
  const cum = cumulativePaise(it);
  const price = toPaise(it.price);
  const mine = pays.filter((p) => p.itemId === it.id);
  const paid = sum(mine.map((p) => p.paise));
  const paidBefore = sum(mine.filter((p) => p.date < today).map((p) => p.paise));
  const cT = dates.filter((d) => d <= today).length;
  const cB = dates.filter((d) => d < today).length;
  const expT = cT ? cum(cT - 1) : 0;
  const expB = cB ? cum(cB - 1) : 0;
  const balance = Math.max(0, price - paid);
  const overdue = Math.max(0, expB - paid);
  const dueNow = Math.min(balance, Math.max(0, expT - paid));
  const dueToday = Math.max(0, dueNow - overdue);
  const ni = dates.findIndex((_, i) => cum(i) > paid);
  const status: Status =
    balance <= 0
      ? "DONE"
      : overdue > 0
        ? "OVERDUE"
        : dueToday > 0
          ? "DUE"
          : cT === 0
            ? "UPCOMING"
            : "PAID";
  return {
    id: it.id,
    customerId: it.customerId,
    dates,
    pricePaise: price,
    paid,
    balance,
    overdue,
    dueNow,
    dueToday,
    expectedToday: Math.max(0, expT - paidBefore),
    next: ni >= 0 ? dates[ni]! : null,
    status,
    missed: dates.filter((d, i) => d < today && cum(i) > paid).length,
    oldest: dates.find((d, i) => d < today && cum(i) > paid) ?? null,
  };
}

/** Amount expected from an item on `date`: instalments due by then minus what was paid before it. */
export function expectedOn(it: ItemInput, date: string, pays: PayInput[]): number {
  const cum = cumulativePaise(it);
  const c = schedule(it).filter((d) => d <= date).length;
  const e = c ? cum(c - 1) : 0;
  const pb = sum(pays.filter((p) => p.itemId === it.id && p.date < date).map((p) => p.paise));
  return Math.max(0, e - pb);
}

export interface CalcCustomer {
  id: number;
  status: Status;
  dueNow: number;
  overdue: number;
  expectedToday: number;
  balance: number;
  paid: number;
  total: number;
  missed: number;
  activeItems: number;
}

export function calcCustomer(id: number, items: CalcItem[]): CalcCustomer {
  const its = items.filter((i) => i.customerId === id);
  const act = its.filter((i) => i.status !== "DONE");
  const status: Status = act.length
    ? act.reduce<Status>((a, x) => (RANK[x.status] < RANK[a] ? x.status : a), "UPCOMING")
    : its.length
      ? "DONE"
      : "UPCOMING";
  return {
    id,
    status,
    dueNow: sum(act.map((x) => x.dueNow)),
    overdue: sum(act.map((x) => x.overdue)),
    expectedToday: sum(its.map((x) => x.expectedToday)),
    balance: sum(its.map((x) => x.balance)),
    paid: sum(its.map((x) => x.paid)),
    total: sum(its.map((x) => x.pricePaise)),
    missed: sum(act.map((x) => x.missed)),
    activeItems: act.length,
  };
}
