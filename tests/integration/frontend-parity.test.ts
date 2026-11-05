// Runs the FRONTEND's own calculation code (Collecto-frontend/src/lib/calc.ts + selectors.ts) against the
// data the backend serves, and compares every figure with the backend's own implementation. Guards against
// the two copies of the instalment maths drifting apart, and checks that the windowed /bootstrap
// (payments before `paymentsFrom` summarised as `priorPaid`) gives the same answers as the full history.
// Skipped when the frontend folder is not next to this repo.
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";
import { calcCustomer, calcItem } from "../../src/domain/installments.js";
import { addDays, fromPaise } from "../../src/domain/schedule.js";
import { bootstrap } from "../../src/modules/bootstrap/bootstrap.service.js";

const FE = path.resolve(process.cwd(), "..", "Collecto-frontend", "src", "lib");
const hasFrontend = existsSync(path.join(FE, "calc.ts")) && !!process.env.TEST_DATABASE_URL;
const T0 = "2026-10-13";
const owner = { id: 0, role: "OWNER" as const, username: "owner", name: "Shop Owner" };

type Boot = Awaited<ReturnType<typeof bootstrap>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fe: { calc: any; sel: any };

const idNum = (s: string) => Number(s.replace(/^\D+/, ""));
const near = (a: number, b: number) => Math.abs(a - b) < 0.0051;

/** Backend truth for `today`, from the full (unwindowed) history. */
function backendTruth(full: Boot, today: string) {
  const pays = full.payments.map((p) => ({
    itemId: idNum(p.itemId),
    paise: Math.round(p.amount * 100),
    date: p.date,
  }));
  const items = full.items.map((i) =>
    calcItem(
      {
        id: idNum(i.id),
        customerId: idNum(i.customerId),
        price: i.price,
        amount: i.amount,
        freq: i.freq === "weekly" ? "WEEKLY" : "MONTHLY",
        start: i.start,
      },
      pays,
      today,
    ),
  );
  const customers = full.customers.map((c) => calcCustomer(idNum(c.id), items));
  return { items, customers };
}

function compare(feData: Boot, full: Boot, today: string, label: string) {
  fe.calc.setToday(today);
  const D = fe.sel.derive(feData);
  const truth = backendTruth(full, today);
  const bad: string[] = [];
  for (const t of truth.items) {
    const f = D.imap[`IT${t.id}`];
    const same =
      near(f.paid, fromPaise(t.paid)) &&
      near(f.balance, fromPaise(t.balance)) &&
      near(f.overdue, fromPaise(t.overdue)) &&
      near(f.dueNow, fromPaise(t.dueNow)) &&
      near(f.dueToday, fromPaise(t.dueToday)) &&
      near(f.expectedToday, fromPaise(t.expectedToday)) &&
      f.status === t.status &&
      f.missed === t.missed &&
      (f.next ?? null) === t.next;
    if (!same)
      bad.push(
        `${label} ${today} item IT${t.id}: frontend ${JSON.stringify({ paid: f.paid, bal: f.balance, od: f.overdue, due: f.dueNow, st: f.status })} vs backend ${JSON.stringify({ paid: t.paid / 100, bal: t.balance / 100, od: t.overdue / 100, due: t.dueNow / 100, st: t.status })}`,
      );
  }
  for (const t of truth.customers) {
    const f = D.cmap[`C${t.id}`];
    const same =
      f.status === t.status &&
      near(f.dueNow, fromPaise(t.dueNow)) &&
      near(f.overdue, fromPaise(t.overdue)) &&
      near(f.expectedToday, fromPaise(t.expectedToday)) &&
      near(f.balance, fromPaise(t.balance)) &&
      near(f.paid, fromPaise(t.paid)) &&
      near(f.total, fromPaise(t.total)) &&
      f.missed === t.missed;
    if (!same) bad.push(`${label} ${today} customer C${t.id}`);
  }
  return bad;
}

describe.skipIf(!hasFrontend)("frontend maths == backend maths", () => {
  let full: Boot;
  let win: Boot;
  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const load = (f: string): Promise<any> => import(/* @vite-ignore */ path.join(FE, f));
    fe = { calc: await load("calc.ts"), sel: await load("selectors.ts") };
    await seedDatabase(prisma, T0);
    full = await bootstrap(owner, { paymentDays: 0 });
    win = await bootstrap(owner, { paymentDays: 30 });
  }, 90_000);

  it("agree on every item and customer for 90 consecutive days (full history)", () => {
    const bad: string[] = [];
    for (let i = -45; i <= 45; i++) bad.push(...compare(full, full, addDays(T0, i), "full"));
    expect(bad).toEqual([]);
  });

  it("still agree when the frontend only has the 30-day window plus priorPaid", () => {
    expect(win.payments.length).toBeLessThan(full.payments.length);
    const bad: string[] = [];
    // "today" is never earlier than the window start (the server derives both from the same date)
    for (let i = -30; i <= 45; i++) bad.push(...compare(win, full, addDays(T0, i), "window"));
    expect(bad).toEqual([]);
  });

  it("agree on the money formatting used in notifications and reports", () => {
    const { fmt } = fe.calc;
    expect(fmt(1000)).toBe("Rs. 1,000");
    expect(fmt(1234.5)).toBe("Rs. 1,234.50");
    expect(fmt(0.1 + 0.2)).toBe("Rs. 0.30");
    expect(fmt(null)).toBe("Rs. 0");
  });
});
