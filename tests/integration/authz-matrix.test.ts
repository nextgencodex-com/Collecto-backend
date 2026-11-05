// Exhaustive authorization check, generated from the same registry as the API documentation: every
// documented endpoint must reject missing/garbage/expired tokens, and must reject the wrong role, so a new
// endpoint cannot ship without its auth being tested.
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { env } from "../../src/config/env.js";
import { seedDatabase } from "../../src/db/seed.js";
import { documentedRoutes } from "../../src/docs/openapi.js";

const app = createApp();
const login = async (role: string, u: string, p: string) =>
  (await request(app).post("/api/v1/auth/login").send({ role, username: u, password: p })).body.data
    .accessToken as string;

/** "/customers/{id}/rider" -> "/customers/C101/rider" */
function url(path: string): string {
  const id = path.startsWith("/riders") ? "R1" : path.startsWith("/payments") ? "P1" : "C101";
  return (
    "/api/v1" + path.replace("{id}", id).replace("{code}", "IR-101").replace("{type}", "daily")
  );
}
const send = (method: string, path: string, token?: string) => {
  const r = (request(app) as unknown as Record<string, (u: string) => request.Test>)[method]!(
    url(path),
  );
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

const protectedRoutes = documentedRoutes.filter((r) => r.auth !== "none");
const roleOnly = documentedRoutes.filter((r) => r.auth === "owner" || r.auth === "rider");

describe.skipIf(!process.env.TEST_DATABASE_URL)("authorization matrix", () => {
  let owner: string;
  let rider: string;
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
    [owner, rider] = await Promise.all([
      login("owner", "owner", "owner123"),
      login("rider", "kasun", "1234"),
    ]);
  }, 60_000);

  it("covers a meaningful number of endpoints (guards against the registry silently emptying)", () => {
    expect(protectedRoutes.length).toBeGreaterThan(25);
    expect(roleOnly.length).toBeGreaterThan(20);
  });

  it.each(protectedRoutes.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r] as const))(
    "%s rejects a missing, garbage, expired or forged token with 401",
    async (_name, r) => {
      expect((await send(r.method, r.path)).status, "no token").toBe(401);
      expect((await send(r.method, r.path, "garbage")).status, "garbage").toBe(401);
      const expired = jwt.sign({ role: "OWNER" }, env.JWT_ACCESS_SECRET, {
        subject: "0",
        expiresIn: -10,
      });
      expect((await send(r.method, r.path, expired)).status, "expired").toBe(401);
      const forged = jwt.sign({ role: "OWNER" }, "not-the-secret-not-the-secret-not-the-secret", {
        subject: "0",
      });
      expect((await send(r.method, r.path, forged)).status, "forged").toBe(401);
    },
  );

  it.each(
    roleOnly.map((r) => [`${r.method.toUpperCase()} ${r.path} (${r.auth} only)`, r] as const),
  )("%s rejects the other role with 403", async (_name, r) => {
    const wrong = r.auth === "owner" ? rider : owner;
    expect((await send(r.method, r.path, wrong)).status).toBe(403);
  });

  it("lets the right role through authentication (the request may still fail validation, never 401/403)", async () => {
    for (const r of roleOnly) {
      if (r.path === "/dev/reset") continue; // would reseed the database
      const token = r.auth === "owner" ? owner : rider;
      const status = (await send(r.method, r.path, token)).status;
      expect([401, 403], `${r.method.toUpperCase()} ${r.path} -> ${status}`).not.toContain(status);
    }
  });

  it("a deactivated rider's still-valid token stops working on every protected endpoint", async () => {
    const t = await login("rider", "nimal", "1234");
    await prisma.user.update({ where: { username: "nimal" }, data: { active: false } });
    for (const r of protectedRoutes.filter((x) => x.auth !== "owner")) {
      expect((await send(r.method, r.path, t)).status, `${r.method.toUpperCase()} ${r.path}`).toBe(
        401,
      );
    }
    await prisma.user.update({ where: { username: "nimal" }, data: { active: true } });
  });

  it("public endpoints need no token", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/logout")).status).toBe(200);
    expect((await request(app).post("/api/v1/auth/login").send({})).status).toBe(422);
    expect((await request(app).post("/api/v1/auth/refresh")).status).toBe(401);
  });
});
