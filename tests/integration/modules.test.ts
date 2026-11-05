import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";
import { runOverdueAlerts } from "../../src/jobs/overdue.js";

const app = createApp();
const api = (m: "get" | "post" | "patch" | "put", path: string, token?: string) => {
  const r = request(app)[m](`/api/v1${path}`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const login = async (role: string, username: string, password: string) =>
  (await request(app).post("/api/v1/auth/login").send({ role, username, password })).body.data
    .accessToken as string;

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

let owner: string;
let kasun: string; // rider R1: customers C101-C106
let nimal: string; // rider R2: customers C107-C110

describe.skipIf(!process.env.TEST_DATABASE_URL)("modules", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
    [owner, kasun, nimal] = await Promise.all([
      login("owner", "owner", "owner123"),
      login("rider", "kasun", "1234"),
      login("rider", "nimal", "1234"),
    ]);
  }, 60_000);

  describe("access control", () => {
    it("requires authentication everywhere except login/health", async () => {
      for (const p of [
        "/bootstrap",
        "/customers",
        "/items",
        "/payments",
        "/closings",
        "/riders",
        "/reports/daily",
        "/shop",
      ])
        expect((await api("get", p)).status, p).toBe(401);
    });

    it("keeps owner-only endpoints away from riders and rider-only ones away from the owner", async () => {
      for (const p of ["/riders", "/products", "/notifications", "/audit", "/reports/daily"])
        expect((await api("get", p, kasun)).status, p).toBe(403);
      expect(
        (
          await api("post", "/payments", owner).send({
            customerId: "C101",
            lines: [{ itemId: "IT1", amount: 1 }],
          })
        ).status,
      ).toBe(403);
      expect((await api("post", "/closings", owner).send({ cash: 0 })).status).toBe(403);
    });
  });

  describe("bootstrap", () => {
    it("gives the owner the full dataset in the frontend's shape", async () => {
      const { body } = await api("get", "/bootstrap", owner);
      const d = body.data;
      expect(d.riders).toHaveLength(3);
      expect(d.customers).toHaveLength(12);
      expect(d.items).toHaveLength(15);
      expect(d.products).toHaveLength(9);
      expect(d.audit).toHaveLength(1);
      expect(d.customers[0]).toMatchObject({
        id: "C101",
        riderId: "R1",
        since: expect.any(String),
      });
      expect(d.products[0].freq).toMatch(/^(weekly|monthly)$/);
      expect(d.payments[0]).toMatchObject({
        id: "P1",
        status: expect.stringMatching(/completed|corrected/),
      });
      expect(JSON.stringify(d)).not.toMatch(/passwordHash|password"/);
    });

    it("scopes a rider to their own data and hides cost prices, audit and notifications", async () => {
      const d = (await api("get", "/bootstrap", kasun)).body.data;
      expect(d.riders).toHaveLength(1);
      expect(d.riders[0].id).toBe("R1");
      expect(d.customers.every((c: { riderId: string }) => c.riderId === "R1")).toBe(true);
      expect(d.customers.length).toBe(6);
      expect(d.products).toEqual([]);
      expect(d.audit).toEqual([]);
      expect(d.notifs).toEqual([]);
      expect(d.owner.email).toBe("");
      const itemIds = new Set(d.items.map((i: { id: string }) => i.id));
      expect(d.payments.every((p: { itemId: string }) => itemIds.has(p.itemId))).toBe(true);
    });
  });

  describe("riders", () => {
    it("creates, validates and updates riders; deactivation ends their sessions", async () => {
      expect(
        (
          await api("post", "/riders", owner).send({
            name: "A",
            phone: "123",
            area: "x",
            username: "ab",
            password: "12",
          })
        ).status,
      ).toBe(422);
      const created = await api("post", "/riders", owner).send({
        name: "Test Rider",
        phone: "0711112222",
        area: "Galle",
        username: "Tester",
        password: "abcd",
      });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({
        username: "tester",
        phone: "071 111 2222",
        active: true,
      });
      expect(JSON.stringify(created.body)).not.toMatch(/password/i);
      const dup = await api("post", "/riders", owner).send({
        name: "Dup",
        phone: "0711112223",
        area: "x",
        username: "tester",
        password: "abcd",
      });
      expect(dup.status).toBe(409);

      const agent = request.agent(app);
      await agent
        .post("/api/v1/auth/login")
        .send({ role: "rider", username: "tester", password: "abcd", remember: true });
      const id = created.body.data.id as string;
      const off = await api("patch", `/riders/${id}`, owner).send({ active: false });
      expect(off.body.data.active).toBe(false);
      expect((await agent.post("/api/v1/auth/refresh")).status).toBe(401);
      expect(
        (
          await request(app)
            .post("/api/v1/auth/login")
            .send({ role: "rider", username: "tester", password: "abcd" })
        ).status,
      ).toBe(403);
      expect((await api("patch", "/riders/R999", owner).send({ active: true })).status).toBe(404);
    });
  });

  describe("products & items", () => {
    it("creates products, rejects duplicates and bad input, and adds stock", async () => {
      const body = {
        code: "ab-1",
        name: "Kettle",
        purchase: 1000,
        cash: 1500,
        price: 1800.5,
        freq: "weekly",
        amount: 100.5,
        period: 4,
        stock: 1,
      };
      const ok = await api("post", "/products", owner).send(body);
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({
        code: "AB-1",
        price: 1800.5,
        amount: 100.5,
        stock: 1,
        sold: 0,
      });
      expect((await api("post", "/products", owner).send(body)).status).toBe(409);
      expect(
        (await api("post", "/products", owner).send({ ...body, code: "X", price: 10.123 })).status,
      ).toBe(422);
      expect(
        (await api("post", "/products", owner).send({ ...body, code: "Y", stock: -1 })).status,
      ).toBe(422);
      expect(
        (await api("post", "/products/AB-1/stock", owner).send({ qty: 2 })).body.data.stock,
      ).toBe(3);
      expect((await api("post", "/products/AB-1/stock", owner).send({ qty: 0 })).status).toBe(422);
      expect((await api("post", "/products/NOPE/stock", owner).send({ qty: 1 })).status).toBe(404);
    });

    const sale = (over = {}) => ({
      customerId: "C101",
      code: "AB-1",
      price: 1800.5,
      freq: "weekly",
      period: 4,
      amount: 100.5,
      start: "2026-10-13",
      riderId: "R1",
      ...over,
    });

    it("sells an item: snapshots the name, decrements stock and counts it as sold", async () => {
      const res = await api("post", "/items", owner).send(sale());
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        name: "Kettle",
        price: 1800.5,
        riderId: "R1",
        freq: "weekly",
      });
      const p = await prisma.product.findUniqueOrThrow({ where: { code: "AB-1" } });
      expect([p.stock, p.sold]).toEqual([2, 1]);
    });

    it("validates sales", async () => {
      expect((await api("post", "/items", owner).send(sale({ amount: 2000 }))).status).toBe(422);
      expect((await api("post", "/items", owner).send(sale({ code: "NOPE" }))).status).toBe(422);
      expect((await api("post", "/items", owner).send(sale({ customerId: "C999" }))).status).toBe(
        404,
      );
      expect((await api("post", "/items", owner).send(sale({ riderId: "R999" }))).status).toBe(422);
      expect((await api("post", "/items", owner).send(sale({ start: "13/10/2026" }))).status).toBe(
        422,
      );
    });

    it("never oversells: with 1 unit left, two concurrent sales yield exactly one", async () => {
      await prisma.product.update({ where: { code: "AB-1" }, data: { stock: 1 } });
      const rs = await Promise.all([1, 2].map(() => api("post", "/items", owner).send(sale())));
      expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
      expect((await prisma.product.findUniqueOrThrow({ where: { code: "AB-1" } })).stock).toBe(0);
      expect((await api("post", "/items", owner).send(sale())).body.message).toMatch(
        /out of stock/i,
      );
    });
  });

  describe("customers", () => {
    const body = (over = {}) => ({
      name: "New Person",
      nic: "199912345678",
      phone: "0771239999",
      address: "1 Main St",
      city: "Kottawa",
      lat: 6.84123456,
      lng: 79.96,
      riderId: "R2",
      notes: "",
      ...over,
    });

    it("creates a customer (formatted phone, rounded coordinates) and rejects bad input", async () => {
      const ok = await api("post", "/customers", owner).send(body());
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({
        phone: "077 123 9999",
        lat: 6.84123,
        riderId: "R2",
        photo: "",
      });
      expect((await api("post", "/customers", owner).send(body())).status).toBe(409); // same NIC
      for (const bad of [
        { nic: "123" },
        { name: "ab" },
        { phone: "12345" },
        { lat: null },
        { riderId: "nope" },
        { city: "" },
      ])
        expect(
          (await api("post", "/customers", owner).send(body({ nic: "199900000001", ...bad })))
            .status,
          JSON.stringify(bad),
        ).toBe(422);
    });

    it("lists with search (including digits-only phone search) and pagination", async () => {
      const byName = await api("get", "/customers?q=saman", owner);
      expect(byName.body.data.map((c: { id: string }) => c.id)).toEqual(["C101"]);
      const byPhone = await api("get", "/customers?q=0775123344", owner);
      expect(byPhone.body.data.map((c: { id: string }) => c.id)).toEqual(["C101"]);
      const page = await api("get", "/customers?pageSize=5&page=2", owner);
      expect(page.body.data).toHaveLength(5);
      expect(page.body.meta).toMatchObject({ page: 2, pageSize: 5, total: expect.any(Number) });
    });

    it("limits a rider to their own customers", async () => {
      expect((await api("get", "/customers", kasun)).body.meta.total).toBe(6);
      expect((await api("get", "/customers/C101", kasun)).status).toBe(200);
      expect((await api("get", "/customers/C107", kasun)).status).toBe(404); // Nimal's customer
      expect((await api("get", "/customers/C107", nimal)).status).toBe(200);
    });

    it("reassigns a customer together with all of their items", async () => {
      const res = await api("patch", "/customers/C106/rider", owner).send({ riderId: "R3" });
      expect(res.body.data.riderId).toBe("R3");
      const items = await prisma.item.findMany({ where: { customerId: 106 } });
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.riderId === 3)).toBe(true);
      expect(
        (await api("patch", "/customers/C106/rider", kasun).send({ riderId: "R1" })).status,
      ).toBe(403);
      expect(
        (await api("patch", "/customers/C106/rider", owner).send({ riderId: "R999" })).status,
      ).toBe(422);
    });
  });

  describe("extensions", () => {
    it("lets a rider extend their own customer within 30 days and notifies the owner", async () => {
      const ok = await api("post", "/customers/C101/extensions", kasun).send({
        until: "2026-10-20",
        reason: "Salary on 20th",
      });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({
        customerId: "C101",
        riderId: "R1",
        until: "2026-10-20",
        date: "2026-10-13",
      });
      const n = await api("get", "/notifications", owner);
      expect(
        n.body.data.some(
          (x: { title: string; text: string }) =>
            x.title === "Payment extended" && x.text.includes("Salary on 20th"),
        ),
      ).toBe(true);
    });

    it("rejects past/too-far dates, short reasons, other riders' customers and the owner", async () => {
      const ext = (t: string, b: object) => api("post", "/customers/C101/extensions", t).send(b);
      expect((await ext(kasun, { until: "2026-10-13", reason: "later" })).status).toBe(422); // not after today
      expect((await ext(kasun, { until: "2026-11-13", reason: "later" })).status).toBe(422); // > 30 days
      expect((await ext(kasun, { until: "2026-11-12", reason: "later" })).status).toBe(201); // exactly 30 days
      expect((await ext(kasun, { until: "2026-10-20", reason: "x" })).status).toBe(422);
      expect((await ext(nimal, { until: "2026-10-20", reason: "later" })).status).toBe(404);
      expect((await ext(owner, { until: "2026-10-20", reason: "later" })).status).toBe(403);
    });
  });

  describe("payments", () => {
    // IT1: Steam Iron 6400 for C101 (Kasun). IT8/IT14 belong to other customers.
    const pay = (
      token: string,
      customerId: string,
      lines: { itemId: string; amount: number | string }[],
    ) => api("post", "/payments", token).send({ customerId, lines });
    const balance = async (itemId: number) => {
      const it = await prisma.item.findUniqueOrThrow({ where: { id: itemId } });
      const a = await prisma.payment.aggregate({ where: { itemId }, _sum: { amount: true } });
      return Number(it.price) - Number(a._sum.amount ?? 0);
    };

    it("records a payment with decimals and returns the receipt; creates a txn number and notification", async () => {
      const before = await balance(1);
      const res = await pay(kasun, "C101", [{ itemId: "IT1", amount: "100.55" }]);
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        cust: "Saman Kumara",
        custId: "C101",
        total: 100.55,
        date: "2026-10-13",
        rider: "Kasun Perera",
      });
      expect(res.body.data.lines[0]).toMatchObject({ item: "IR-101 · Steam Iron", amount: 100.55 });
      expect(res.body.data.lines[0].txn).toMatch(/^TX261013-\d{4}$/);
      expect(await balance(1)).toBeCloseTo(before - 100.55, 2);
      const n = await api("get", "/notifications", owner);
      expect(n.body.data[0].text).toContain("Saman Kumara");
    });

    it("rejects overpayment, merging several lines for one item first", async () => {
      const bal = await balance(1);
      const tooMuch = await pay(kasun, "C101", [
        { itemId: "IT1", amount: bal },
        { itemId: "IT1", amount: 1 },
      ]);
      expect(tooMuch.status).toBe(422);
      expect(tooMuch.body.message).toMatch(/exceeds the remaining balance/);
      expect(await balance(1)).toBeCloseTo(bal, 2); // nothing was written
    });

    it("rejects invalid input, foreign customers and items of another customer", async () => {
      expect((await pay(kasun, "C101", [{ itemId: "IT1", amount: 0 }])).status).toBe(422);
      expect((await pay(kasun, "C101", [{ itemId: "IT1", amount: 1.005 }])).status).toBe(422); // 3 decimals
      expect((await pay(kasun, "C101", [])).status).toBe(422);
      expect((await pay(nimal, "C101", [{ itemId: "IT1", amount: 10 }])).status).toBe(404); // not Nimal's customer
      expect((await pay(kasun, "C101", [{ itemId: "IT8", amount: 10 }])).status).toBe(422); // IT8 is C107's
    });

    it("is atomic: a failing second line rolls back the first", async () => {
      const before = await prisma.payment.count();
      const r = await pay(kasun, "C102", [
        { itemId: "IT2", amount: 10 },
        { itemId: "IT3", amount: 999999 },
      ]);
      expect(r.status).toBe(422);
      expect(await prisma.payment.count()).toBe(before);
    });

    it("never overpays under concurrency: two requests for the full balance, one wins", async () => {
      const bal = await balance(1);
      const rs = await Promise.all(
        [1, 2].map(() => pay(kasun, "C101", [{ itemId: "IT1", amount: bal }])),
      );
      expect(rs.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await balance(1)).toBeCloseTo(0, 2);
      expect((await pay(kasun, "C101", [{ itemId: "IT1", amount: 1 }])).body.message).toMatch(
        /fully paid/,
      );
    });

    it("lets the owner correct a payment with an audit entry, and blocks bad corrections", async () => {
      const p = await prisma.payment.findFirstOrThrow({
        where: { itemId: 2, status: "COMPLETED" },
        orderBy: { id: "asc" },
      });
      const id = `P${p.id}`;
      const fix = (b: object, t = owner) => api("patch", `/payments/${id}`, t).send(b);
      expect((await fix({ amount: Number(p.amount), reason: "same amount" })).status).toBe(422);
      expect((await fix({ amount: 50, reason: "x" })).status).toBe(422);
      expect((await fix({ amount: 99999999, reason: "way too much" })).status).toBe(422); // above item price
      expect((await fix({ amount: 50, reason: "valid reason" }, kasun)).status).toBe(403);
      const ok = await fix({ amount: 50.25, reason: "Rider typed wrong amount" });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ amount: 50.25, status: "corrected" });
      const audit = await api("get", "/audit", owner);
      expect(audit.body.data[0]).toMatchObject({
        action: "Payment amount corrected",
        nw: "Rs. 50.25",
        reason: "Rider typed wrong amount",
        user: "Shop Owner",
      });
      expect(
        (await api("patch", "/payments/P999999", owner).send({ amount: 5, reason: "not there" }))
          .status,
      ).toBe(404);
    });

    it("lists payments filtered, paginated and scoped to the caller", async () => {
      const mine = await api("get", "/payments?pageSize=200", kasun);
      expect(mine.body.data.every((p: { riderId: string }) => p.riderId === "R1")).toBe(true);
      const ownerDay = await api("get", "/payments?date=2026-10-13&pageSize=200", owner);
      expect(ownerDay.body.data.every((p: { date: string }) => p.date === "2026-10-13")).toBe(true);
      expect(ownerDay.body.meta.total).toBeGreaterThan(0);
    });
  });

  describe("daily closing", () => {
    it("computes totals on the server, demands a note for differences, and allows one per day", async () => {
      const mineToday = await prisma.payment.findMany({
        where: { riderId: 1, date: new Date("2026-10-13T00:00:00Z") },
      });
      const collected = mineToday.reduce((a, p) => a + Number(p.amount), 0);

      const noNote = await api("post", "/closings", kasun).send({ cash: collected + 10 });
      expect(noNote.status).toBe(422);
      expect(noNote.body.message).toMatch(/add a note/i);

      const ok = await api("post", "/closings", kasun).send({
        cash: collected - 5,
        note: "Rs 5 short",
        expected: 1,
        collected: 999999,
        pending: 1,
        count: 42, // client values ignored
      });
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({
        riderId: "R1",
        date: "2026-10-13",
        count: mineToday.length,
        note: "Rs 5 short",
      });
      expect(ok.body.data.collected).toBeCloseTo(collected, 2);
      expect(ok.body.data.expected).toBeGreaterThan(1);

      expect((await api("post", "/closings", kasun).send({ cash: 0, note: "again" })).status).toBe(
        409,
      );
      const n = await api("get", "/notifications", owner);
      expect(n.body.data[0].text).toMatch(
        /Kasun Perera · collected .* cash submitted .* \(difference −Rs\. 5\)/,
      );

      expect((await api("get", "/closings", kasun)).body.data).toHaveLength(1);
      expect((await api("get", "/closings", nimal)).body.data).toHaveLength(0);
      expect((await api("get", "/closings", owner)).body.data).toHaveLength(1);
    });

    it("accepts a matching amount without a note", async () => {
      const ok = await api("post", "/closings", nimal).send({ cash: 0 });
      // Nimal collected nothing today in the seed except possibly one payment; use the exact figure.
      if (ok.status === 422) {
        const sum = (
          await prisma.payment.aggregate({
            where: { riderId: 2, date: new Date("2026-10-13T00:00:00Z") },
            _sum: { amount: true },
          })
        )._sum.amount;
        expect((await api("post", "/closings", nimal).send({ cash: Number(sum) })).status).toBe(
          201,
        );
      } else expect(ok.status).toBe(201);
    });
  });

  describe("notifications", () => {
    it("marks all as read", async () => {
      expect(
        (await api("get", "/notifications", owner)).body.data.some(
          (n: { read: boolean }) => !n.read,
        ),
      ).toBe(true);
      expect((await api("post", "/notifications/read-all", owner)).status).toBe(200);
      expect(
        (await api("get", "/notifications", owner)).body.data.every(
          (n: { read: boolean }) => n.read,
        ),
      ).toBe(true);
    });

    it("creates overdue alerts once per customer per day", async () => {
      const first = await runOverdueAlerts("2026-10-14");
      expect(first.created).toBeGreaterThan(0);
      expect((await runOverdueAlerts("2026-10-14")).created).toBe(0); // idempotent
      expect((await runOverdueAlerts("2026-10-15")).created).toBeGreaterThan(0); // new day, new alerts
      const list = await api("get", "/notifications", owner);
      expect(
        list.body.data.some(
          (n: { type: string; title: string }) =>
            n.type === "overdue" && n.title === "Overdue alert",
        ),
      ).toBe(true);
    });
  });

  describe("reports", () => {
    it("builds every report type in the UI's row/column shape", async () => {
      for (const t of ["daily", "monthly", "person", "item", "rider", "overdue"]) {
        const r = await api("get", `/reports/${t}?date=2026-10-13&month=2026-10`, owner);
        expect(r.status, t).toBe(200);
        expect(r.body.data.title).toEqual(expect.any(String));
        expect(r.body.data.cols.length).toBeGreaterThan(0);
        expect(Array.isArray(r.body.data.rows)).toBe(true);
        for (const row of r.body.data.rows) expect(row).toHaveLength(r.body.data.cols.length);
      }
    });

    it("returns CSV on request and validates parameters", async () => {
      const csv = await api("get", "/reports/person?format=csv", owner);
      expect(csv.headers["content-type"]).toMatch(/text\/csv/);
      expect(csv.headers["content-disposition"]).toMatch(/person-report\.csv/);
      expect(csv.text.split("\n")[0]).toContain('"Customer"');
      expect((await api("get", "/reports/nope", owner)).status).toBe(422);
      expect((await api("get", "/reports/daily?date=bad", owner)).status).toBe(422);
    });
  });

  describe("shop", () => {
    it("lets anyone signed in read the shop, but only the owner change it", async () => {
      expect((await api("get", "/shop", kasun)).body.data.name).toBe("COLLECTO Demo Shop");
      expect((await api("patch", "/shop", kasun).send({ name: "Hacked" })).status).toBe(403);
      expect((await api("patch", "/shop", owner).send({ name: "" })).status).toBe(422);
      expect(
        (await api("patch", "/shop", owner).send({ phone: "011 000 0000" })).body.data,
      ).toMatchObject({ name: "COLLECTO Demo Shop", phone: "011 000 0000" });
    });
  });

  describe("photo uploads", () => {
    const upload = (
      path: string,
      token: string,
      file: Buffer | string,
      name = "p.png",
      type = "image/png",
    ) =>
      request(app)
        .put(`/api/v1${path}`)
        .set("Authorization", `Bearer ${token}`)
        .attach("photo", Buffer.from(file), { filename: name, contentType: type });
    const nameOf = (url: string) => url.split("/").pop()!;

    it("stores a photo under a random name, serves it, and deletes the old file on replace", async () => {
      const first = await upload("/customers/C101/photo", owner, PNG);
      expect(first.status).toBe(200);
      const a = nameOf(first.body.data.photo);
      expect(a).toMatch(/^[0-9a-f-]{36}\.png$/);
      const served = await request(app).get(`/uploads/${a}`);
      expect(served.status).toBe(200);
      expect(served.headers["content-type"]).toMatch(/image\/png/);

      const second = await upload("/customers/C101/photo", owner, PNG);
      const b = nameOf(second.body.data.photo);
      expect(b).not.toBe(a);
      expect((await request(app).get(`/uploads/${a}`)).status).toBe(404);
      expect((await request(app).get(`/uploads/${b}`)).status).toBe(200);
    });

    it("supports rider (self and by owner) and owner photos", async () => {
      expect((await upload("/riders/me/photo", kasun, PNG)).body.data.photo).toMatch(/\.png$/);
      expect((await upload("/riders/R2/photo", owner, PNG)).body.data.photo).toMatch(/\.png$/);
      expect((await upload("/shop/owner-photo", owner, PNG)).body.data.photo).toMatch(/\.png$/);
    });

    it("rejects non-images (even with an image mimetype), oversized files, missing files and wrong roles", async () => {
      expect(
        (await upload("/customers/C101/photo", owner, "<html>not an image</html>", "x.png")).status,
      ).toBe(422);
      const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024 + 10)]);
      expect((await upload("/customers/C101/photo", owner, big)).status).toBe(413);
      expect((await api("put", "/customers/C101/photo", owner)).status).toBe(422);
      expect((await upload("/customers/C101/photo", kasun, PNG)).status).toBe(403);
      expect((await upload("/customers/C999/photo", owner, PNG)).status).toBe(404);
      expect((await upload("/riders/me/photo", owner, PNG)).status).toBe(403);
    });

    it("does not serve path traversal or directory listings", async () => {
      expect(
        (await request(app).get("/uploads/..%2f..%2fpackage.json")).status,
      ).toBeGreaterThanOrEqual(400);
      expect((await request(app).get("/uploads/")).status).toBe(404);
    });
  });

  describe("dev reset", () => {
    it("restores the demo data (non-production only)", async () => {
      const res = await api("post", "/dev/reset", owner);
      expect(res.status).toBe(200);
      expect(await prisma.customer.count()).toBe(12);
      expect(await prisma.payment.count({ where: { status: "CORRECTED" } })).toBe(1);
      expect((await api("post", "/dev/reset", kasun)).status).toBe(403);
    }, 60_000);
  });
});
