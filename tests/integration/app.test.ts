import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("app foundation", () => {
  it("returns the standard envelope for unknown routes", async () => {
    const res = await request(app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, message: "Route not found", errors: [] });
  });

  it("rejects malformed JSON without leaking details", async () => {
    const res = await request(app)
      .post("/api/v1/nope")
      .set("Content-Type", "application/json")
      .send("{bad");
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("sends security headers and no x-powered-by", async () => {
    const res = await request(app).get("/api/v1/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("health reports DB state in the standard envelope", async () => {
    const res = await request(app).get("/api/v1/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty("data.db");
  });

  it("only allows configured CORS origins", async () => {
    const good = await request(app).get("/api/v1/health").set("Origin", "http://localhost:3000");
    const bad = await request(app).get("/api/v1/health").set("Origin", "http://evil.test");
    expect(good.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
