import { describe, expect, it } from "vitest";
import { calcCustomer, calcItem, expectedOn } from "../../src/domain/installments.js";

const iron = {
  id: 1,
  customerId: 101,
  price: 6400,
  amount: 400,
  freq: "WEEKLY" as const,
  start: "2026-08-18",
};
// 16 weekly instalments: 2026-08-18 ... 2026-12-01; on 2026-10-13 the 8th instalment is due today.
const TODAY = "2026-10-13";
const pay = (itemId: number, paise: number, date: string) => ({ itemId, paise, date });

describe("calcItem", () => {
  it("is PAID when everything due before today is paid and today's instalment is paid", () => {
    const pays = Array.from({ length: 8 }, (_, i) => pay(1, 40000, `2026-08-${18 + i * 7}`)).slice(
      0,
      8,
    );
    // 8 instalments due by 2026-10-13 (Aug 18,25, Sep 1,8,15,22,29, Oct 6) + Oct 13 = 9 due
    const nine = [...pays, pay(1, 40000, TODAY)];
    const c = calcItem(iron, nine, TODAY);
    expect(c.status).toBe("PAID");
    expect(c.overdue).toBe(0);
  });

  it("is OVERDUE with the missed amount when instalments before today are unpaid", () => {
    const c = calcItem(iron, [pay(1, 40000, "2026-08-18")], TODAY);
    expect(c.status).toBe("OVERDUE");
    expect(c.missed).toBe(7); // Aug 25 ... Oct 6
    expect(c.overdue).toBe(7 * 40000);
    expect(c.oldest).toBe("2026-08-25");
    expect(c.dueNow).toBe(8 * 40000); // overdue + today's instalment
    expect(c.dueToday).toBe(40000);
  });

  it("is DUE when only today's instalment is unpaid", () => {
    const pays = Array.from({ length: 8 }, (_, i) =>
      pay(1, 40000, `d${i}`.replace(/.*/, "2026-08-18")),
    );
    const c = calcItem(iron, pays, TODAY);
    expect(c.status).toBe("DUE");
    expect(c.dueToday).toBe(40000);
  });

  it("is UPCOMING before the first due date and DONE when fully paid", () => {
    expect(calcItem({ ...iron, start: "2026-11-01" }, [], TODAY).status).toBe("UPCOMING");
    expect(calcItem(iron, [pay(1, 640000, "2026-08-18")], TODAY).status).toBe("DONE");
  });

  it("handles paise amounts exactly", () => {
    const it = {
      id: 2,
      customerId: 1,
      price: "100.10",
      amount: "30.00",
      freq: "WEEKLY" as const,
      start: "2026-10-06",
    };
    const c = calcItem(it, [pay(2, 3000, "2026-10-06")], TODAY); // due: Oct 6 and Oct 13
    expect(c.balance).toBe(10010 - 3000);
    expect(c.dueNow).toBe(3000);
  });

  it("expectedOn matches the daily report logic", () => {
    expect(expectedOn(iron, "2026-08-25", [pay(1, 40000, "2026-08-18")])).toBe(40000);
    expect(expectedOn(iron, "2026-08-18", [])).toBe(40000);
  });
});

describe("calcCustomer", () => {
  it("takes the worst status across active items", () => {
    const a = calcItem(iron, [pay(1, 40000, "2026-08-18")], TODAY); // overdue
    const b = calcItem({ ...iron, id: 2, start: "2026-11-01" }, [], TODAY); // upcoming
    const c = calcCustomer(101, [a, b]);
    expect(c.status).toBe("OVERDUE");
    expect(c.activeItems).toBe(2);
    expect(c.overdue).toBe(a.overdue);
  });
});
