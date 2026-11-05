import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";

const app = createApp();
const binary = (res: request.Response, cb: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("response compression", () => {
  let token: string;
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
    token = (
      await request(app)
        .post("/api/v1/auth/login")
        .send({ role: "owner", username: "owner", password: "owner123" })
    ).body.data.accessToken;
  }, 60_000);

  it("gzips large JSON when the client accepts it, and the body is unchanged", async () => {
    const get = (enc: string) =>
      request(app)
        .get("/api/v1/bootstrap")
        .set("Authorization", `Bearer ${token}`)
        .set("Accept-Encoding", enc)
        .buffer(true)
        .parse(binary);
    const gz = await get("gzip");
    const plain = await get("identity");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(plain.headers["content-encoding"]).toBeUndefined();
    // supertest inflates gzip itself, so equal bodies prove the encoding is lossless
    expect((gz.body as Buffer).equals(plain.body as Buffer)).toBe(true);
    expect(gz.headers.vary).toMatch(/Accept-Encoding/i);
  });

  it("leaves tiny responses alone", async () => {
    const r = await request(app).get("/api/v1/health").set("Accept-Encoding", "gzip");
    expect(r.headers["content-encoding"]).toBeUndefined();
  });
});
