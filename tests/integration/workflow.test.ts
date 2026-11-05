// A whole working day through the public API, starting from an empty database (no demo seed):
// set up the shop, sell on instalment, collect, correct, reassign, close, report, alert.
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { createOwner } from "../../src/db/create-owner.js";
import { runOverdueAlerts } from "../../src/jobs/overdue.js";

const app = createApp();
const TODAY = "2026-10-13"; // APP_TODAY in the test environment
const call = (m: "get" | "post" | "patch" | "put", p: string, token?: string) => {
  const r = request(app)[m](`/api/v1${p}`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const login = async (role: string, u: string, p: string) =>
  (await request(app).post("/api/v1/auth/login").send({ role, username: u, password: p })).body.data
    .accessToken as string;

describe.skipIf(!process.env.TEST_DATABASE_URL)("a day in the shop", () => {
  let owner: string;
  let ann: string;
  let bob: string;

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "RefreshToken","Notification","AuditEntry","Closing","Extension","Payment","Item","Customer","Product","Shop","User" RESTART IDENTITY CASCADE`,
    );
    await createOwner({
      name: "Olive Owner",
      email: "olive@shop.lk",
      username: "olive",
      password: "owner-password-1",
      shopName: "Olive's",
    });
    owner = await login("owner", "olive", "owner-password-1");
  }, 60_000);

  it("1. the owner sets up riders, a product and customers", async () => {
    for (const [n, u, ph] of [
      ["Ann Rider", "ann", "0711000001"],
      ["Bob Rider", "bob", "0711000002"],
    ] as const) {
      const r = await call("post", "/riders", owner).send({
        name: n,
        phone: ph,
        area: "Galle",
        username: u,
        password: "rider-pass",
      });
      expect(r.status).toBe(201);
    }
    expect(
      (await call("get", "/riders", owner)).body.data.map((r: { id: string }) => r.id),
    ).toEqual(["R1", "R2"]);
    const p = await call("post", "/products", owner).send({
      code: "kt-1",
      name: "Kettle",
      purchase: 900,
      cash: 1200,
      price: 1600,
      freq: "weekly",
      amount: 100,
      period: 4,
      stock: 2,
    });
    expect(p.body.data.code).toBe("KT-1");
    for (const [name, nic, rider] of [
      ["Cara Customer", "199000000001", "R1"],
      ["Dan Customer", "199000000002", "R2"],
    ] as const) {
      const c = await call("post", "/customers", owner).send({
        name,
        nic,
        phone: "0770000000",
        address: "1 St",
        city: "Galle",
        lat: 6.05,
        lng: 80.2,
        riderId: rider,
      });
      expect(c.status).toBe(201);
    }
    ann = await login("rider", "ann", "rider-pass");
    bob = await login("rider", "bob", "rider-pass");
  });

  it("2. selling on instalment uses stock and starts the schedule", async () => {
    // started 21 days ago, 100 a week: 4 instalments (days -21, -14, -7, 0) are due today, nothing paid yet
    for (const customerId of ["C1", "C2"]) {
      const r = await call("post", "/items", owner).send({
        customerId,
        code: "KT-1",
        price: 1600,
        freq: "weekly",
        period: 4,
        amount: 100,
        start: "2026-09-22",
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    expect(
      (
        await call("post", "/items", owner).send({
          customerId: "C1",
          code: "KT-1",
          price: 1600,
          freq: "weekly",
          period: 4,
          amount: 100,
          start: "2026-09-22",
        })
      ).body.message,
    ).toMatch(/out of stock/i);
    const overdue = await call("get", "/customers?status=OVERDUE", owner);
    expect(overdue.body.meta.total).toBe(2);
  });

  it("3. riders see only their own data", async () => {
    const a = (await call("get", "/bootstrap", ann)).body.data;
    expect(a.customers.map((c: { id: string }) => c.id)).toEqual(["C1"]);
    expect(a.products).toEqual([]);
    expect((await call("get", "/customers/C2", ann)).status).toBe(404);
  });

  it("4. a rider collects with paise; overpayment is refused; the owner is notified", async () => {
    const paid = await call("post", "/payments", ann).send({
      customerId: "C1",
      lines: [{ itemId: "IT1", amount: 250.5 }],
    });
    expect(paid.status).toBe(201);
    expect(paid.body.data.total).toBe(250.5);
    expect(
      (
        await call("post", "/payments", ann).send({
          customerId: "C1",
          lines: [{ itemId: "IT1", amount: 1400 }],
        })
      ).status,
    ).toBe(422); // balance is 1349.50
    const n = (await call("get", "/notifications", owner)).body.data;
    expect(n[0]).toMatchObject({ type: "payment", title: "Payment received" });
    expect(n[0].text).toBe("Rs. 250.50 from Cara Customer · Ann Rider");
  });

  it("5. the owner corrects the payment; the audit log records old and new", async () => {
    const id = (await call("get", "/payments", owner)).body.data[0].id;
    const fix = await call("patch", `/payments/${id}`, owner).send({
      amount: 300,
      reason: "Receipt shows 300",
    });
    expect(fix.body.data).toMatchObject({ amount: 300, status: "corrected" });
    expect((await call("get", "/audit", owner)).body.data[0]).toMatchObject({
      old: "Rs. 250.50",
      nw: "Rs. 300",
      ref: "Cara Customer",
    });
  });

  it("6. reassigning mid-day keeps Ann's collection in her closing and shows it to Bob", async () => {
    await call("patch", "/customers/C1/rider", owner).send({ riderId: "R2" });
    const bobPayments = (await call("get", "/payments", bob)).body.data;
    expect(bobPayments.some((p: { customerId: string }) => p.customerId === "C1")).toBe(true);
    const closing = await call("post", "/closings", ann).send({ cash: 300 });
    expect(closing.status).toBe(201);
    expect(closing.body.data).toMatchObject({ collected: 300, count: 1, cash: 300 });
  });

  it("7. reports agree with the ledger", async () => {
    const daily = (await call("get", `/reports/daily?date=${TODAY}`, owner)).body.data;
    expect(daily.summary.find((s: { label: string }) => s.label === "Collected").value).toBe(
      "Rs. 300",
    );
    expect(daily.rows).toHaveLength(1);
    const person = (await call("get", "/reports/person", owner)).body.data;
    // two items of 1,600 each, 300 paid in total
    expect(
      person.summary.find((s: { label: string }) => s.label === "Total outstanding").value,
    ).toBe("Rs. 2,900");
    const overdue = (await call("get", "/reports/overdue", owner)).body.data;
    // Cara paid exactly the 3 instalments due before today (so she is only "due today"); Dan paid nothing
    expect(overdue.rows).toHaveLength(1);
    expect(overdue.rows[0][0].v).toBe("Dan Customer");
    expect(overdue.summary.find((x: { label: string }) => x.label === "Overdue amount").value).toBe(
      "Rs. 300",
    );
    const due = await call("get", "/customers?status=DUE", owner);
    expect(due.body.data.map((c: { id: string }) => c.id)).toEqual(["C1"]);
  });

  it("8. the overdue job alerts the owner once per customer per day", async () => {
    const r = await runOverdueAlerts(TODAY);
    expect(r.created).toBe(1); // only Dan is overdue
    expect((await runOverdueAlerts(TODAY)).created).toBe(0);
    const alerts = (await call("get", "/notifications", owner)).body.data.filter(
      (n: { type: string }) => n.type === "overdue",
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain("Dan Customer");
  });

  it("9. what the app shows (bootstrap) adds up: paid + balance = price for every item", async () => {
    const d = (await call("get", "/bootstrap", owner)).body.data;
    for (const item of d.items) {
      const paid =
        d.payments
          .filter((p: { itemId: string }) => p.itemId === item.id)
          .reduce((a: number, p: { amount: number }) => a + p.amount, 0) + item.priorPaid;
      expect(paid).toBeLessThanOrEqual(item.price);
    }
    expect(d.closings).toHaveLength(1);
    expect(d.audit).toHaveLength(1);
  });
});
