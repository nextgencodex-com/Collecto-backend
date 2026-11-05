import { describe, expect, it } from "vitest";
import { calcCustomer, calcItem, type Status } from "../../src/domain/installments.js";
import { addDays } from "../../src/domain/schedule.js";
import { anchoredStart, buildDemo } from "../../src/db/seed.js";

const BASE = "2026-10-13";

/** The situation the demo is in on `today`: who is overdue / due / paid up, and what was paid today. */
function situation(today: string) {
  const { items, payments } = buildDemo(today);
  const pays = payments.map((p) => ({ itemId: p.itemId, paise: p.paise, date: p.date }));
  const calc = items.map((i) => calcItem(i, pays, today));
  const customers = Array.from({ length: 12 }, (_, k) => calcCustomer(101 + k, calc));
  const count = (s: Status) => customers.filter((c) => c.status === s).length;
  return {
    overdue: count("OVERDUE"),
    due: count("DUE"),
    paid: count("PAID"),
    upcoming: count("UPCOMING"),
    done: count("DONE"),
    paidToday: payments.filter((p) => p.date === today).length,
    overdueAmount: customers.reduce((a, c) => a + c.overdue, 0),
    dueNow: customers.reduce((a, c) => a + c.dueNow, 0),
    expectedToday: customers.reduce((a, c) => a + c.expectedToday, 0),
    activeItems: calc.filter((c) => c.status !== "DONE").length,
  };
}

describe("demo seed keeps the prototype's pattern on any date", () => {
  const baseline = situation(BASE);

  it("the reference situation is the prototype's: 4 overdue customers and 3 payments collected today", () => {
    expect(baseline.overdue).toBe(4);
    expect(baseline.paidToday).toBe(3);
    expect(baseline.overdueAmount).toBeGreaterThan(0);
  });

  it("is the identity on the prototype's own date (starts are unchanged)", () => {
    const { items } = buildDemo(BASE);
    expect(items.find((i) => i.id === 8)!.start).toBe("2026-02-13"); // the monthly refrigerator plan
    expect(items.find((i) => i.id === 1)!.start).toBe("2026-08-18");
    expect(items.find((i) => i.id === 13)!.start).toBe("2026-10-20"); // not started yet
  });

  it("gives exactly the same situation on every day for 2.5 years, including month-ends and leap days", () => {
    const mismatches: string[] = [];
    for (let i = 0; i < 900; i++) {
      const day = addDays("2025-01-01", i);
      const s = situation(day);
      if (JSON.stringify(s) !== JSON.stringify(baseline))
        mismatches.push(`${day}: ${JSON.stringify(s)}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("re-anchors monthly plans on awkward days (29th, 30th, 31st)", () => {
    for (const day of [
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-08-31",
      "2026-10-30",
      "2027-12-29",
      "2028-02-29",
    ]) {
      expect(situation(day), day).toEqual(baseline);
    }
    // the monthly plan that is due today keeps falling due on today's day-of-month
    const { items } = buildDemo("2026-01-31");
    expect(
      anchoredStart(
        { price: 120000, amount: 10000, freq: "MONTHLY", start: "2026-02-13" },
        "2026-01-31",
      ).slice(8),
    ).toBe("31");
    expect(items.find((i) => i.id === 8)!.start.slice(8)).toBe("31");
  });
});
