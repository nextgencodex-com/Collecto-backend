import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("API documentation", () => {
  it("serves an OpenAPI 3.1 document covering every endpoint group", async () => {
    const res = await request(app).get("/api/docs/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    const paths = Object.keys(res.body.paths);
    for (const p of [
      "/auth/login",
      "/auth/refresh",
      "/auth/logout",
      "/auth/me",
      "/bootstrap",
      "/riders",
      "/riders/{id}",
      "/riders/{id}/photo",
      "/riders/me/photo",
      "/shop",
      "/products",
      "/products/{code}/stock",
      "/customers",
      "/customers/{id}",
      "/customers/{id}/rider",
      "/customers/{id}/extensions",
      "/customers/{id}/photo",
      "/items",
      "/payments",
      "/payments/{id}",
      "/closings",
      "/notifications",
      "/notifications/read-all",
      "/audit",
      "/reports/{type}",
      "/health",
    ])
      expect(paths, p).toContain(p);
  });

  it("documents auth requirements, request bodies and error responses", async () => {
    const { body } = await request(app).get("/api/docs/openapi.json");
    expect(body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
    const login = body.paths["/auth/login"].post;
    expect(login.security).toEqual([]);
    expect(login.requestBody.content["application/json"].schema.properties).toHaveProperty(
      "username",
    );
    expect(login.responses).toHaveProperty("401");
    expect(login.responses).toHaveProperty("429");
    const pay = body.paths["/payments"].post;
    expect(pay.security).toEqual([{ bearerAuth: [] }]);
    expect(pay.responses).toHaveProperty("201");
    expect(pay.responses).toHaveProperty("403");
    expect(
      body.paths["/riders/{id}/photo"].put.requestBody.content["multipart/form-data"],
    ).toBeDefined();
  });

  it("serves the Swagger UI page", async () => {
    const res = await request(app).get("/api/docs/").redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
