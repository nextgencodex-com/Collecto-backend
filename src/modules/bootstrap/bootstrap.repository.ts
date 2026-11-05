import { prisma } from "../../config/database.js";
import { toPaise } from "../../domain/schedule.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

/**
 * Customers, their items and their payments. With `riderId`, only that rider's customers, and the
 * payments are those on their customers' items plus any the rider collected themselves (so a customer
 * reassigned mid-day does not make the previous rider's collections disappear). `since` limits the
 * payments to that date onwards (see loadPriorPaid for what is left out). Fixed number of queries.
 */
export async function loadCore(riderId?: number, db: Db = prisma, since?: Date) {
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
  const scope: Prisma.PaymentWhereInput = riderId
    ? { OR: [{ itemId: { in: itemIds } }, { riderId }] }
    : {};
  const payments = await db.payment.findMany({
    where: since ? { AND: [scope, { date: { gte: since } }] } : scope,
    orderBy: { id: "asc" },
  });
  return { customers, items, payments };
}

/**
 * itemId -> total paid (paise) by payments dated before `before`: what a windowed read leaves out.
 * Without `itemIds` it covers every item (no huge IN list).
 */
export async function loadPriorPaid(before: Date, itemIds?: number[], db: Db = prisma) {
  const rows = await db.payment.groupBy({
    by: ["itemId"],
    where: { ...(itemIds && { itemId: { in: itemIds } }), date: { lt: before } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.amount ? toPaise(r._sum.amount) : 0]));
}

/** Every customer and item (no payments). */
export const loadPeople = async (db: Db = prisma) => ({
  customers: await db.customer.findMany({ orderBy: { id: "asc" } }),
  items: await db.item.findMany({ orderBy: { id: "asc" } }),
});

/** Payments dated from `from` to `to` inclusive; either bound may be omitted. */
export const loadPaymentsBetween = (from?: Date, to?: Date, db: Db = prisma) =>
  db.payment.findMany({
    where:
      from || to ? { date: { ...(from && { gte: from }), ...(to && { lte: to }) } } : undefined,
    orderBy: { id: "asc" },
  });

/**
 * Everything needed to work out *today's* statuses and balances without reading the whole payment history:
 * payments dated today or later, plus each item's total of everything before today (`prior`).
 * Used by the status filter, daily closing and the overdue job.
 */
export async function loadCurrent(today: string, riderId?: number, db: Db = prisma) {
  const since = new Date(`${today}T00:00:00.000Z`);
  const core = await loadCore(riderId, db, since);
  const prior = await loadPriorPaid(
    since,
    core.items.map((i) => i.id),
    db,
  );
  return { ...core, prior };
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
