import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../prisma/seed.js";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { authenticate } from "../../src/middlewares/authenticate.js";
import { authorize } from "../../src/middlewares/authorize.js";
import { errorHandler } from "../../src/middlewares/error-handler.js";
import { createLoginLimiter } from "../../src/middlewares/rate-limit.js";

const app = createApp();
const owner = { role: "owner", username: "owner@collecto.lk", password: "owner123" };
const kasun = { role: "rider", username: "kasun", password: "1234" };

const refreshCookie = (res: request.Response) =>
  (res.headers["set-cookie"] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith("collecto_rt="))
    ?.split(";")[0];

const login = (body: object) => request(app).post("/api/v1/auth/login").send(body);

describe.skipIf(!process.env.TEST_DATABASE_URL)("auth", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
  }, 60_000);
  afterEach(async () => {
    await prisma.user.updateMany({ data: { active: true } });
  });

  describe("login", () => {
    it("signs the owner in by email or username and sets an httpOnly refresh cookie", async () => {
      const res = await login(owner);
      expect(res.status).toBe(200);
      expect(res.body.data.session).toEqual({ role: "owner" });
      expect(res.body.data.accessToken).toEqual(expect.any(String));
      expect(res.body.data.expiresIn).toBe(900);
      const cookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(cookie).not.toMatch(/Expires|Max-Age/i); // session cookie when "remember" is false
      expect((await login({ ...owner, username: "OWNER" })).status).toBe(200);
    });

    it("never leaks hashes or tokens in the body", async () => {
      const res = await login(owner);
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/passwordHash|argon2|refreshToken/);
    });

    it("signs a rider in by username or phone number, and persists the cookie when remembered", async () => {
      const a = await login({ ...kasun, remember: true });
      expect(a.body.data.session).toEqual({ role: "rider", riderId: "R1" });
      expect((a.headers["set-cookie"] as unknown as string[])[0]).toMatch(/Max-Age=/i);
      expect((await login({ ...kasun, username: "0772458812" })).status).toBe(200);
      expect((await login({ ...kasun, username: "077 245 8812" })).status).toBe(200);
    });

    it("gives the same 401 for a wrong password, unknown user and wrong role tab", async () => {
      const bad = await login({ ...kasun, password: "nope" });
      const unknown = await login({ ...kasun, username: "ghost" });
      const wrongTab = await login({ ...kasun, role: "owner" });
      for (const r of [bad, unknown, wrongTab]) {
        expect(r.status).toBe(401);
        expect(r.body.message).toBe("Incorrect username or password.");
      }
    });

    it("blocks an inactive rider with 403 only after the password is verified", async () => {
      await prisma.user.update({ where: { username: "kasun" }, data: { active: false } });
      const ok = await login(kasun);
      expect(ok.status).toBe(403);
      expect(ok.body.message).toMatch(/inactive/i);
      expect((await login({ ...kasun, password: "wrong" })).status).toBe(401);
    });

    it("validates the body", async () => {
      const res = await login({ role: "owner", username: "", password: "" });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect((await login({ role: "admin", username: "a", password: "b" })).status).toBe(422);
    });
  });

  describe("access tokens", () => {
    it("GET /auth/me works with a token and rejects missing, garbage, expired and forged tokens", async () => {
      const { body } = await login(kasun);
      const me = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.data.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.data.user.id).toBe("R1");

      expect((await request(app).get("/api/v1/auth/me")).status).toBe(401);
      expect(
        (await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer junk")).status,
      ).toBe(401);

      const expired = jwt.sign({ role: "RIDER" }, env.JWT_ACCESS_SECRET, {
        subject: "1",
        expiresIn: -10,
      });
      const exp = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expired}`);
      expect(exp.status).toBe(401);
      expect(exp.body.errors[0].code).toBe("token_expired");

      const forged = jwt.sign({ role: "OWNER" }, "x".repeat(40), { subject: "4" });
      expect(
        (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${forged}`)).status,
      ).toBe(401);
      const none = jwt.sign({ role: "OWNER" }, "", { algorithm: "none", subject: "4" });
      expect(
        (await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${none}`)).status,
      ).toBe(401);
    });

    it("rejects a still-valid token the moment the rider is deactivated", async () => {
      const { body } = await login(kasun);
      await prisma.user.update({ where: { username: "kasun" }, data: { active: false } });
      const me = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.data.accessToken}`);
      expect(me.status).toBe(401);
    });

    it("authorize() lets the right role through and returns 403 otherwise", async () => {
      const t = express();
      t.get("/owner-only", authenticate, authorize("OWNER"), (_q, r) => void r.json({ ok: true }));
      t.use(errorHandler);
      const own = (await login(owner)).body.data.accessToken;
      const rid = (await login(kasun)).body.data.accessToken;
      expect(
        (await request(t).get("/owner-only").set("Authorization", `Bearer ${own}`)).status,
      ).toBe(200);
      expect(
        (await request(t).get("/owner-only").set("Authorization", `Bearer ${rid}`)).status,
      ).toBe(403);
    });
  });

  describe("refresh rotation", () => {
    it("issues a new access token and a new cookie, and the old cookie stops working", async () => {
      const a = refreshCookie(await login(kasun))!;
      const r = await request(app).post("/api/v1/auth/refresh").set("Cookie", a);
      expect(r.status).toBe(200);
      const b = refreshCookie(r)!;
      expect(b).toBeDefined();
      expect(b).not.toBe(a);
      expect(r.body.data.accessToken).toEqual(expect.any(String));
      // replay inside the grace window: rejected but the new token survives
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", a)).status).toBe(401);
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", b)).status).toBe(200);
    });

    it("revokes the whole family when an old token is replayed after the grace window", async () => {
      const a = refreshCookie(await login(kasun))!;
      const b = refreshCookie(await request(app).post("/api/v1/auth/refresh").set("Cookie", a))!;
      await prisma.refreshToken.updateMany({
        where: { revokedAt: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", a)).status).toBe(401); // theft signal
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", b)).status).toBe(401); // family dead
    });

    it("rejects missing, unknown and expired refresh tokens, and clears the cookie", async () => {
      const none = await request(app).post("/api/v1/auth/refresh");
      expect(none.status).toBe(401);
      expect(none.headers["set-cookie"]?.[0]).toMatch(/collecto_rt=;/);
      expect(
        (await request(app).post("/api/v1/auth/refresh").set("Cookie", "collecto_rt=bogus")).status,
      ).toBe(401);

      const c = refreshCookie(await login(kasun))!;
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", c)).status).toBe(401);
    });

    it("refuses to refresh a deactivated rider", async () => {
      const c = refreshCookie(await login(kasun))!;
      await prisma.user.update({ where: { username: "kasun" }, data: { active: false } });
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", c)).status).toBe(401);
    });

    it("rejects cookie-based calls from an untrusted Origin (CSRF guard)", async () => {
      const c = refreshCookie(await login(kasun))!;
      const evil = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", c)
        .set("Origin", "http://evil.test");
      expect(evil.status).toBe(403);
      const good = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", c)
        .set("Origin", "http://localhost:3000");
      expect(good.status).toBe(200);
    });
  });

  describe("logout", () => {
    it("revokes the session so the refresh token no longer works, and is idempotent", async () => {
      const c = refreshCookie(await login(kasun))!;
      const out = await request(app).post("/api/v1/auth/logout").set("Cookie", c);
      expect(out.status).toBe(200);
      expect(out.headers["set-cookie"]?.[0]).toMatch(/collecto_rt=;/);
      expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", c)).status).toBe(401);
      expect((await request(app).post("/api/v1/auth/logout")).status).toBe(200);
    });
  });

  describe("login rate limit", () => {
    it("returns 429 after too many attempts", async () => {
      const t = express();
      t.use(express.json());
      t.post("/login", createLoginLimiter(2), (_q, r) => void r.status(401).json({}));
      await request(t).post("/login").send({});
      await request(t).post("/login").send({});
      expect((await request(t).post("/login").send({})).status).toBe(429);
    });
  });
});
