import { beforeAll, describe, expect, it } from "vitest";
import { seedDatabase } from "../../src/db/seed.js";
import { prisma } from "../../src/config/database.js";
import { toDbDate } from "../../src/utils/dates.js";

const hasTestDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasTestDb)("database (collecto_test)", () => {
  beforeAll(async () => {
    await seedDatabase(prisma, "2026-10-13");
  }, 60_000);

  it("seeds the demo dataset", async () => {
    const [users, products, customers, items, shop, corrected] = await Promise.all([
      prisma.user.count(),
      prisma.product.count(),
      prisma.customer.count(),
      prisma.item.count(),
      prisma.shop.count(),
      prisma.payment.count({ where: { status: "CORRECTED" } }),
    ]);
    expect({ users, products, customers, items, shop, corrected }).toEqual({
      users: 4,
      products: 9,
      customers: 12,
      items: 15,
      shop: 1,
      corrected: 1,
    });
    expect(await prisma.auditEntry.count()).toBe(1);
    expect(await prisma.user.count({ where: { role: "OWNER" } })).toBe(1);
  });

  it("never seeds more paid than the item price, and sold counts match items", async () => {
    const over = await prisma.$queryRaw<{ id: number }[]>`
      SELECT i.id FROM "Item" i JOIN "Payment" p ON p."itemId" = i.id
      GROUP BY i.id, i.price HAVING SUM(p.amount) > i.price`;
    expect(over).toEqual([]);
    const p = await prisma.product.findUniqueOrThrow({ where: { code: "IR-101" } });
    expect(p.sold).toBe(await prisma.item.count({ where: { code: "IR-101" } }));
  });

  it("stores money with 2 decimals", async () => {
    const pay = await prisma.payment.create({
      data: {
        txn: "TX-TEST-DEC",
        itemId: 1,
        customerId: 101,
        riderId: 1,
        amount: "100.55",
        date: toDbDate("2026-10-13"),
        time: "10:00",
      },
    });
    expect(pay.amount.toString()).toBe("100.55");
  });

  it("enforces unique NIC, a single owner and rider fields", async () => {
    await expect(
      prisma.customer.create({
        data: {
          name: "Dup",
          nic: "198812304567",
          phone: "0771234567",
          address: "a",
          city: "c",
          riderId: 1,
          lat: 1,
          lng: 1,
          since: toDbDate("2026-10-13"),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.user.create({
        data: {
          role: "OWNER",
          username: "owner2",
          email: "o2@x.lk",
          name: "O2",
          passwordHash: "x",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.user.create({
        data: { role: "RIDER", username: "noarea", name: "N", passwordHash: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects invalid money and quantities at the database level", async () => {
    const base = {
      itemId: 1,
      customerId: 101,
      riderId: 1,
      date: toDbDate("2026-10-13"),
      time: "10:00",
    };
    await expect(
      prisma.payment.create({ data: { ...base, txn: "TX-Z", amount: "0" } }),
    ).rejects.toThrow();
    await expect(
      prisma.payment.create({ data: { ...base, txn: "TX-T", amount: "5", time: "25:99" } }),
    ).rejects.toThrow();
    await expect(
      prisma.item.create({
        data: {
          customerId: 101,
          riderId: 1,
          code: "IR-101",
          name: "x",
          price: "100",
          amount: "150",
          freq: "WEEKLY",
          period: 1,
          start: toDbDate("2026-10-13"),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.product.update({ where: { code: "IR-101" }, data: { stock: -1 } }),
    ).rejects.toThrow();
  });

  it("allows one closing per rider per day and de-duplicates notifications", async () => {
    const closing = {
      riderId: 1,
      date: toDbDate("2026-10-13"),
      time: "18:00",
      expected: "100",
      collected: "100",
      pending: "0",
      cash: "100",
      count: 1,
    };
    await prisma.closing.create({ data: closing });
    await expect(prisma.closing.create({ data: closing })).rejects.toThrow();

    const n = {
      userId: 4,
      type: "OVERDUE" as const,
      title: "t",
      text: "t",
      dedupeKey: "overdue:101:2026-10-13",
    };
    await prisma.notification.create({ data: n });
    await expect(prisma.notification.create({ data: n })).rejects.toThrow();
  });

  it("requires extension 'until' to be after its date", async () => {
    await expect(
      prisma.extension.create({
        data: {
          customerId: 101,
          riderId: 1,
          date: toDbDate("2026-10-13"),
          time: "10:00",
          until: toDbDate("2026-10-13"),
          reason: "x",
        },
      }),
    ).rejects.toThrow();
  });
});
