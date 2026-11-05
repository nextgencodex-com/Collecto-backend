// Regression tests for issues found while reviewing phases 1-5 (see git_commits.md, "Phase 5b").
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";

const app = createApp();
const api = (m: "get" | "post" | "patch" | "put", path: string, token?: string) => {
  const r = request(app)[m](`/api/v1${path}`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const login = (role: string, username: string, password: string) =>
  request(app).post("/api/v1/auth/login").send({ role, username, password });
const token = async (role: string, u: string, p: string) =>
  (await login(role, u, p)).body.data.accessToken as string;
const cookieOf = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith("collecto_rt="))
    ?.split(";")[0];
const TODAY = "2026-10-13";

describe.skipIf(!process.env.TEST_DATABASE_URL)("regressions", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, TODAY);
  }, 60_000);

  describe("two tabs refreshing at once (race)", () => {
    it("lets one win, rejects the other WITHOUT clearing the cookie, and the session survives", async () => {
      const a = cookieOf(await login("rider", "kasun", "1234"))!;
      const [r1, r2] = await Promise.all([
        request(app).post("/api/v1/auth/refresh").set("Cookie", a),
        request(app).post("/api/v1/auth/refresh").set("Cookie", a),
      ]);
      const [win, lose] = r1.status === 200 ? [r1, r2] : [r2, r1];
      expect(win.status).toBe(200);
      expect(lose.status).toBe(401);
      // The loser must not delete the cookie that the winner just rotated in the browser's jar.
      const cleared = (lose.headers["set-cookie"] as unknown as string[] | undefined)?.some((c) =>
        /^collecto_rt=;/.test(c),
      );
      expect(cleared ?? false).toBe(false);
      // and the winner's new token still works
      expect(
        (await request(app).post("/api/v1/auth/refresh").set("Cookie", cookieOf(win)!)).status,
      ).toBe(200);
    });
  });

  describe("item rider vs customer rider", () => {
    const sale = (riderId?: string) => ({
      customerId: "C101",
      code: "IR-101",
      price: 6400,
      freq: "weekly",
      period: 4,
      amount: 400,
      start: TODAY,
      ...(riderId ? { riderId } : {}),
    });

    it("rejects an item whose rider differs from the customer's rider", async () => {
      const owner = await token("owner", "owner", "owner123");
      const res = await api("post", "/items", owner).send(sale("R2")); // C101 belongs to R1
      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/customer's rider/i);
    });

    it("uses the customer's rider when none is given, or when it matches", async () => {
      const owner = await token("owner", "owner", "owner123");
      expect((await api("post", "/items", owner).send(sale())).body.data.riderId).toBe("R1");
      expect((await api("post", "/items", owner).send(sale("R1"))).body.data.riderId).toBe("R1");
    });
  });

  describe("after a customer is reassigned mid-day", () => {
    it("keeps the previous rider's closing, history and payment lists consistent", async () => {
      const owner = await token("owner", "owner", "owner123");
      const kasun = await token("rider", "kasun", "1234");
      const tharindu = await token("rider", "tharindu", "1234");

      const paid = await api("post", "/payments", kasun).send({
        customerId: "C101",
        lines: [{ itemId: "IT1", amount: 10 }],
      });
      expect(paid.status).toBe(201);
      await api("patch", "/customers/C101/rider", owner).send({ riderId: "R3" });

      // the new rider sees the payment taken on their (now) customer, in both the list and the bootstrap
      const txn = paid.body.data.lines[0].txn as string;
      const listed = await api("get", "/payments?pageSize=200", tharindu);
      expect(listed.body.data.map((p: { txn: string }) => p.txn)).toContain(txn);
      const boot = await api("get", "/bootstrap", tharindu);
      expect(boot.body.data.payments.map((p: { txn: string }) => p.txn)).toContain(txn);

      // the collecting rider still sees their own collection everywhere ...
      const kList = await api("get", "/payments?pageSize=200", kasun);
      expect(kList.body.data.map((p: { txn: string }) => p.txn)).toContain(txn);
      const kBoot = await api("get", "/bootstrap", kasun);
      expect(kBoot.body.data.payments.map((p: { txn: string }) => p.txn)).toContain(txn);

      // ... and their closing counts all the cash they collected today, whoever owns the customer now
      const mine = await prisma.payment.aggregate({
        where: { riderId: 1, date: new Date(`${TODAY}T00:00:00Z`) },
        _sum: { amount: true },
        _count: true,
      });
      const closing = await api("post", "/closings", kasun).send({
        cash: Number(mine._sum.amount),
      });
      expect(closing.status).toBe(201);
      expect(closing.body.data.collected).toBeCloseTo(Number(mine._sum.amount), 2);
      expect(closing.body.data.count).toBe(mine._count);
    });
  });
});
