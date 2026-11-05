// The OpenAPI response shapes are hand-written copies of what the DTO mappers return. This test sends real
// requests and checks each response against the documented schema, and that the response carries no field
// the docs don't mention (zod strips unknown keys, so equality after parsing proves there are none).
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { seedDatabase } from "../../src/db/seed.js";
import { documentedResponses } from "../../src/docs/openapi.js";

const app = createApp();
const call = (m: "get" | "post" | "patch", p: string, token?: string) => {
  const r = request(app)[m](`/api/v1${p}`);
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};
const token = async (role: string, u: string, p: string) =>
  (await request(app).post("/api/v1/auth/login").send({ role, username: u, password: p })).body.data
    .accessToken as string;

function conforms(key: string, res: request.Response) {
  const schema = documentedResponses.get(key);
  expect(schema, `no documented response for ${key}`).toBeDefined();
  expect(
    res.status,
    `${key} -> ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`,
  ).toBeLessThan(300);
  const parsed = schema!.safeParse(res.body);
  expect(
    parsed.success,
    `${key}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`,
  ).toBe(true);
  if (parsed.success)
    expect(parsed.data, `${key} has fields the docs do not mention`).toEqual(res.body);
}

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "OpenAPI response shapes match real responses",
  () => {
    let owner: string;
    let kasun: string;
    beforeAll(async () => {
      await seedDatabase(prisma, "2026-10-13");
      owner = await token("owner", "owner", "owner123");
      kasun = await token("rider", "kasun", "1234");
    }, 60_000);

    it("auth", async () => {
      conforms(
        "POST /auth/login",
        await request(app)
          .post("/api/v1/auth/login")
          .send({ role: "owner", username: "owner", password: "owner123" }),
      );
      conforms("GET /auth/me", await call("get", "/auth/me", owner));
      const cookie = (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ role: "rider", username: "nimal", password: "1234" })
      ).headers["set-cookie"] as unknown as string[];
      conforms(
        "POST /auth/refresh",
        await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie[0]!.split(";")[0]!),
      );
    });

    it("bootstrap (owner and rider)", async () => {
      conforms("GET /bootstrap", await call("get", "/bootstrap", owner));
      conforms("GET /bootstrap", await call("get", "/bootstrap", kasun));
    });

    it("owner reads", async () => {
      conforms("GET /riders", await call("get", "/riders", owner));
      conforms("GET /products", await call("get", "/products", owner));
      conforms("GET /customers", await call("get", "/customers?status=OVERDUE", owner));
      conforms("GET /customers/{id}", await call("get", "/customers/C101", owner));
      conforms("GET /items", await call("get", "/items", owner));
      conforms("GET /payments", await call("get", "/payments", owner));
      conforms("GET /closings", await call("get", "/closings", owner));
      conforms("GET /notifications", await call("get", "/notifications", owner));
      conforms("GET /audit", await call("get", "/audit", owner));
      conforms("GET /shop", await call("get", "/shop", owner));
      for (const t of ["daily", "monthly", "person", "item", "rider", "overdue"])
        conforms("GET /reports/{type}", await call("get", `/reports/${t}`, owner));
      conforms("GET /health", await call("get", "/health"));
    });

    it("writes", async () => {
      conforms(
        "POST /customers",
        await call("post", "/customers", owner).send({
          name: "Doc Check",
          nic: "199912399999",
          phone: "0771110000",
          address: "1 Road",
          city: "Galle",
          lat: 6.1,
          lng: 80.2,
          riderId: "R1",
        }),
      );
      conforms(
        "POST /products",
        await call("post", "/products", owner).send({
          code: "DC-1",
          name: "Doc",
          purchase: 10,
          cash: 12,
          price: 15,
          freq: "weekly",
          amount: 5,
          period: 1,
          stock: 3,
        }),
      );
      conforms(
        "POST /products/{code}/stock",
        await call("post", "/products/DC-1/stock", owner).send({ qty: 1 }),
      );
      conforms(
        "POST /items",
        await call("post", "/items", owner).send({
          customerId: "C101",
          code: "DC-1",
          price: 15,
          freq: "weekly",
          period: 1,
          amount: 5,
          start: "2026-10-13",
        }),
      );
      conforms(
        "POST /riders",
        await call("post", "/riders", owner).send({
          name: "Doc Rider",
          phone: "0712223333",
          area: "Galle",
          username: "docrider",
          password: "abcd",
        }),
      );
      conforms(
        "PATCH /riders/{id}",
        await call("patch", "/riders/R4", owner).send({ area: "Matara" }),
      );
      conforms("PATCH /shop", await call("patch", "/shop", owner).send({ phone: "011 111 1111" }));
      conforms(
        "PATCH /customers/{id}/rider",
        await call("patch", "/customers/C101/rider", owner).send({ riderId: "R1" }),
      );
      conforms(
        "POST /notifications/read-all",
        await call("post", "/notifications/read-all", owner),
      );

      const paid = await call("post", "/payments", kasun).send({
        customerId: "C101",
        lines: [{ itemId: "IT1", amount: 12.5 }],
      });
      conforms("POST /payments", paid);
      const pid = (await call("get", "/payments", owner)).body.data.find(
        (p: { txn: string }) => p.txn === paid.body.data.lines[0].txn,
      ).id;
      conforms(
        "PATCH /payments/{id}",
        await call("patch", `/payments/${pid}`, owner).send({ amount: 13, reason: "typo fixed" }),
      );
      conforms(
        "POST /customers/{id}/extensions",
        await call("post", "/customers/C101/extensions", kasun).send({
          until: "2026-10-20",
          reason: "salary day",
        }),
      );
      conforms(
        "POST /closings",
        await call("post", "/closings", kasun).send({ cash: 0, note: "nothing banked" }),
      );
    });

    it("flags a response that has an undocumented field (the check can fail)", async () => {
      const res = await call("get", "/shop", owner);
      const tampered = {
        ...res,
        status: 200,
        body: { ...res.body, data: { ...res.body.data, secret: "x" } },
      } as request.Response;
      expect(() => conforms("GET /shop", tampered)).toThrow();
    });
  },
);
