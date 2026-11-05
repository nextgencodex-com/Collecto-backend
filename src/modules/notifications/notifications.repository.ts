import { prisma } from "../../config/database.js";
import type { NotifType, Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;
export interface NewNotification {
  type: NotifType;
  title: string;
  text: string;
  /** Makes automatic alerts idempotent; omit for one-off events. */
  dedupeKey?: string;
}

/** Notifications belong to the single owner account. */
export const findOwnerId = async (db: Db = prisma) =>
  (await db.user.findFirstOrThrow({ where: { role: "OWNER" }, select: { id: true } })).id;

export async function createForOwner(n: NewNotification, db: Db = prisma) {
  const userId = await findOwnerId(db);
  return db.notification.create({ data: { userId, ...n } });
}

/** Inserts alerts, silently skipping any whose (owner, dedupeKey) already exists. Returns how many were new. */
export async function createManyForOwner(rows: NewNotification[], db: Db = prisma) {
  if (!rows.length) return 0;
  const userId = await findOwnerId(db);
  const r = await db.notification.createMany({
    data: rows.map((n) => ({ userId, ...n })),
    skipDuplicates: true,
  });
  return r.count;
}

export const listForUser = (userId: number, limit: number, db: Db = prisma) =>
  db.notification.findMany({
    where: { userId },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: limit,
  });

export const markAllRead = (userId: number, db: Db = prisma) =>
  db.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
