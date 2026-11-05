import { prisma } from "../../config/database.js";
import type { Prisma } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient;

export const list = (db: Db = prisma) => db.product.findMany({ orderBy: { code: "asc" } });

export const find = (code: string, db: Db = prisma) => db.product.findUnique({ where: { code } });

export const create = (data: Prisma.ProductCreateInput, db: Db = prisma) =>
  db.product.create({ data });

export const addStock = (code: string, qty: number, db: Db = prisma) =>
  db.product.update({ where: { code }, data: { stock: { increment: qty } } });

/** Takes one unit out of stock and counts it as sold. Returns false if there was none left (race-safe). */
export async function takeOne(code: string, db: Db = prisma) {
  const r = await db.product.updateMany({
    where: { code, stock: { gte: 1 } },
    data: { stock: { decrement: 1 }, sold: { increment: 1 } },
  });
  return r.count === 1;
}
