// The production login limiter (10 attempts / 15 min / IP), mounted on the real route.
// Own file: the limiter keeps its counters in memory for the life of the module.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("login rate limiter (real route)", () => {
  const app = createApp();
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
    process.env.ENABLE_LOGIN_LIMITER = "1";
  }, 60_000);
  afterAll(() => {
    delete process.env.ENABLE_LOGIN_LIMITER;
  });

  const attempt = (password: string, ip: string) =>
    request(app)
      .post("/api/v1/auth/login")
      .set("X-Forwarded-For", ip) // a client trying to look like many different addresses
      .send({ role: "rider", username: "kasun", password });

  it("allows 10 attempts, then answers 429 even to the correct password and to spoofed addresses", async () => {
    for (let i = 0; i < 10; i++) expect((await attempt("wrong", `10.0.0.${i}`)).status).toBe(401);
    const blocked = await attempt("1234", "10.9.9.9"); // right password, new "address"
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      message: "Too many requests, try again later",
      errors: [],
    });
    expect(blocked.headers["ratelimit-limit"]).toBe("10");
  });

  it("does not limit the other endpoints with the login limit", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
  });
});
