// Guards the reports: output must equal the captured golden master (so performance work cannot change a
// single cell), and the headline totals must agree with SQL computed independently of the service.
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";
import { build, type ReportType } from "../../src/modules/reports/reports.service.js";

const golden = JSON.parse(
  readFileSync(path.resolve("tests/fixtures/reports-golden.json"), "utf8"),
) as Record<string, unknown>;
const rs = (n: number) =>
  "Rs. " +
  n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
const summary = (r: { summary: { label: string; value: string }[] }, label: string) =>
  r.summary.find((s) => s.label === label)!.value;

describe.skipIf(!process.env.TEST_DATABASE_URL)("reports", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
  }, 60_000);

  it.each(Object.keys(golden))("matches the golden master: %s", async (key) => {
    const [type, json] = [key.slice(0, key.indexOf(" ")), key.slice(key.indexOf(" ") + 1)];
    expect(await build(type as ReportType, JSON.parse(json))).toEqual(golden[key]);
  });

  it("daily: collected equals the SQL sum for that day, and rows equal the payments", async () => {
    for (const date of ["2026-10-13", "2026-10-06", "2026-08-14"]) {
      const r = await build("daily", { date });
      const sql = await prisma.$queryRaw<
        { s: string | null; n: number }[]
      >`SELECT SUM(amount)::text AS s, COUNT(*)::int AS n FROM "Payment" WHERE date = ${new Date(`${date}T00:00:00Z`)}`;
      expect(summary(r, "Collected")).toBe(rs(Number(sql[0]!.s ?? 0)));
      expect(r.rows).toHaveLength(sql[0]!.n);
    }
  });

  it("person: total outstanding equals total price minus total paid, from SQL", async () => {
    const r = await build("person", {});
    const sql = await prisma.$queryRaw<{ out: string }[]>`
      SELECT (SELECT SUM(price) FROM "Item")::numeric - COALESCE((SELECT SUM(amount) FROM "Payment"), 0) AS out`;
    expect(summary(r, "Total outstanding")).toBe(rs(Number(sql[0]!.out)));
  });

  it("monthly: collected equals the SQL sum for the month", async () => {
    const r = await build("monthly", { month: "2026-10" });
    const sql = await prisma.$queryRaw<
      { s: string }[]
    >`SELECT COALESCE(SUM(amount), 0)::text AS s FROM "Payment" WHERE date >= DATE '2026-10-01' AND date < DATE '2026-11-01'`;
    expect(summary(r, "Collected")).toBe(rs(Number(sql[0]!.s)));
  });

  it("overdue: the prototype's four items, and the overdue report agrees with the person report", async () => {
    const overdue = await build("overdue", {});
    expect(overdue.rows).toHaveLength(4);
    expect(summary(overdue, "Overdue amount")).toBe(
      summary(await build("person", {}), "Total overdue"),
    );
  });
});
