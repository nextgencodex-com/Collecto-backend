import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  JWT_ACCESS_SECRET: "x".repeat(32),
  CORS_ORIGINS: "http://a.test, http://b.test",
};

describe("parseEnv", () => {
  it("applies defaults and splits CORS origins", () => {
    const r = parseEnv(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.PORT).toBe(4000);
      expect(r.data.COOKIE_SECURE).toBe(false);
      expect(r.data.CORS_ORIGINS).toEqual(["http://a.test", "http://b.test"]);
    }
  });

  it("rejects a short JWT secret and a missing DATABASE_URL", () => {
    expect(parseEnv({ ...base, JWT_ACCESS_SECRET: "short" }).success).toBe(false);
    expect(parseEnv({ ...base, DATABASE_URL: undefined }).success).toBe(false);
  });

  it("treats empty strings as unset", () => {
    const r = parseEnv({ ...base, APP_TODAY: "", COOKIE_DOMAIN: "" });
    expect(r.success).toBe(true);
  });
});
