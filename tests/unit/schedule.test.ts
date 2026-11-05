import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  cumulativePaise,
  daysBetween,
  fromPaise,
  schedule,
  toPaise,
} from "../../src/domain/schedule.js";

describe("schedule maths", () => {
  it("builds a weekly plan like the frontend (Steam Iron 6400 / 400 = 16 weeks)", () => {
    const d = schedule({ price: 6400, amount: 400, freq: "WEEKLY", start: "2026-08-18" });
    expect(d).toHaveLength(16);
    expect(d[0]).toBe("2026-08-18");
    expect(d[1]).toBe("2026-08-25");
    expect(d[15]).toBe("2026-12-01");
  });

  it("clamps month-end dates", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2026-10-13", 12)).toBe("2027-10-13");
  });

  it("handles paise without float drift", () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(30);
    expect(toPaise("100.55")).toBe(10055);
    expect(fromPaise(10055)).toBe(100.55);
  });

  it("caps the last instalment at the price (decimal plan)", () => {
    const plan = { price: "100.10", amount: "30.00", freq: "WEEKLY" as const, start: "2026-01-01" };
    expect(schedule(plan)).toHaveLength(4); // ceil(10010 / 3000)
    const cum = cumulativePaise(plan);
    expect(cum(0)).toBe(3000);
    expect(cum(2)).toBe(9000);
    expect(cum(3)).toBe(10010); // 4 * 3000 = 12000 -> capped at the price
  });

  it("does date arithmetic in UTC, independent of server timezone", () => {
    expect(addDays("2026-03-28", 7)).toBe("2026-04-04");
    expect(daysBetween("2026-10-13", "2026-11-05")).toBe(23);
    expect(daysBetween("2026-11-05", "2026-10-13")).toBe(-23);
  });
});
