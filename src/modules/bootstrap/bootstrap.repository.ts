import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

/**
 * Customers, their items and every payment on those items. With `riderId`, only that rider's
 * customers; without it, everything. Fixed number of queries regardless of data size (no N+1).
 */
export async function loadCore(riderId?: number, db: Db = prisma) {
  const customers = await db.customer.findMany({
    where: riderId ? { riderId } : undefined,
    orderBy: { id: "asc" },
  });
  const customerIds = customers.map((c) => c.id);
  const items = await db.item.findMany({
    where: riderId ? { customerId: { in: customerIds } } : undefined,
    orderBy: { id: "asc" },
  });
  const itemIds = items.map((i) => i.id);
  const payments = await db.payment.findMany({
    where: riderId ? { itemId: { in: itemIds } } : undefined,
    orderBy: { id: "asc" },
  });
  return { customers, items, payments };
}

export const loadOwnerExtras = (ownerId: number, db: Db = prisma) =>
  Promise.all([
    db.user.findMany({ where: { role: "RIDER" }, orderBy: { id: "asc" } }),
    db.product.findMany({ orderBy: { code: "asc" } }),
    db.auditEntry.findMany({
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: 500,
      include: { user: { select: { name: true } } },
    }),
    db.notification.findMany({
      where: { userId: ownerId },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: 200,
    }),
    db.closing.findMany({ orderBy: { id: "asc" } }),
    db.extension.findMany({ orderBy: { id: "asc" } }),
  ]);

export const loadRiderExtras = (riderId: number, customerIds: number[], db: Db = prisma) =>
  Promise.all([
    db.closing.findMany({ where: { riderId }, orderBy: { id: "asc" } }),
    db.extension.findMany({
      where: { customerId: { in: customerIds } },
      orderBy: { id: "asc" },
    }),
  ]);

export const loadShopAndOwner = (db: Db = prisma) =>
  Promise.all([
    db.shop.findUniqueOrThrow({ where: { id: 1 } }),
    db.user.findFirstOrThrow({ where: { role: "OWNER" } }),
  ]);

export const findUser = (id: number, db: Db = prisma) =>
  db.user.findUniqueOrThrow({ where: { id } });
