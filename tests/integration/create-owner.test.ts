import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { parseOwnerArgs } from "../../src/cli/create-owner.js";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/config/database.js";
import { createOwner } from "../../src/db/create-owner.js";
import { seedDatabase } from "../../src/db/seed.js";
import { verifyPassword } from "../../src/utils/password.js";

const input = {
  name: "Jane Doe",
  email: "Jane@Shop.lk",
  username: "Jane",
  password: "correct horse",
  shopName: "Jane's Store",
};

describe("parseOwnerArgs", () => {
  it("reads the flags and never accepts a password flag", () => {
    expect(
      parseOwnerArgs(["--name", "A B", "--email", "a@b.lk", "--username", "ab", "--shop", "S"]),
    ).toEqual({
      name: "A B",
      email: "a@b.lk",
      username: "ab",
      shopName: "S",
    });
    expect(() => parseOwnerArgs(["--password", "secret"])).toThrow();
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("createOwner (fresh install, no seed)", () => {
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "RefreshToken","Notification","AuditEntry","Closing","Extension","Payment","Item","Customer","Product","Shop","User" RESTART IDENTITY CASCADE`,
    );
  });

  it("creates the owner as id 0 with a hashed password and the shop row, and they can sign in", async () => {
    const o = await createOwner(input);
    expect(o).toEqual({ id: 0, username: "jane", email: "jane@shop.lk", name: "Jane Doe" }); // normalised
    const row = await prisma.user.findUniqueOrThrow({ where: { id: 0 } });
    expect(row.role).toBe("OWNER");
    expect(row.passwordHash).not.toContain("correct horse");
    expect(await verifyPassword(row.passwordHash, "correct horse")).toBe(true);
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: 1 } })).name).toBe("Jane's Store");

    const login = await request(createApp())
      .post("/api/v1/auth/login")
      .send({ role: "owner", username: "jane@shop.lk", password: "correct horse" });
    expect(login.status).toBe(200);
    const boot = await request(createApp())
      .get("/api/v1/bootstrap")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`);
    expect(boot.status).toBe(200);
    expect(boot.body.data.shop.name).toBe("Jane's Store");
  });

  it("refuses a second owner, weak input, and keeps an existing shop row", async () => {
    await prisma.shop.create({ data: { id: 1, name: "Restored Shop", phone: "1", address: "x" } });
    await createOwner(input);
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: 1 } })).name).toBe("Restored Shop");
    await expect(createOwner({ ...input, username: "other", email: "o@x.lk" })).rejects.toThrow(
      /already exists/,
    );
  });

  it("validates name, email, username and password length", async () => {
    await expect(createOwner({ ...input, password: "short" })).rejects.toThrow(/at least 8/);
    await expect(createOwner({ ...input, email: "not-an-email" })).rejects.toThrow(/valid email/);
    await expect(createOwner({ ...input, username: "x" })).rejects.toThrow(/Username/);
    await expect(createOwner({ ...input, name: "" })).rejects.toThrow(/name/);
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects a username or email already used by a rider", async () => {
    await seedDatabase(prisma, "2026-10-13");
    await prisma.user.delete({ where: { id: 0 } }); // owner gone, riders remain
    await expect(createOwner({ ...input, username: "kasun" })).rejects.toThrow(/already in use/);
  }, 60_000);
});
