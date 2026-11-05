// Checks for behaviour that was previously only claimed or assumed (git_commits.md, "Phase 5b").
import { readFileSync } from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { seedDatabase } from "../../src/db/seed.js";
import { runOverdueAlerts, startOverdueJob } from "../../src/jobs/overdue.js";
import { bootstrap } from "../../src/modules/bootstrap/bootstrap.service.js";
import type { AuthUser } from "../../src/types/express.js";

const app = createApp();
const TODAY = "2026-10-13";
const api = (m: "get" | "post" | "patch" | "put", p: string, token?: string) => {
  const r = request(app)[m](`/api/v1${p}`);
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
const ownerUser: AuthUser = { id: 0, role: "OWNER", username: "owner", name: "Shop Owner" };
const kasunUser: AuthUser = { id: 1, role: "RIDER", username: "kasun", name: "Kasun Perera" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!process.env.TEST_DATABASE_URL)("hardening", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, TODAY);
  }, 60_000);

  describe("overdue alert job", () => {
    it("really fires on its schedule (per-second cron) and writes the day's alerts", async () => {
      await prisma.notification.deleteMany({ where: { type: "OVERDUE" } });
      const task = startOverdueJob({ expression: "* * * * * *" });
      expect(task).not.toBeNull();
      await sleep(2600);
      await task!.stop();
      const alerts = await prisma.notification.findMany({ where: { type: "OVERDUE" } });
      // the prototype situation: 4 customers are overdue
      expect(alerts).toHaveLength(4);
      expect(alerts.every((a) => a.dedupeKey?.endsWith(`:${TODAY}`))).toBe(true);
      expect(alerts.every((a) => a.userId === 0)).toBe(true);
    });

    it("skips when another instance holds the advisory lock, then runs once it is released", async () => {
      await prisma.notification.deleteMany({ where: { type: "OVERDUE" } });
      const skipped = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(727001)`; // "instance A" is mid-run
        return runOverdueAlerts("2026-10-20"); // "instance B"
      });
      expect(skipped).toEqual({ created: 0, skipped: true });
      expect(await prisma.notification.count({ where: { type: "OVERDUE" } })).toBe(0);
      const after = await runOverdueAlerts("2026-10-20");
      expect(after.skipped).toBe(false);
      expect(after.created).toBeGreaterThan(0);
    });

    it("never duplicates alerts when two instances run at the same moment", async () => {
      const runs = await Promise.all([
        runOverdueAlerts("2026-10-21"),
        runOverdueAlerts("2026-10-21"),
        runOverdueAlerts("2026-10-21"),
      ]);
      const created = runs.reduce((a, r) => a + r.created, 0);
      const stored = await prisma.notification.count({
        where: { dedupeKey: { endsWith: ":2026-10-21" } },
      });
      expect(stored).toBe(created);
      const keys = (
        await prisma.notification.findMany({ where: { dedupeKey: { endsWith: ":2026-10-21" } } })
      ).map((n) => n.dedupeKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  describe("refresh grace window boundary", () => {
    const rotate = async () => {
      const a = cookieOf(await login("rider", "kasun", "1234"))!;
      const b = cookieOf(await request(app).post("/api/v1/auth/refresh").set("Cookie", a))!;
      return { a, b };
    };
    const backdate = (secondsAgo: number) =>
      prisma.refreshToken.updateMany({
        where: { revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - secondsAgo * 1000) },
      });

    it("9 seconds after rotation a replay is a harmless race: rejected, but the session survives", async () => {
      const { a, b } = await rotate();
      await backdate(9);
      const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", a);
      expect(replay.status).toBe(401);
      expect(
        (replay.headers["set-cookie"] as unknown as string[] | undefined)?.some((c) =>
          /^collecto_rt=;/.test(c),
        ) ?? false,
      ).toBe(false);
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", b)).status).toBe(200);
    });

    it("11 seconds after rotation a replay is treated as theft: the whole family is revoked", async () => {
      const { a, b } = await rotate();
      await backdate(11);
      const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", a);
      expect(replay.status).toBe(401);
      expect(
        (replay.headers["set-cookie"] as unknown as string[]).some((c) => /^collecto_rt=;/.test(c)),
      ).toBe(true);
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", b)).status).toBe(401);
    });
  });

  describe("database pool", () => {
    it("never opens more connections than DB_POOL_MAX, even under a burst", async () => {
      const rows = await Promise.all(
        Array.from(
          { length: 40 },
          () =>
            prisma.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid FROM (SELECT pg_sleep(0.05)) s`,
        ),
      );
      const pids = new Set(rows.map((r) => r[0]!.pid));
      expect(pids.size).toBeGreaterThan(1);
      expect(pids.size).toBeLessThanOrEqual(env.DB_POOL_MAX);
    });
  });

  describe("customer status filter", () => {
    const ids = (r: request.Response) => r.body.data.map((c: { id: string }) => c.id).sort();

    it("filters by derived status, case-insensitively, and the five statuses partition all customers", async () => {
      const owner = await token("owner", "owner", "owner123");
      const overdue = await api("get", "/customers?status=OVERDUE", owner);
      expect(ids(overdue)).toEqual(["C102", "C104", "C106", "C108"]); // the prototype's four overdue customers
      expect(overdue.body.meta.total).toBe(4);
      expect(ids(await api("get", "/customers?status=overdue", owner))).toEqual(ids(overdue));

      let all: string[] = [];
      for (const s of ["PAID", "DUE", "OVERDUE", "UPCOMING", "DONE"])
        all = all.concat(ids(await api("get", `/customers?status=${s}&pageSize=200`, owner)));
      expect(all.sort()).toEqual(Array.from({ length: 12 }, (_, i) => `C${101 + i}`).sort());
    });

    it("combines with search, paging and rider scope, and rejects unknown statuses", async () => {
      const owner = await token("owner", "owner", "owner123");
      const kasun = await token("rider", "kasun", "1234");
      expect(ids(await api("get", "/customers?status=OVERDUE&q=chamari", owner))).toEqual(["C104"]);
      const page = await api("get", "/customers?status=OVERDUE&pageSize=2&page=2", owner);
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toMatchObject({ total: 4, pages: 2 });
      expect(ids(await api("get", "/customers?status=OVERDUE", kasun))).toEqual([
        "C102",
        "C104",
        "C106",
      ]); // R1 only
      expect((await api("get", "/customers?status=LATE", owner)).status).toBe(422);
    });
  });

  describe("rider ids are gap-free", () => {
    const mk = (n: number, username = `rider${n}`) =>
      request(app)
        .post("/api/v1/riders")
        .set("Authorization", `Bearer ${tokens.owner}`)
        .send({
          name: `Rider ${n}`,
          phone: `07100000${String(n).padStart(2, "0")}`,
          area: "Galle",
          username,
          password: "abcd",
        });
    const tokens = { owner: "" };
    beforeAll(async () => {
      tokens.owner = await token("owner", "owner", "owner123");
    });

    it("keeps the owner at id 0 and numbers new riders R4, R5, ... with no gaps", async () => {
      expect((await prisma.user.findFirstOrThrow({ where: { role: "OWNER" } })).id).toBe(0);
      expect((await mk(4)).body.data.id).toBe("R4");
      expect((await mk(5, "rider4")).status).toBe(409); // duplicate username: nothing is consumed
      expect((await mk(5)).body.data.id).toBe("R5");
    });

    it("stays contiguous when riders are created concurrently", async () => {
      const rs = await Promise.all([6, 7, 8, 9].map((n) => mk(n)));
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(rs.map((r) => r.body.data.id).sort()).toEqual(["R6", "R7", "R8", "R9"]);
      const all = (
        await prisma.user.findMany({ where: { role: "RIDER" }, orderBy: { id: "asc" } })
      ).map((u) => u.id);
      expect(all).toEqual(Array.from({ length: all.length }, (_, i) => i + 1));
    });

    it("the database refuses an owner that is not id 0 or a rider with id 0 or below", async () => {
      await expect(
        prisma.user.create({
          data: {
            id: 50,
            role: "OWNER",
            username: "o2",
            email: "o2@x.lk",
            name: "x",
            passwordHash: "x",
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.user.create({
          data: { id: -1, role: "RIDER", username: "neg", name: "x", passwordHash: "x", area: "a" },
        }),
      ).rejects.toThrow();
    });

    it("the migration closes existing gaps and keeps every reference attached to the right rider", async () => {
      await seedDatabase(prisma, TODAY);
      for (const [id, n] of [
        [7, 1],
        [12, 2],
      ] as const)
        await prisma.user.create({
          data: {
            id,
            role: "RIDER",
            username: `gap${n}`,
            name: `Gap ${n}`,
            phone: `07200000${n}0`,
            area: "x",
            passwordHash: "x",
          },
        });
      await prisma.customer.update({ where: { id: 101 }, data: { riderId: 12 } });
      await prisma.item.updateMany({ where: { customerId: 101 }, data: { riderId: 12 } });

      const sql = readFileSync(
        path.resolve(
          "prisma/migrations/20261105140000_owner_id_zero_contiguous_riders/migration.sql",
        ),
        "utf8",
      );
      const statements = sql
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3); // owner -> 0, then the two-phase rider renumbering (the CHECK already exists)
      for (const s of statements) await prisma.$executeRawUnsafe(s);

      const riders = await prisma.user.findMany({
        where: { role: "RIDER" },
        orderBy: { id: "asc" },
        select: { id: true, username: true },
      });
      expect(riders.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
      expect(riders.map((r) => r.username)).toEqual(["kasun", "nimal", "tharindu", "gap1", "gap2"]); // order preserved
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: 101 } })).riderId).toBe(5); // followed gap2
      expect((await prisma.item.findFirstOrThrow({ where: { customerId: 101 } })).riderId).toBe(5);
    });
  });

  describe("bootstrap payment window", () => {
    const sumPaise = (xs: { amount: number }[]) =>
      Math.round(xs.reduce((a, p) => a + p.amount * 100, 0));

    it("sends only recent payments but keeps each item's total via priorPaid", async () => {
      await seedDatabase(prisma, TODAY);
      const full = await bootstrap(ownerUser, { paymentDays: 0 });
      const win = await bootstrap(ownerUser, { paymentDays: 30 });

      expect(full.paymentsFrom).toBeNull();
      expect(full.items.every((i) => i.priorPaid === 0)).toBe(true);
      expect(win.today).toBe(TODAY);
      expect(win.paymentsFrom).toBe("2026-09-13");
      expect(win.payments.length).toBeGreaterThan(0);
      expect(win.payments.length).toBeLessThan(full.payments.length);
      expect(win.payments.every((p) => p.date >= "2026-09-13")).toBe(true);

      for (const item of full.items) {
        const wItem = win.items.find((i) => i.id === item.id)!;
        const total = sumPaise(full.payments.filter((p) => p.itemId === item.id));
        const viaWindow =
          Math.round(wItem.priorPaid * 100) +
          sumPaise(win.payments.filter((p) => p.itemId === item.id));
        expect(viaWindow, item.id).toBe(total);
      }
      expect(win.items.some((i) => i.priorPaid > 0)).toBe(true);
    });

    it("applies the same window to a rider, including payments they collected on reassigned customers", async () => {
      const win = await bootstrap(kasunUser, { paymentDays: 30 });
      expect(win.paymentsFrom).toBe("2026-09-13");
      expect(win.payments.every((p) => p.date >= "2026-09-13")).toBe(true);
      expect(win.customers.every((c) => c.riderId === "R1")).toBe(true);
      expect(win.products).toEqual([]);
    });

    it("is served by GET /bootstrap with today and paymentsFrom", async () => {
      const res = await api("get", "/bootstrap", await token("owner", "owner", "owner123"));
      expect(res.body.data).toMatchObject({ today: TODAY, paymentsFrom: null });
      expect(res.body.data.items[0]).toHaveProperty("priorPaid", 0);
    });
  });

  describe("seeded timestamps honour APP_TZ", () => {
    it("shows the seeded audit correction at 18:40 shop time, whatever the server's own zone", async () => {
      await seedDatabase(prisma, TODAY);
      const audit = await api("get", "/audit", await token("owner", "owner", "owner123"));
      expect(audit.body.data[0]).toMatchObject({
        time: "18:40",
        date: "2026-09-15",
        action: "Payment amount corrected",
      });
    });
  });

  describe("seed without the avatar folder", () => {
    it("still seeds everything and simply leaves photos empty", async () => {
      const r = await seedDatabase(prisma, TODAY, {
        avatarsDir: path.resolve("definitely", "missing"),
      });
      expect(r.customers).toBe(12);
      expect(await prisma.user.count({ where: { photoPath: { not: null } } })).toBe(0);
      expect(await prisma.customer.count({ where: { photoPath: { not: null } } })).toBe(0);
    }, 60_000);
  });
});
