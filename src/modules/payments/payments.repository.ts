import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { toPaise } from "../../domain/schedule.js";

type Db = Prisma.TransactionClient;

/**
 * Takes a row lock on the items so concurrent payments/corrections on the same item are
 * serialised; balances read afterwards inside the same transaction can then be trusted.
 */
export async function lockItems(ids: number[], db: Db) {
  if (!ids.length) return;
  await db.$queryRaw`SELECT id FROM "Item" WHERE id = ANY(${ids}::int[]) ORDER BY id FOR UPDATE`;
}

/** itemId -> total paid, in paise. */
export async function paidByItem(ids: number[], db: Db = prisma) {
  const rows = await db.payment.groupBy({
    by: ["itemId"],
    where: { itemId: { in: ids } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.itemId, r._sum.amount ? toPaise(r._sum.amount) : 0]));
}

/** Reserves `n` payment ids so transaction numbers can embed them before insert. */
export async function nextIds(n: number, db: Db): Promise<number[]> {
  const rows = await db.$queryRaw<{ id: bigint }[]>`
    SELECT nextval(pg_get_serial_sequence('"Payment"', 'id')) AS id FROM generate_series(1, ${n}::int)`;
  return rows.map((r) => Number(r.id));
}

export const createMany = (data: Prisma.PaymentUncheckedCreateInput[], db: Db) =>
  db.payment.createManyAndReturn({ data });

export const findWithItem = (id: number, db: Db = prisma) =>
  db.payment.findUnique({ where: { id }, include: { item: true, customer: true } });

export const updateAmount = (id: number, amount: string, db: Db) =>
  db.payment.update({ where: { id }, data: { amount, status: "CORRECTED" } });

export async function list(
  f: {
    /** Filter: payments collected by this rider. */
    riderId?: number;
    /** Authorisation scope for a rider: payments on their customers' items, or collected by them. */
    scopeRiderId?: number;
    customerId?: number;
    itemId?: number;
    date?: Date;
    skip: number;
    take: number;
  },
  db: Db = prisma,
) {
  const where: Prisma.PaymentWhereInput = {
    ...(f.riderId && { riderId: f.riderId }),
    ...(f.scopeRiderId && {
      OR: [{ riderId: f.scopeRiderId }, { customer: { riderId: f.scopeRiderId } }],
    }),
    ...(f.customerId && { customerId: f.customerId }),
    ...(f.itemId && { itemId: f.itemId }),
    ...(f.date && { date: f.date }),
  };
  const [rows, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: { id: "desc" }, skip: f.skip, take: f.take }),
    db.payment.count({ where }),
  ]);
  return { rows, total };
}
